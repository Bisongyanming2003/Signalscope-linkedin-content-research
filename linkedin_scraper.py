#!/usr/bin/env python3
"""Fallback collector: attaches to a user-started Chrome via CDP.

It never enters credentials, saves storage state, or performs engagement actions.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import random
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from playwright.async_api import Page, async_playwright

POST_SELECTORS = [
    "div.feed-shared-update-v2", 'div[data-urn^="urn:li:activity:"]',
    'div[data-id^="urn:li:activity:"]', 'article[data-urn^="urn:li:activity:"]',
    'article[data-id^="urn:li:activity:"]',
]
TEXT_SELECTORS = [
    ".feed-shared-update-v2__description .update-components-text",
    ".feed-shared-update-v2__description .break-words", ".feed-shared-text",
    ".update-components-text", '[data-test-id="main-feed-activity-card__commentary"]',
]
DATE_LINK_SELECTORS = ['a[href*="/feed/update/urn:li:activity:"]', 'a[href*="/posts/"]',
                       'a.app-aware-link[href*="activity"]', "time a", "a time"]
DATE_SELECTORS = ["time", ".update-components-actor__sub-description", ".feed-shared-actor__sub-description"]
SEE_MORE_SELECTORS = ["button.feed-shared-inline-show-more-text__see-more-less-toggle",
                      'button[aria-label*="see more" i]', 'button[aria-label*="查看更多"]',
                      ".feed-shared-inline-show-more-text button"]
BLOCK_SELECTORS = ['form[action*="login"]', 'input[name="session_key"]', ".checkpoint__container",
                   "#captcha-internal", '[data-test-id="challenge-page"]']
PROMOTED_SELECTORS = ['.feed-shared-actor__sub-description [aria-label*="Promoted" i]',
                      '.update-components-actor__sub-description [aria-label*="Promoted" i]',
                      '[data-test-id*="promoted"]']
COUNT_SELECTORS = {
    "reactions": [".social-details-social-counts__reactions-count",
                  ".social-details-social-counts__social-proof-text",
                  '.social-details-social-counts button[aria-label*="reaction" i]',
                  '.social-details-social-counts button[aria-label*="回应"]',
                  'button[aria-label*="reaction count" i]', 'button[aria-label*="回应数量"]'],
    "comments": ['button[aria-label*="comment" i]', 'button[aria-label*="评论"]',
                 "li.social-details-social-counts__comments", 'a[href*="comments"]'],
    "reposts": ['button[aria-label*="repost" i]', 'button[aria-label*="转发"]',
                "li.social-details-social-counts__item--right-aligned", 'button[aria-label*="share" i]'],
}
MEDIA_SELECTORS = {
    "video": ["video", ".update-components-video", '[data-test-id*="video"]'],
    "document": [".update-components-document", 'iframe[src*="document"]', '[data-test-id*="document"]'],
    "carousel": [".update-components-carousel", '[data-test-id*="carousel"]', '[aria-label*="carousel" i]'],
    "image": [".update-components-image img", ".feed-shared-image img", 'img[src*="media"]'],
    "link": [".update-components-article", ".feed-shared-article", "a[href] img"],
}


def clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def split_post_text(value: str) -> tuple[str, str, str]:
    raw = clean(value)
    tags = list(dict.fromkeys(re.findall(r"#[\w\-]+", raw, re.UNICODE)))
    text = clean(re.sub(r"#[\w\-]+", " ", raw, flags=re.UNICODE))
    return raw, text, " ".join(tags)


def parse_count(raw: str) -> int | str:
    original = clean(raw)
    match = re.search(r"(\d[\d,.]*)\s*([KMB万亿])?", original, re.I)
    if not match:
        return original


def estimate_date(raw: str, collected_at: str) -> tuple[str, bool]:
    match = re.search(r"(\d+)\s*(分钟|小时|天|日|周|星期|个月|月|年|min(?:ute)?s?|h(?:our)?s?|d(?:ay)?s?|w(?:eek)?s?|mo(?:nth)?s?|y(?:ear)?s?)", raw, re.I)
    if not match:
        return "", False
    amount, unit = int(match.group(1)), match.group(2).lower()
    days = (amount / 1440 if re.search(r"分钟|min", unit) else amount / 24 if re.search(r"小时|hour|^h$", unit)
            else amount if re.search(r"天|日|day|^d$", unit) else amount * 7 if re.search(r"周|星期|week|^w$", unit)
            else amount * 30.4375 if re.search(r"个月|^月$|month|^mo$", unit) else amount * 365.25)
    value = datetime.fromisoformat(collected_at).astimezone(timezone.utc) - timedelta(days=days)
    return value.date().isoformat(), True
    try:
        number = float(match.group(1).replace(",", ""))
        unit = (match.group(2) or "").upper()
        return round(number * {"K": 1e3, "M": 1e6, "B": 1e9, "万": 1e4, "亿": 1e8}.get(unit, 1))
    except ValueError:
        return original


async def first_text(root: Any, selectors: list[str]) -> str:
    for selector in selectors:
        try:
            loc = root.locator(selector).first
            if await loc.count():
                return clean(await loc.inner_text(timeout=1000))
        except Exception:
            continue
    return ""


async def first_numeric_text(root: Any, selectors: list[str]) -> str:
    """Return a count-like text/aria value, ignoring bare action labels such as '赞'."""
    for selector in selectors:
        try:
            for loc in await root.locator(selector).all():
                visible = clean(await loc.inner_text(timeout=1000))
                aria = clean(await loc.get_attribute("aria-label"))
                for value in (visible, aria):
                    if re.search(r"\d", value):
                        return value
        except Exception:
            continue
    return ""


async def blocked(page: Page) -> str:
    for selector in BLOCK_SELECTORS:
        if await page.locator(selector).count():
            return "检测到登录、验证码或安全检查页面"
    body = (await page.locator("body").inner_text()).lower()
    phrases = ["sign in to linkedin", "security verification", "unusual activity",
               "temporarily restricted", "访问受限", "安全验证", "请输入验证码", "登录领英"]
    return "检测到登录或访问限制提示" if any(p in body for p in phrases) else ""


async def collect(page: Page, maximum: int) -> tuple[list[dict[str, Any]], list[str]]:
    errors: list[str] = []
    seen: dict[str, dict[str, Any]] = {}
    idle = 0
    previous = 0
    slug_match = re.search(r"/company/([^/]+)", page.url)
    company = clean(await first_text(page, ["main h1", "main h2", "h1"])) or (slug_match.group(1) if slug_match else "")

    while len(seen) < maximum and idle < 7:
        reason = await blocked(page)
        if reason:
            raise RuntimeError(f"{reason}；程序已停止，请勿尝试绕过限制。")
        for selector in SEE_MORE_SELECTORS:
            for button in await page.locator(selector).all():
                try:
                    label = clean(await button.inner_text()) or clean(await button.get_attribute("aria-label"))
                    if re.search(r"see more|查看更多|显示更多|…more", label, re.I) and await button.is_visible():
                        await button.click(timeout=1000)
                except Exception as exc:
                    errors.append(f"expand: {exc}")

        handles = []
        for selector in POST_SELECTORS:
            handles.extend(await page.locator(selector).all())
        for index, post in enumerate(handles):
            try:
                if any([await post.locator(s).count() for s in PROMOTED_SELECTORS]):
                    continue
                raw_text, text, hashtags = split_post_text(await first_text(post, TEXT_SELECTORS))
                date = await first_text(post, DATE_SELECTORS)
                collected_at = datetime.now(timezone.utc).isoformat()
                estimated_date, is_estimated = estimate_date(date, collected_at)
                url = ""
                for selector in DATE_LINK_SELECTORS:
                    loc = post.locator(selector).first
                    if await loc.count():
                        url = await loc.get_attribute("href") or ""
                        if url:
                            url = str(page.url).split("/company/")[0] + url if url.startswith("/") else url
                            break
                urn = await post.get_attribute("data-urn") or await post.get_attribute("data-id") or ""
                activity = re.search(r"urn:li:activity:\d+", urn)
                if not url and activity:
                    url = f"https://www.linkedin.com/feed/update/{activity.group(0)}/"
                row: dict[str, Any] = {"company": company, "collected_at": collected_at,
                                       "published_at_raw": date, "estimated_publish_date": estimated_date,
                                       "post_text_raw": raw_text, "post_text": text, "hashtags": hashtags,
                                       "post_url": url}
                for field, selectors in COUNT_SELECTORS.items():
                    row[field] = parse_count(await first_numeric_text(post, selectors))
                row["media_type"] = "text" if text else "unknown"
                for media, selectors in MEDIA_SELECTORS.items():
                    if any([await post.locator(s).count() for s in selectors]):
                        row["media_type"] = media
                        break
                key = url or f"{date}|{text[:100]}"
                if key.strip("|"):
                    seen[key] = row
            except Exception as exc:
                errors.append(f"extract[{index}]: {exc}")
        current = len(seen)
        idle = 0 if current > previous else idle + 1
        previous = current
        print(f"当前识别 {min(current, maximum)} 篇；继续滚动…")
        await page.evaluate("window.scrollTo({top: document.documentElement.scrollHeight, behavior: 'smooth'})")
        await asyncio.sleep(random.uniform(2, 4))
    return list(seen.values())[:maximum], errors


async def main() -> None:
    parser = argparse.ArgumentParser(description="连接已由用户登录的 Chrome，采集当前 LinkedIn 公司 Posts 页面")
    parser.add_argument("--cdp", default="http://127.0.0.1:9222", help="Chrome DevTools endpoint")
    parser.add_argument("--max", type=int, default=100, choices=range(1, 101), metavar="1..100")
    parser.add_argument("--output", type=Path, default=Path.cwd())
    args = parser.parse_args()
    async with async_playwright() as p:
        browser = await p.chromium.connect_over_cdp(args.cdp)
        pages = [page for context in browser.contexts for page in context.pages]
        candidates = [p for p in pages if re.search(r"linkedin\.com/company/[^/]+/posts", p.url)]
        if not candidates:
            raise SystemExit("未找到已打开的 LinkedIn 公司 Posts 页面。请先在该 Chrome 窗口中手动打开页面。")
        page = candidates[-1]
        print(f"采集页面：{page.url}")
        rows, errors = await collect(page, args.max)
        args.output.mkdir(parents=True, exist_ok=True)
        slug = re.search(r"/company/([^/]+)", page.url).group(1)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        base = args.output / f"{slug}-posts-{stamp}"
        fields = ["company", "collected_at", "published_at_raw", "estimated_publish_date",
                  "post_text_raw", "post_text", "hashtags", "post_url", "reactions", "comments", "reposts", "media_type"]
        with base.with_suffix(".csv").open("w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fields); writer.writeheader(); writer.writerows(rows)
        metadata = {"schema_version": "2.0", "source_url": page.url, "company": rows[0]["company"] if rows else "",
                    "requested_max": args.max, "collected_count": len(rows), "started_manually": True,
                    "generated_at": datetime.now(timezone.utc).isoformat(), "error_count": len(errors)}
        base.with_suffix(".json").write_text(json.dumps({"metadata": metadata, "posts": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
        missing = {field: sum(row.get(field, "") in ("", None) for row in rows) for field in fields}
        print(f"完成：{len(rows)} 篇\n缺失字段：{json.dumps(missing, ensure_ascii=False)}")
        print("错误日志：" + ("\n- " + "\n- ".join(errors) if errors else "无"))
        print(f"输出：{base.with_suffix('.csv')} 和 {base.with_suffix('.json')}")


if __name__ == "__main__":
    asyncio.run(main())

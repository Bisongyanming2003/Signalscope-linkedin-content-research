#!/usr/bin/env python3
"""Generate a self-contained local HTML content-research report."""
from __future__ import annotations

import argparse
import csv
import html
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from statistics import mean
from typing import Any


STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "our", "your", "you", "are", "was",
    "will", "have", "has", "its", "into", "more", "about", "their", "how", "what", "when", "where",
    "at", "in", "on", "of", "to", "a", "an", "is", "we", "as", "by", "be", "or", "it", "new",
    "的", "了", "和", "与", "在", "是", "为", "我们", "更多", "一个", "这", "将", "及",
}


def read_rows(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".csv":
        with path.open(encoding="utf-8-sig", newline="") as handle:
            return list(csv.DictReader(handle))
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and isinstance(data.get("posts"), list):
        return data["posts"]
    raise ValueError("输入JSON中未找到帖子数组")


def number(value: Any) -> float:
    try:
        return float(str(value).replace(",", "")) if value not in (None, "") else 0.0
    except ValueError:
        return 0.0


def score(row: dict[str, Any]) -> float:
    return number(row.get("reactions")) + number(row.get("comments")) * 2 + number(row.get("reposts")) * 3


def fmt(value: float) -> str:
    return f"{value:,.1f}" if value % 1 else f"{int(value):,}"


def keywords(rows: list[dict[str, Any]]) -> list[tuple[str, int]]:
    counts: Counter[str] = Counter()
    for row in rows:
        text = str(row.get("post_text", "")).lower()
        counts.update(tag.lower() for tag in str(row.get("hashtags", "")).split() if tag.startswith("#"))
        counts.update(tag.lower() for tag in re.findall(r"#[\w\u4e00-\u9fff-]+", text))
        words = re.findall(r"[a-z][a-z0-9-]{2,}", text)
        counts.update(word for word in words if word not in STOPWORDS and not word.startswith("http"))
    return counts.most_common(20)


def render(input_path: Path, rows: list[dict[str, Any]]) -> str:
    by_company: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_company[str(row.get("company") or "未知公司")].append(row)
    company_stats = []
    for company, items in by_company.items():
        company_stats.append({
            "company": company, "posts": len(items),
            "reactions": mean(number(r.get("reactions")) for r in items),
            "comments": mean(number(r.get("comments")) for r in items),
            "reposts": mean(number(r.get("reposts")) for r in items),
            "score": mean(score(r) for r in items),
        })
    company_stats.sort(key=lambda x: x["score"], reverse=True)
    max_score = max((x["score"] for x in company_stats), default=1) or 1
    media: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        media[str(row.get("media_type") or "unknown")].append(row)
    media_stats = sorted(((name, len(items), mean(score(r) for r in items)) for name, items in media.items()), key=lambda x: x[2], reverse=True)
    top = sorted(rows, key=score, reverse=True)[:15]
    quality_review = sum(not r.get("post_text") or not (r.get("publish_date") or r.get("estimated_publish_date") or r.get("published_at_raw")) for r in rows)
    keyword_stats = keywords(rows)

    company_rows = "".join(
        f"<tr><td>{html.escape(x['company'])}</td><td>{x['posts']}</td><td>{fmt(x['reactions'])}</td>"
        f"<td>{fmt(x['comments'])}</td><td>{fmt(x['reposts'])}</td><td>{fmt(x['score'])}</td>"
        f"<td><div class='bar'><i style='width:{x['score']/max_score*100:.1f}%'></i></div></td></tr>" for x in company_stats
    )
    media_rows = "".join(f"<tr><td>{html.escape(name)}</td><td>{count}</td><td>{fmt(avg)}</td></tr>" for name, count, avg in media_stats)
    def top_row(index: int, row: dict[str, Any]) -> str:
        return (f"<tr><td>{index}</td><td>{html.escape(str(row.get('company', '')))}</td>"
                f"<td>{html.escape(str(row.get('publish_date') or row.get('estimated_publish_date') or row.get('published_at_raw') or row.get('post_date_estimated') or row.get('post_date_raw') or row.get('post_date', '')))}</td>"
                f"<td class='post'>{html.escape(str(row.get('post_text', ''))[:260])}</td>"
                f"<td>{html.escape(str(row.get('hashtags', '')))}</td>"
                f"<td>{fmt(score(row))}</td></tr>")

    top_rows = "".join(top_row(i, row) for i, row in enumerate(top, 1))
    tags = "".join(f"<span>{html.escape(word)} <b>{count}</b></span>" for word, count in keyword_stats)
    generated = datetime.now().astimezone().strftime("%Y-%m-%d %H:%M")
    return f"""<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>
<title>LinkedIn 内容研究报告</title><style>
:root{{--ink:#17212b;--muted:#667085;--blue:#0a66c2;--bg:#f4f7f9;--card:#fff;--line:#e5e9ed}}*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}main{{max-width:1180px;margin:auto;padding:38px 24px 70px}}h1{{font-size:30px;margin:0 0 6px}}h2{{font-size:19px;margin:0 0 16px}}.sub{{color:var(--muted);margin-bottom:26px}}.cards{{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}}.card,section{{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px}}.card b{{display:block;font-size:27px;margin-top:4px}}.card small{{color:var(--muted)}}section{{margin:16px 0;overflow:auto}}table{{width:100%;border-collapse:collapse;min-width:760px}}th,td{{padding:10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}}th{{color:var(--muted);font-size:12px;text-transform:uppercase}}.bar{{width:150px;height:8px;background:#edf2f6;border-radius:5px;overflow:hidden}}.bar i{{display:block;height:100%;background:var(--blue)}}.post{{max-width:470px}}a{{color:var(--blue)}}.tags{{display:flex;flex-wrap:wrap;gap:8px}}.tags span{{padding:7px 10px;background:#eef5fb;border-radius:20px}}.note{{color:var(--muted);font-size:12px;margin-top:12px}}@media(max-width:760px){{.cards{{grid-template-columns:1fr 1fr}}}}
</style></head><body><main><h1>LinkedIn 内容研究报告</h1><div class='sub'>数据源：{html.escape(input_path.name)} · 生成时间：{generated} · 完全本地生成</div>
<div class='cards'><div class='card'><small>帖子总数</small><b>{len(rows)}</b></div><div class='card'><small>公司数量</small><b>{len(by_company)}</b></div><div class='card'><small>需复核记录</small><b>{quality_review}</b></div><div class='card'><small>媒体类型</small><b>{len(media)}</b></div></div>
<section><h2>公司横向对比</h2><table><thead><tr><th>公司</th><th>帖子</th><th>平均点赞</th><th>平均评论</th><th>平均转发</th><th>平均加权互动</th><th>相对表现</th></tr></thead><tbody>{company_rows}</tbody></table><div class='note'>加权互动 = 点赞 + 评论×2 + 转发×3，仅用于快速内容比较，不代表官方互动率。</div></section>
<section><h2>媒体类型表现</h2><table><thead><tr><th>类型</th><th>帖子数量</th><th>平均加权互动</th></tr></thead><tbody>{media_rows}</tbody></table></section>
<section><h2>高频关键词与标签</h2><div class='tags'>{tags or '暂无可统计关键词'}</div><div class='note'>英文按词频统计，中文优先统计话题标签；该结果适合发现线索，不等同于语义主题分类。</div></section>
<section><h2>表现最佳帖子 Top 15</h2><table><thead><tr><th>#</th><th>公司</th><th>日期</th><th>正文摘要</th><th>话题标签</th><th>加权互动</th></tr></thead><tbody>{top_rows}</tbody></table></section>
</main></body></html>"""


def main() -> None:
    parser = argparse.ArgumentParser(description="从LinkedIn采集CSV/JSON生成本地HTML内容研究报告")
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, default=Path("linkedin-research-report.html"))
    args = parser.parse_args()
    rows = read_rows(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(render(args.input, rows), encoding="utf-8")
    print(f"已生成报告：{args.output.resolve()}（{len(rows)} 篇）")


if __name__ == "__main__":
    main()

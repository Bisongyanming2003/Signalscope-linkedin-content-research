#!/usr/bin/env python3
"""Merge LinkedIn scraper CSV/JSON exports with cross-file deduplication."""
from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from typing import Any


FIELDS = [
    "company", "collected_at", "published_at_raw", "estimated_publish_date", "post_text_raw", "post_text",
    "hashtags", "content_topic", "post_url", "reactions", "comments", "reposts", "media_type",
]


def normalize(row: dict[str, Any], fallback_company: str = "") -> dict[str, Any]:
    result = dict(row)
    result["company"] = result.get("company") or fallback_company
    result["published_at_raw"] = result.get("published_at_raw") or result.get("post_date_raw") or result.get("post_date") or ""
    result["estimated_publish_date"] = result.get("estimated_publish_date") or result.get("published_date_estimated") or result.get("post_date_estimated") or ""
    raw = str(result.get("post_text_raw") or result.get("post_text") or "")
    tags = list(dict.fromkeys(re.findall(r"#[\w\-]+", raw, re.UNICODE)))
    result["post_text_raw"] = result.get("post_text_raw") or raw
    result["hashtags"] = result.get("hashtags") or " ".join(tags)
    result["post_text"] = re.sub(r"\s+", " ", re.sub(r"#[\w\-]+", " ", raw, flags=re.UNICODE)).strip()
    return {field: result.get(field, "") for field in FIELDS}


def read_rows(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".csv":
        fallback_company = re.sub(r"-posts-.*$", "", path.stem)
        with path.open(encoding="utf-8-sig", newline="") as handle:
            return [normalize(row, fallback_company) for row in csv.DictReader(handle)]
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if isinstance(data, list):  # Compatible with schema 1.x exports.
        return [normalize(row) for row in data]
    if isinstance(data, dict) and isinstance(data.get("posts"), list):
        fallback_company = str(data.get("metadata", {}).get("company") or "")
        return [normalize(row, fallback_company) for row in data["posts"]]
    raise ValueError("JSON中未找到帖子数组")


def key(row: dict[str, Any]) -> str:
    return str(row.get("post_url") or f"{row.get('published_at_raw') or row.get('post_date_raw') or row.get('post_date', '')}|{str(row.get('post_text', ''))[:100]}")


def main() -> None:
    parser = argparse.ArgumentParser(description="合并多个LinkedIn采集结果并去重")
    parser.add_argument("inputs", nargs="+", type=Path, help="CSV或JSON文件/目录")
    parser.add_argument("--output", type=Path, default=Path("linkedin-all-companies.csv"))
    args = parser.parse_args()
    files: list[Path] = []
    for item in args.inputs:
        files.extend(sorted(p for p in item.glob("*") if p.suffix.lower() in {".csv", ".json"}) if item.is_dir() else [item])
    merged: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    for path in files:
        try:
            for row in read_rows(path):
                row_key = key(row)
                if row_key.strip("|") and row_key not in merged:
                    merged[row_key] = row
        except Exception as exc:
            errors.append(f"{path}: {exc}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, extrasaction="ignore")
        writer.writeheader()
        for row in merged.values():
            writer.writerow({field: row.get(field, "") for field in FIELDS})
    json_path = args.output.with_suffix(".json")
    json_path.write_text(json.dumps(list(merged.values()), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"已读取 {len(files)} 个文件，合并后 {len(merged)} 篇。")
    print(f"输出：{args.output} 和 {json_path}")
    if errors:
        print("跳过的文件：\n- " + "\n- ".join(errors))


if __name__ == "__main__":
    main()

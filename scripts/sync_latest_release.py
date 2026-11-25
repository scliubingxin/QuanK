#!/usr/bin/env python3
"""把 QuanK 最新 Release 的 arm64 DMG 同步成固定名 QuanK-latest.dmg。

设计要点
- 固定地址永不变：https://github.com/scliubingxin/QuanK/releases/latest/download/QuanK-latest.dmg
- 每次运行只做一件事：确认最新 Release 上存在与当版 DMG 内容一致的固定名 asset，
  缺失 / 版本落后就下载并以 --clobber 覆盖上传；已一致则跳过，绝不重复搬运 280 MB。
- 同时把版本、大小、来源、同步时间写进 site/latest.json，供主页展示。
- 纯标准库 + gh CLI（GitHub Actions runner 预装），无第三方依赖。

用法：
    python3 scripts/sync_latest_release.py            # 正常同步
    python3 scripts/sync_latest_release.py --dry-run  # 只检查，不下载/上传/写文件
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

REPO = "scliubingxin/QuanK"
API_LATEST = f"https://api.github.com/repos/{REPO}/releases/latest"
FIXED_NAME = "QuanK-latest.dmg"
FIXED_URL = f"https://github.com/{REPO}/releases/latest/download/{FIXED_NAME}"
SOURCE_SUFFIX = "-mac-arm64.dmg"

HERE = Path(__file__).resolve().parent
SITE_DIR = HERE.parent / "site"
LATEST_JSON = SITE_DIR / "latest.json"
UA = "quank-latest-sync/1.0"


def api_get(url: str, token: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "User-Agent": UA,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def read_prev() -> dict:
    try:
        with LATEST_JSON.open(encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def download(url: str, dest: Path, token: str, expected: int) -> None:
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/octet-stream",
            "Authorization": f"Bearer {token}",
            "User-Agent": UA,
        },
    )
    with urllib.request.urlopen(req, timeout=900) as r, dest.open("wb") as f:
        shutil.copyfileobj(r, f, 4 * 1024 * 1024)
    actual = dest.stat().st_size
    if actual != expected:
        raise RuntimeError(f"下载大小不符：期望 {expected}，实际 {actual}，已放弃上传")


def upload(tag: str, path: Path, token: str) -> None:
    env = os.environ.copy()
    env["GH_TOKEN"] = token
    env["GITHUB_TOKEN"] = token
    subprocess.run(
        ["gh", "release", "upload", tag, str(path), "--clobber", "--repo", REPO],
        check=True,
        env=env,
    )


def write_meta(release: dict, source: dict) -> None:
    if not SITE_DIR.is_dir():
        raise RuntimeError(f"站点目录不存在：{SITE_DIR}")
    digest = str(source.get("digest") or "").replace("sha256:", "")
    cst = dt.timezone(dt.timedelta(hours=8))
    payload = {
        "version": release["tag_name"],
        "tag": release["tag_name"],
        "release_name": release.get("name") or release["tag_name"],
        "published_at": release.get("published_at") or "",
        "size_bytes": int(source["size"]),
        "size_mb": round(int(source["size"]) / 1048576, 1),
        "filename": FIXED_NAME,
        "download_url": FIXED_URL,
        "source_asset": source["name"],
        "sha256": digest,
        "synced_at": dt.datetime.now(cst).isoformat(timespec="seconds"),
        "fixed_uploaded": True,
    }
    tmp = LATEST_JSON.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    tmp.replace(LATEST_JSON)
    print(f"META_OK {LATEST_JSON} version={payload['version']} size_mb={payload['size_mb']}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="只检查，不下载/上传/写文件")
    args = ap.parse_args()

    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
    if not token:
        print("SYNC_FAIL 缺少 GH_TOKEN / GITHUB_TOKEN", file=sys.stderr)
        return 2

    try:
        release = api_get(API_LATEST, token)
    except (urllib.error.URLError, ValueError, KeyError) as e:
        print(f"SYNC_FAIL 读取最新 Release 失败：{e}", file=sys.stderr)
        return 3

    assets = release.get("assets") or []
    tag = release.get("tag_name") or ""
    if not tag:
        print("SYNC_FAIL 最新 Release 没有 tag_name", file=sys.stderr)
        return 3

    source = next(
        (a for a in assets if a.get("name", "").endswith(SOURCE_SUFFIX)),
        None,
    )
    if not source:
        print(f"SYNC_FAIL {tag} 下没有 *{SOURCE_SUFFIX} 资产", file=sys.stderr)
        return 4

    fixed = next((a for a in assets if a.get("name") == FIXED_NAME), None)
    src_size = int(source["size"])
    prev = read_prev()

    print(f"RELEASE {tag} source={source['name']} size={src_size}")
    print(f"FIXED_URL {FIXED_URL}")

    up_to_date = (
        fixed is not None
        and int(fixed.get("size") or 0) == src_size
        and prev.get("tag") == tag
        and prev.get("size_bytes") == src_size
        and bool(prev.get("fixed_uploaded"))
    )
    if up_to_date:
        print("SYNC_NOCHANGE 固定包已是最新版，跳过下载/上传")
        if not args.dry_run:
            write_meta(release, source)
        return 0

    reason = "固定名 asset 缺失" if fixed is None else (
        "固定名 asset 大小不符" if int(fixed.get("size") or 0) != src_size else "版本记录落后"
    )
    print(f"NEED_SYNC {reason}")

    if args.dry_run:
        print("DRY_RUN_OK 未下载、未上传、未写文件")
        return 0

    work = Path(tempfile.mkdtemp(prefix="quank-latest-"))
    try:
        target = work / FIXED_NAME
        print(f"DOWNLOADING {source['browser_download_url']}")
        download(source["browser_download_url"], target, token, src_size)
        print(f"DOWNLOAD_OK {target.stat().st_size} bytes")
        print(f"UPLOADING {tag}/{FIXED_NAME} (--clobber)")
        upload(tag, target, token)
        print("UPLOAD_OK")
        write_meta(release, source)
    except (urllib.error.URLError, OSError, RuntimeError, subprocess.CalledProcessError) as e:
        print(f"SYNC_FAIL {type(e).__name__}: {e}", file=sys.stderr)
        return 5
    finally:
        shutil.rmtree(work, ignore_errors=True)

    print(f"SYNC_OK {tag} -> {FIXED_URL}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""把 QuanK 最新 Release 的 arm64 DMG 同步成固定名 QuanK-latest.dmg。

设计要点
- 固定地址永不变：https://github.com/scliubingxin/QuanK/releases/latest/download/QuanK-latest.dmg
- 每次运行只做一件事：确认最新 Release 上存在与当版 DMG 内容一致的固定名 asset，
  缺失 / 版本落后就下载并以 --clobber 覆盖上传；已一致则跳过，绝不重复搬运 280 MB。
- 幂等完全基于 GitHub Release API 的 asset 指纹（digest + size），不依赖本地状态文件，
  因此 workflow 重跑、换 runner、并发触发都不会重复搬运。
- 主页通过 GitHub Releases API 实时读取版本与「最近同步」时间，站点不需要每天重新部署。
- 纯标准库 + gh CLI（GitHub Actions runner 预装），无第三方依赖。

用法：
    python3 scripts/sync_latest_release.py            # 正常同步
    python3 scripts/sync_latest_release.py --dry-run  # 只检查，不下载/上传
"""

from __future__ import annotations

import argparse
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
    src_digest = str(source.get("digest") or "")
    fixed_digest = str(fixed.get("digest") or "") if fixed else ""

    print(f"RELEASE {tag} source={source['name']} size={src_size} digest={src_digest[:19]}")
    print(f"FIXED_URL {FIXED_URL}")

    # 指纹以 digest 为准；digest 缺失时退回精确字节数。不读本地状态，重跑也幂等。
    same = (
        fixed is not None
        and int(fixed.get("size") or 0) == src_size
        and (not src_digest or fixed_digest == src_digest)
    )
    if same:
        print("SYNC_NOCHANGE 固定包已是最新版，跳过下载/上传")
        return 0

    reason = "固定名 asset 缺失" if fixed is None else "固定包指纹与当版 DMG 不一致"
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
    except (urllib.error.URLError, OSError, RuntimeError, subprocess.CalledProcessError) as e:
        print(f"SYNC_FAIL {type(e).__name__}: {e}", file=sys.stderr)
        return 5
    finally:
        shutil.rmtree(work, ignore_errors=True)

    print(f"SYNC_OK {tag} -> {FIXED_URL}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/bin/sh
# 渲染 DMG 安装窗口背景：background.html → background.png (660x420) + background@2x.png (1320x840)
# 用法：sh scripts/dmg-assets/render-background.sh [chrome 可执行文件路径]
# 只用 Chrome headless，不改 make-dmg.sh；两张图分别按 1x / 2x 渲染，不用放大插值。
set -eu

DIR=$(cd "$(dirname "$0")" && pwd)
CHROME=${1:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}

[ -f "$DIR/background.html" ] || { echo "missing $DIR/background.html" >&2; exit 2; }
[ -f "$DIR/logo.png" ] || { echo "missing $DIR/logo.png" >&2; exit 2; }
[ -x "$CHROME" ] || { echo "Chrome not found: $CHROME" >&2; exit 3; }

render() {
    scale=$1
    out=$2
    profile=$(mktemp -d "${TMPDIR:-/tmp}/qk-dmg-bg.XXXXXX")
    "$CHROME" \
        --headless=new \
        --disable-gpu \
        --no-first-run \
        --no-default-browser-check \
        --disable-extensions \
        --hide-scrollbars \
        --allow-file-access-from-files \
        --user-data-dir="$profile" \
        --window-size=660,420 \
        --force-device-scale-factor="$scale" \
        --virtual-time-budget=2000 \
        --screenshot="$DIR/$out" \
        "file://$DIR/background.html" >/dev/null 2>&1
    rm -rf "$profile"
    [ -f "$DIR/$out" ] || { echo "screenshot failed: $out" >&2; exit 4; }
}

render 1 background.png
render 2 background@2x.png

# 尺寸自检：必须是 660x420 和 1320x840
check() {
    file=$1; want=$2
    got=$(sips -g pixelWidth -g pixelHeight "$DIR/$file" 2>/dev/null | awk '/pixelWidth/{w=$2}/pixelHeight/{h=$2}END{print w"x"h}')
    [ "$got" = "$want" ] || { echo "size mismatch $file: got $got want $want" >&2; exit 5; }
    echo "OK $file $got"
}
check background.png 660x420
check background@2x.png 1320x840
echo "rendered: $DIR/background.png, $DIR/background@2x.png"

#!/bin/sh
# Build a drag-to-install DMG from a packaged QuanK.app.  Usage: sh make-dmg.sh <QuanK.app> <out.dmg> <bg.png> <bg@2x.png>
# The window layout (icon positions, background) is set through Finder; if Finder scripting is not allowed the DMG
# still works, only without the custom layout.
set -u
APP=$1; OUT=$2; BG=$3; BG2=$4
T() { perl -e 'alarm shift; exec @ARGV' -- "$@"; }
VOL=QuanK; WD=$(mktemp -d /tmp/quank-dmg.XXXXXX); SRC=$WD/src; RW=$WD/rw.dmg
mkdir -p "$SRC/.background"
ditto "$APP" "$SRC/QuanK.app" || exit 11
ln -s /Applications "$SRC/应用程序"
tiffutil -cathidpicheck "$BG" "$BG2" -out "$SRC/.background/background.tiff" >/dev/null 2>&1 || cp "$BG" "$SRC/.background/background.tiff"
cat > "$SRC/首次打开.command" <<'EOF'
#!/bin/sh
# 首次打开 QuanK：去掉下载隔离标记后启动（只针对「应用程序」里的 QuanK）。
A=/Applications/QuanK.app
if [ ! -d "$A" ]; then echo "请先把 QuanK 拖到「应用程序」，再双击本文件。"; read -r _; exit 1; fi
xattr -dr com.apple.quarantine "$A" 2>/dev/null
open "$A" && echo "QuanK 已启动，可以关闭此窗口。"
EOF
chmod 755 "$SRC/首次打开.command"
# HFS+ needs generous headroom for ~20k files (metadata + block rounding): 40% + 300 MB.
USED=$(du -sm "$SRC" | cut -f1); SIZE=$(( USED * 14 / 10 + 300 ))
for d in /Volumes/$VOL /Volumes/$VOL\ *; do [ -d "$d" ] && hdiutil detach -force "$d" >/dev/null 2>&1; done
T 900 hdiutil create -quiet -volname $VOL -srcfolder "$SRC" -fs HFS+ -format UDRW -size ${SIZE}m -ov "$RW" || exit 12
DEV=$(hdiutil attach -readwrite -noverify -noautoopen "$RW" | grep -E '^/dev/' | head -1 | awk '{print $1}')
MNT=/Volumes/$VOL; [ -d "$MNT" ] || exit 13
T 90 osascript <<EOF >/dev/null 2>&1 && echo "LAYOUT ok" || echo "LAYOUT skipped (Finder scripting not allowed)"
tell application "Finder"
  tell disk "$VOL"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {200, 140, 860, 584}
    set vo to the icon view options of container window
    set arrangement of vo to not arranged
    set icon size of vo to 104
    set text size of vo to 13
    set background picture of vo to file ".background:background.tiff"
    set position of item "QuanK.app" of container window to {170, 205}
    set position of item "应用程序" of container window to {490, 205}
    set position of item "首次打开.command" of container window to {330, 520}
    close
    open
    update without registering applications
    delay 2
    close
  end tell
end tell
EOF
chflags hidden "$MNT/.background" 2>/dev/null
sync; sleep 1
hdiutil detach "$DEV" -quiet || hdiutil detach -force "$DEV" -quiet
rm -f "$OUT"
T 1800 hdiutil convert -quiet "$RW" -format ULFO -o "$OUT" || exit 14
rm -rf "$WD"
T 900 hdiutil verify -quiet "$OUT" || exit 15
echo "DMG $OUT $(stat -f %z "$OUT")"

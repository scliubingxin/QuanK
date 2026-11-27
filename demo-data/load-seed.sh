#!/bin/bash
# Load the demo workspace into an ISOLATED userData dir, then launch QuankSight v1.0.6.
# NEVER points at ~/Library/Application Support/Actwill AI.
set -euo pipefail
APP="${APP:-/Users/liubingxin/wb-par/QuanK-wt/v106/desktop}"
UD="${UD:-/private/tmp/shots106-ud}"
HERE="$(cd "$(dirname "$0")" && pwd)"
pkill -9 -f "user-data-dir=${UD}" 2>/dev/null || true
sleep 1
rm -rf "$UD"; mkdir -p "$UD"
python3 - "$HERE/seed-v106.json" "$UD/workspace.json" <<'PY'
import json,sys
st=json.load(open(sys.argv[1]))
st=st.get('state',st)          # Store.load() expects the state object itself, not a wrapper
st['schema']=1
json.dump(st,open(sys.argv[2],'w'),ensure_ascii=False)
print('workspace.json written, keys=%d'%len(st))
PY
echo "launching $APP with QUANK_USER_DATA=$UD"
cd "$APP"
QUANK_SELFTEST=1 QUANK_USER_DATA="$UD" ./node_modules/.bin/electron . \
  --user-data-dir="$UD" --remote-debugging-port=9275 --remote-debugging-address=127.0.0.1

"""Main renderer working set every N minutes per renderer pid (from renderer-history)."""
import json, glob, os, sys, datetime as dt

L = os.path.expanduser('~/.t3/userdata/logs')
step = int(sys.argv[1]) if len(sys.argv) > 1 else 30
last = {}
for f in sorted(glob.glob(L + '/renderer-history.ndjson*'), key=os.path.getmtime):
    for line in open(f, encoding='utf-8', errors='replace'):
        o = json.loads(line)
        m = o.get('memory') or {}
        if o.get('surface') != 'main' or 'workingSetBytes' not in m:
            continue
        pid, ts = o['rendererPid'], o['timestampUnixMs'] / 1000
        if pid not in last or ts - last[pid] >= step * 60:
            last[pid] = ts
            print(pid, dt.datetime.fromtimestamp(ts).strftime('%m-%d %H:%M'), '%5d MB' % (m['workingSetBytes'] >> 20))

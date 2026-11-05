"""List non-subscription server spans longer than MIN ms, grouped by start second, to find shared blocks."""
import json, glob, os, sys, collections, datetime as dt

L = os.path.expanduser('~/.t3/userdata/logs')
MIN = float(sys.argv[1]) if len(sys.argv) > 1 else 10000
MAX = 120000
g = collections.defaultdict(list)
for f in glob.glob(L + '/server.trace.ndjson*'):
    for line in open(f, encoding='utf-8', errors='replace'):
        try:
            o = json.loads(line)
        except Exception:
            continue
        ms = o.get('durationMs') or 0
        n = o.get('name', '')
        if MIN < ms < MAX and 'subscribe' not in n.lower() and o.get('type') == 'effect-span':
            end = int(o['endTimeUnixNano']) // 10**9
            g[end].append((round(ms), n))
for end in sorted(g):
    names = sorted(set(n for _, n in g[end]))
    print(dt.datetime.fromtimestamp(end).strftime('%m-%d %H:%M:%S'), 'ends', len(g[end]), 'spans, max %d ms:' % max(m for m, _ in g[end]), ', '.join(names)[:260])

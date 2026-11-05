"""Find stall windows (trivial client RPC slower than THRESH ms) and the server spans that overlap them."""
import json, glob, os, sys, collections, datetime as dt

L = os.path.expanduser('~/.t3/userdata/logs')
TRIVIAL = {'server.reportClientActivity', 'preview.reportProfiles'}
THRESH = float(sys.argv[1]) if len(sys.argv) > 1 else 1000
stalls, spans = [], []
for f in glob.glob(L + '/server.trace.ndjson*'):
    for line in open(f, encoding='utf-8', errors='replace'):
        try:
            o = json.loads(line)
        except Exception:
            continue
        if 'name' not in o or 'endTimeUnixNano' not in o:
            continue
        s, e, n = int(o['startTimeUnixNano']) / 1e6, int(o['endTimeUnixNano']) / 1e6, o['name']
        if o['type'] == 'otlp-span':
            if (o.get('attributes') or {}).get('rpc.method') in TRIVIAL and o['durationMs'] > THRESH:
                stalls.append((s, e))
        elif 'subscribe' not in n.lower() and 200 < o['durationMs'] < 120000:
            spans.append((s, e, n))
stalls.sort()
merged = []
for s, e in stalls:
    if merged and s <= merged[-1][1]:
        merged[-1][1] = max(merged[-1][1], e)
    else:
        merged.append([s, e])
print('stall windows:', len(merged), 'total s %.1f' % (sum(e - s for s, e in merged) / 1000))
hit = collections.Counter()
for s, e in merged:
    for n in {n for a, b, n in spans if a < e and b > s}:
        hit[n] += 1
print('server spans overlapping stalls (windows hit):')
for n, c in hit.most_common(25):
    print('  %4d %s' % (c, n))
for s, e in merged[:12]:
    print(dt.datetime.fromtimestamp(s / 1000).strftime('%H:%M:%S'), '%.0f ms' % (e - s))

"""For each probe stall (> THRESH ms) in a lag ndjson file, list server spans (>100 ms) that overlap it."""
import json, glob, os, sys, collections, datetime as dt

L = os.path.expanduser('~/.t3/userdata/logs')
probe, THRESH = sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 200
stalls = []
for line in open(probe):
    o = json.loads(line)
    if o.get('ms', 0) > THRESH:
        stalls.append((o['at'] - o['ms'], o['at'], o['ms']))
lo, hi = min(s for s, _, _ in stalls) - 60000, max(e for _, e, _ in stalls)
spans = []
for f in glob.glob(L + '/server.trace.ndjson*'):
    if os.path.getmtime(f) * 1000 < lo:
        continue
    for line in open(f, encoding='utf-8', errors='replace'):
        try:
            o = json.loads(line)
        except Exception:
            continue
        if 'endTimeUnixNano' not in o or o.get('type') != 'effect-span' or o['durationMs'] < 100:
            continue
        s, e = int(o['startTimeUnixNano']) / 1e6, int(o['endTimeUnixNano']) / 1e6
        if e > lo and s < hi and 'subscribe' not in o['name'].lower() and o['durationMs'] < 600000:
            spans.append((s, e, o['name']))
hit = collections.Counter()
for s, e, ms in stalls:
    names = sorted({n for a, b, n in spans if a < e and b > s})
    hit.update(names)
    print(dt.datetime.fromtimestamp(e / 1000).strftime('%H:%M:%S'), '%6.0f ms' % ms, ', '.join(names)[:230])
print('\nmost frequent overlaps:', hit.most_common(12))

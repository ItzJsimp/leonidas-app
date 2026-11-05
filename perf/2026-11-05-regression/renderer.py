import json, glob, os, collections, datetime as dt

L = os.path.expanduser('~/.t3/userdata/logs')
files = sorted(glob.glob(L + '/renderer-history.ndjson*'), key=os.path.getmtime)
ev = collections.Counter()
rows = []
for f in files:
    for line in open(f, encoding='utf-8', errors='replace'):
        try:
            o = json.loads(line)
        except Exception:
            continue
        ev[o.get('event')] += 1
        rows.append(o)
print(ev)
t = lambda ms: dt.datetime.fromtimestamp(ms / 1000).strftime('%m-%d %H:%M:%S')
for o in rows:
    if o.get('event') != 'sample':
        d = {k: v for k, v in o.items() if k not in ('version', 'memory')}
        print(t(o['timestampUnixMs']), json.dumps(d)[:400])
per = collections.OrderedDict()
for o in rows:
    m = o.get('memory') or {}
    if 'workingSetBytes' not in m:
        continue
    k = (o.get('rendererPid'), o.get('surface'))
    p = per.setdefault(k, [o['timestampUnixMs'], m['workingSetBytes'], 0, 0, 0])
    p[2] = max(p[2], m['workingSetBytes'])
    p[3] = m['workingSetBytes']
    p[4] = o['timestampUnixMs']
for k, p in per.items():
    print(k, t(p[0]), '->', t(p[4]), 'first %dMB max %dMB last %dMB' % (p[1] >> 20, p[2] >> 20, p[3] >> 20))

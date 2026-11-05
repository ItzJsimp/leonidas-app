"""Aggregate server-bench A/B lines: per label and metric, median across boots, spread (min..max), and change vs first label."""
import json, sys, statistics as st, collections

path = sys.argv[1]
rows = collections.defaultdict(list)
for line in open(path, encoding='utf-8'):
    try:
        rows[json.loads(line)['label']].append(json.loads(line))
    except Exception:
        pass

def g(o, *keys):
    for k in keys:
        o = (o or {}).get(k)
    return o

METRICS = [
    ('boot ms', ('bootMs',)),
    ('startup lag p50', ('startupLag', 'p50')),
    ('startup lag p95', ('startupLag', 'p95')),
    ('startup lag max', ('startupLag', 'max')),
    ('startup >200ms count', ('startupLag', 'over200')),
    ('shell cold ms', ('shell', 'coldMs')),
    ('shell warm p50', ('shell', 'warm', 'p50')),
    ('shell warm p95', ('shell', 'warm', 'p95')),
    ('open largest cold', ('threadOpen', 'largest', 'coldMs')),
    ('open largest p50', ('threadOpen', 'largest', 'warm', 'p50')),
    ('open largest p95', ('threadOpen', 'largest', 'warm', 'p95')),
    ('open p40 p95', ('threadOpen', 'p40', 'warm', 'p95')),
    ('shell under write p50', ('shellUnderWrite', 'p50')),
    ('shell under write p95', ('shellUnderWrite', 'p95')),
    ('idle cpu s/min', ('idlePerMin', 'cpuSec')),
]
labels = list(rows)
print('boots per label:', {k: len(v) for k, v in rows.items()})
print('%-24s' % 'metric' + ''.join('%28s' % l for l in labels) + '   change')
for name, keys in METRICS:
    cells, meds = [], []
    for l in labels:
        xs = [x for x in (g(o, *keys) for o in rows[l]) if isinstance(x, (int, float))]
        if not xs:
            cells.append('%28s' % '-'); meds.append(None); continue
        m = st.median(xs)
        meds.append(m)
        cells.append('%28s' % ('%.1f (%.0f..%.0f)' % (m, min(xs), max(xs))))
    ch = ''
    if len(meds) > 1 and meds[0] and meds[-1] is not None:
        ch = '%+.0f%%' % ((meds[-1] - meds[0]) / meds[0] * 100)
    print('%-24s' % name + ''.join(cells) + '   ' + ch)

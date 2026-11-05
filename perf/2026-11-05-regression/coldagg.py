"""Per version: cold first-open long tasks and switch times (cycle 0), and warm per-switch long-task p90 (cycles 1..N)."""
import json, sys, statistics as st, collections

cold_lt, cold_ms, warm_p90, warm_max = (collections.defaultdict(list) for _ in range(4))
for path in sys.argv[1:]:
    for line in open(path, encoding='utf-8'):
        o = json.loads(line)
        v = o['label']
        for c in o.get('coldOpen', []):
            cold_lt[v].append(c['lt'])
            cold_ms[v].append(c['ms'])
        if 'perSwitchLongTask' in o:
            warm_p90[v].append(o['perSwitchLongTask']['p90'])
            warm_max[v].append(o['perSwitchLongTask']['max'])
for v in ('old', 'new'):
    q = lambda xs: 'median %.0f, max %.0f, n %d, values %s' % (st.median(xs), max(xs), len(xs), sorted(xs)) if xs else '-'
    print(v, '\n  cold open longest task ms:', q(cold_lt[v]), '\n  cold open time ms:', q(cold_ms[v]),
          '\n  warm per-switch p90 by run:', sorted(warm_p90[v]), '\n  warm per-switch max by run:', sorted(warm_max[v]))

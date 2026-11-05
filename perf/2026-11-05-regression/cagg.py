"""Aggregate client-bench lines: per label, median across runs and range, with change of last label vs first."""
import json, sys, statistics as st, collections

rows = collections.defaultdict(list)
for line in open(sys.argv[1], encoding='utf-8'):
    o = json.loads(line)
    rows[o['label']].append(o)

def g(o, path):
    for k in path.split('.'):
        o = o[int(k)] if isinstance(o, list) else (o or {}).get(k)
    return o

M = ['appStart.p50', 'appStart.p95', 'appStart.max',
     'threadSwitch.largest.p50', 'threadSwitch.largest.p95', 'threadSwitch.p10.p95', 'threadSwitch.p20.p95', 'threadSwitch.p40.p95',
     'scroll.p50', 'scroll.p95', 'scroll.worstLongTaskPerRun.p95', 'scroll.worstLongTaskPerRun.max',
     'longTasks.switchCount', 'longTasks.switchMax', 'longTasks.over200',
     'heap.first.heapMb', 'heap.last.heapMb', 'heap.first.nodes', 'heap.last.nodes', 'heap.first.listeners', 'heap.last.listeners']
labels = list(rows)
print('runs:', {k: len(v) for k, v in rows.items()})
for m in M:
    meds, cells = [], []
    for l in labels:
        xs = [x for x in (g(o, m) for o in rows[l]) if isinstance(x, (int, float))]
        meds.append(st.median(xs) if xs else None)
        cells.append('%24s' % ('%.1f (%.0f..%.0f)' % (meds[-1], min(xs), max(xs)) if xs else '-'))
    ch = '%+.0f%%' % ((meds[-1] - meds[0]) / meds[0] * 100) if meds[0] and meds[-1] is not None else ''
    print('%-34s' % m + ''.join(cells) + '  ' + ch)
for l in labels:
    for o in rows[l]:
        print(l, 'heap series', o['heap']['series'], 'listeners', o['heap']['listeners'][:1], '->', o['heap']['listeners'][-1:], 'errors', len(o['pageErrors']))

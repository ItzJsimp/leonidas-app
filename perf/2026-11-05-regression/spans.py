"""Summarize effect spans from server/desktop trace files: count, p50, p95, max, total per span name."""
import json, glob, os, sys, collections, datetime as dt

L = os.path.expanduser('~/.t3/userdata/logs')
prefix = sys.argv[1] if len(sys.argv) > 1 else 'server'
top = int(sys.argv[2]) if len(sys.argv) > 2 else 30
files = sorted(glob.glob(f'{L}/{prefix}.trace.ndjson*'), key=os.path.getmtime)
d = collections.defaultdict(list)
slow = []
errs = collections.Counter()
t0 = t1 = None
for f in files:
    for line in open(f, encoding='utf-8', errors='replace'):
        try:
            o = json.loads(line)
        except Exception:
            continue
        ms = o.get('durationMs')
        if ms is None:
            continue
        n = o.get('name')
        d[n].append(ms)
        st = int(o.get('startTimeUnixNano', 0)) // 10**6
        t0 = st if t0 is None else min(t0, st)
        t1 = st if t1 is None else max(t1, st)
        if ms > 1000:
            slow.append((st, ms, n))
        ex = o.get('exit') or {}
        if ex.get('_tag') == 'Failure':
            errs[n] += 1
fmt = lambda ms: dt.datetime.fromtimestamp(ms / 1000).strftime('%m-%d %H:%M:%S')
print('window', fmt(t0), '->', fmt(t1), 'files', len(files))
def q(a, p):
    return a[min(len(a) - 1, int(len(a) * p))]
rows = []
for n, a in d.items():
    a.sort()
    rows.append((sum(a), n, len(a), q(a, .5), q(a, .95), a[-1]))
rows.sort(reverse=True)
print('%-60s %8s %9s %9s %9s %10s' % ('span', 'count', 'p50', 'p95', 'max', 'total_s'))
for tot, n, c, p50, p95, mx in rows[:top]:
    print('%-60s %8d %9.1f %9.1f %9.0f %10.1f' % (n[:60], c, p50, p95, mx, tot / 1000))
print('\nspans >1s by name:', collections.Counter(n for _, _, n in slow).most_common(15))
print('\nfailures:', errs.most_common(15))

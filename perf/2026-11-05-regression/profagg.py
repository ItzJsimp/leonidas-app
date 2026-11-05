"""Self time per function (name + source file) from .cpuprofile files; compare two profiles side by side."""
import json, sys, collections, os

def selftime(p):
    pr = json.load(open(p, encoding='utf-8'))
    nodes = {n['id']: n for n in pr['nodes']}
    dt = collections.Counter()
    for sid, d in zip(pr['samples'], pr['timeDeltas']):
        dt[sid] += d
    out = collections.Counter()
    for nid, us in dt.items():
        cf = nodes[nid]['callFrame']
        url = os.path.basename(cf.get('url', '').split('?')[0]).rsplit('-', 1)[0] or '-'
        out['%s @ %s' % (cf['functionName'] or '(anon)', url[:40])] += us / 1000
    total = sum(dt.values()) / 1000
    return out, total

a, ta = selftime(sys.argv[1])
b, tb = selftime(sys.argv[2])
print('total ms: %.0f -> %.0f' % (ta, tb))
skip = ('(idle)', '(program)', '(garbage collector)')
print('%9s %9s %8s  %s' % ('old ms', 'new ms', 'delta', 'function @ file'))
for k in sorted(set(a) | set(b), key=lambda k: -(b[k] - a[k]))[:25]:
    print('%9.1f %9.1f %+8.1f  %s' % (a[k], b[k], b[k] - a[k], k))
print('\nGC: %.0f -> %.0f ms' % (a['(garbage collector) @ -'], b['(garbage collector) @ -']))

"""Diff two V8 heap snapshots: per (type, name) count and self size growth; then retainer edges of new objects
of the top growing groups. Prints a short summary only.  python heapdiff.py a.heapsnapshot b.heapsnapshot [top]"""
import json, sys, collections

def load(p):
    s = json.load(open(p, encoding='utf-8'))
    m = s['snapshot']['meta']
    nf, ef = m['node_fields'], m['edge_fields']
    ntypes, etypes = m['node_types'][0], m['edge_types'][0]
    return s, nf, ef, ntypes, etypes

def groups(p, want_retainers=None):
    s, nf, ef, nt, et = load(p)
    N, E, S = s['nodes'], s['edges'], s['strings']
    W, EW = len(nf), len(ef)
    it, iname, iid, isz, iec = nf.index('type'), nf.index('name'), nf.index('id'), nf.index('self_size'), nf.index('edge_count')
    ity, ina, ito = ef.index('type'), ef.index('name_or_index'), ef.index('to_node')
    cnt, size, ids = collections.Counter(), collections.Counter(), {}
    key_of = []
    for i in range(0, len(N), W):
        k = (nt[N[i + it]], S[N[i + iname]][:80])
        cnt[k] += 1
        size[k] += N[i + isz]
        key_of.append(k)
        ids[N[i + iid]] = i // W
    ret = None
    if want_retainers:
        keys, old_ids = want_retainers
        ret = collections.defaultdict(collections.Counter)
        e = 0
        for n in range(len(N) // W):
            for _ in range(N[n * W + iec]):
                to = E[e + ito] // W
                k = key_of[to]
                if k in keys and N[to * W + iid] not in old_ids:
                    t = et[E[e + ity]]
                    nm = S[E[e + ina]] if t in ('property', 'internal', 'context', 'shortcut') else '[%s]' % t
                    if t != 'weak':
                        ret[k]['%s.%s' % (key_of[n][1][:50], nm[:40])] += 1
                e += EW
    return cnt, size, set(ids), ret

top = int(sys.argv[3]) if len(sys.argv) > 3 else 15
ca, sa, ida, _ = groups(sys.argv[1])
cb, sb, _, _ = groups(sys.argv[2])
grow = sorted(((sb[k] - sa.get(k, 0), cb[k] - ca.get(k, 0), k) for k in cb), reverse=True)[:top]
print('total self size MB: %.1f -> %.1f' % (sum(sa.values()) / 2**20, sum(sb.values()) / 2**20))
print('%10s %8s  %s' % ('+bytes', '+count', 'type/name'))
for db, dc, k in grow:
    print('%10d %8d  %s %s' % (db, dc, k[0], k[1]))
keys = {k for _, _, k in grow[:6]}
_, _, _, ret = groups(sys.argv[2], (keys, ida))
for k in [k for _, _, k in grow[:6]]:
    print('\nnew', k, 'retained by:', ret[k].most_common(6))

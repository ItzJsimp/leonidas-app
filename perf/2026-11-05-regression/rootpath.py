"""Shortest path from the GC root to sample nodes (new in B) whose name starts with PREFIX. BFS over non-weak edges.
python rootpath.py a.heapsnapshot b.heapsnapshot PREFIX [samples]"""
import json, sys, random, collections

def ids_of(p):
    s = json.load(open(p, encoding='utf-8'))
    nf = s['snapshot']['meta']['node_fields']
    return {s['nodes'][i + nf.index('id')] for i in range(0, len(s['nodes']), len(nf))}

old = ids_of(sys.argv[1])
s = json.load(open(sys.argv[2], encoding='utf-8'))
m = s['snapshot']['meta']
nf, ef, nt, et = m['node_fields'], m['edge_fields'], m['node_types'][0], m['edge_types'][0]
N, E, S = s['nodes'], s['edges'], s['strings']
W, EW = len(nf), len(ef)
it, iname, iid, iec = (nf.index(x) for x in ('type', 'name', 'id', 'edge_count'))
ity, ina, ito = ef.index('type'), ef.index('name_or_index'), ef.index('to_node')
n_nodes = len(N) // W
fe = [0] * (n_nodes + 1)
for n in range(n_nodes):
    fe[n + 1] = fe[n] + N[n * W + iec] * EW
parent = [-1] * n_nodes
pedge = [None] * n_nodes
parent[0] = 0
q = collections.deque([0])
while q:
    x = q.popleft()
    for e in range(fe[x], fe[x + 1], EW):
        t = et[E[e + ity]]
        if t == 'weak':
            continue
        y = E[e + ito] // W
        if parent[y] == -1:
            parent[y] = x
            nm = S[E[e + ina]] if t in ('property', 'internal', 'context', 'shortcut') else '[%d]' % E[e + ina]
            pedge[y] = '%s:%s' % (t, nm[:40])
            q.append(y)
label = lambda n: '%s %s' % (nt[N[n * W + it]], S[N[n * W + iname]][:60])
cand = [n for n in range(n_nodes) if S[N[n * W + iname]].startswith(sys.argv[3]) and N[n * W + iid] not in old and parent[n] != -1]
print('reachable new nodes with prefix:', len(cand))
random.seed(2)
for n in random.sample(cand, min(int(sys.argv[4]) if len(sys.argv) > 4 else 3, len(cand))):
    chain, x = [], n
    while x != 0:
        chain.append('  --%s--> %s' % (pedge[x], label(x)))
        x = parent[x]
    print('\nROOT')
    print('\n'.join(reversed(chain)))

"""Client-observed RPC latency (web otlp spans) per app version and method. Also lists otlp span names."""
import json, glob, os, sys, collections

L = os.path.expanduser('~/.t3/userdata/logs')
d = collections.defaultdict(list)
names = collections.Counter()
for f in glob.glob(L + '/server.trace.ndjson*'):
    for line in open(f, encoding='utf-8', errors='replace'):
        if '"otlp-span"' not in line:
            continue
        try:
            o = json.loads(line)
        except Exception:
            continue
        names[o['name']] += 1
        if o['name'] != 'EnvironmentRpc.request':
            continue
        v = (o.get('resourceAttributes') or {}).get('service.version')
        m = (o.get('attributes') or {}).get('rpc.method')
        d[(m, v)].append(o['durationMs'])
print('otlp span names:', names.most_common(25))
q = lambda a, p: a[min(len(a) - 1, int(len(a) * p))]
rows = sorted(d.items(), key=lambda kv: -sum(kv[1]))
print('%-45s %-9s %6s %8s %8s %8s' % ('method', 'version', 'n', 'p50', 'p95', 'max'))
for (m, v), a in rows[:int(sys.argv[1]) if len(sys.argv) > 1 else 30]:
    a.sort()
    print('%-45s %-9s %6d %8.1f %8.1f %8.0f' % (m, v, len(a), q(a, .5), q(a, .95), a[-1]))

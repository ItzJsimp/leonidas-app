"""List desktop backend lifecycle spans with time, duration and key attributes."""
import json, glob, os, datetime as dt

L = os.path.expanduser('~/.t3/userdata/logs')
keep = ('desktop.backendInstance.start', 'desktop.backendInstance.stop', 'desktop.backendInstance.onReadinessFailure',
        'desktop.observability.backendOutput.writeFailure', 'desktop.observability.backendOutput.persistFailureSnapshot',
        'desktop.backendInstance.onReady')
rows = []
for f in glob.glob(L + '/desktop.trace.ndjson*'):
    for line in open(f, encoding='utf-8', errors='replace'):
        if 'backend' not in line:
            continue
        try:
            o = json.loads(line)
        except Exception:
            continue
        if o.get('name') in keep:
            rows.append(o)
rows.sort(key=lambda o: int(o['startTimeUnixNano']))
for o in rows:
    t = dt.datetime.fromtimestamp(int(o['startTimeUnixNano']) / 1e9).strftime('%m-%d %H:%M:%S')
    a = {k: v for k, v in (o.get('attributes') or {}).items()}
    ex = o.get('exit', {})
    print(t, o['name'].replace('desktop.', ''), '%.0fms' % o['durationMs'], ex.get('_tag'), json.dumps(a)[:220], json.dumps(ex.get('cause', ''))[:200])

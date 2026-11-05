#!/usr/bin/env bash
# git bisect run step: build the web bundle, run client-bench twice, judge the worst long task in thread switches.
# Exit 0 = good (median switchMax < THRESH), 1 = bad, 125 = skip (install or build failed).
THRESH=${THRESH:-240}
P=/c/Users/Jacob/AppData/Local/vite-plus/data/fallback-bin/pnpm
W=C:/lcw/perf-new
R=C:/lcw/perf-regress
sha=$(git -C $W rev-parse --short HEAD)
lock=$(sha1sum $W/pnpm-lock.yaml | cut -c1-12)
if [ "$(cat $W/.bisect-lock 2>/dev/null)" != "$lock" ]; then
  (cd $W && $P install --frozen-lockfile > $R/bisect-install.log 2>&1) || { echo "$sha skip install" >> $R/bisect.log; exit 125; }
  echo "$lock" > $W/.bisect-lock
fi
(cd $W/apps/web && $P --config.verify-deps-before-run=false run build > $R/bisect-build.log 2>&1) || { echo "$sha skip build" >> $R/bisect.log; exit 125; }
vals=()
for i in 1 2; do
  out=$(timeout 1500 node $R/client-bench.mjs --root $W --label "b-$sha" --cycles 10 --out $R/bisect.jsonl 2>>$R/bisect-bench.err) || { echo "$sha skip bench" >> $R/bisect.log; exit 125; }
  vals+=("$(echo "$out" | python -c "import json,sys; print(json.loads(sys.stdin.read())[\"perSwitchLongTask\"][\"p90\"])")")
done
med=$(python -c "import sys; v=sorted(map(float,sys.argv[1:])); print((v[0]+v[1])/2)" "${vals[@]}")
verdict=$(python -c "print('good' if $med < $THRESH else 'bad')")
echo "$sha switchMax ${vals[*]} median $med -> $verdict" >> $R/bisect.log
[ "$verdict" = good ]

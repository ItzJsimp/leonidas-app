// Live event-loop probe: time a trivial server endpoint every intervalMs. Latency of a no-work route ~= loop lag.
// node lagprobe.mjs <port> <seconds> <outfile>
import { appendFileSync, writeFileSync } from "node:fs";
const [port = "3773", seconds = "180", out = "lag.ndjson"] = process.argv.slice(2);
const url = `http://127.0.0.1:${port}/.well-known/t3/environment`;
writeFileSync(out, "");
const end = Date.now() + Number(seconds) * 1000;
const xs = [];
while (Date.now() < end) {
  const t = performance.now();
  try {
    await (await fetch(url, { signal: AbortSignal.timeout(30000) })).arrayBuffer();
  } catch (e) {
    appendFileSync(out, JSON.stringify({ at: Date.now(), err: String(e) }) + "\n");
  }
  const ms = performance.now() - t;
  xs.push(ms);
  appendFileSync(out, JSON.stringify({ at: Date.now(), ms: +ms.toFixed(1) }) + "\n");
  await new Promise((r) => setTimeout(r, 100));
}
xs.sort((a, b) => a - b);
const q = (p) => xs[Math.min(xs.length - 1, Math.floor(xs.length * p))].toFixed(1);
console.log(
  JSON.stringify({
    n: xs.length,
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    max: xs.at(-1).toFixed(1),
    over200: xs.filter((x) => x > 200).length,
  }),
);

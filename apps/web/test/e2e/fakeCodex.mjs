// A stand-in `codex` binary for browser end-to-end tests. It answers the status probe and
// replays a recorded app-server transcript, so a turn gets a real, fixed reply.
// shortcut: replies by request method, not by strict order; enough for one turn per thread.
import * as NodeFS from "node:fs";
import * as NodeReadline from "node:readline";

if (process.argv.includes("--version")) {
  process.stdout.write("codex-cli 0.156.1\n");
  process.exit(0);
}

const transcript = NodeFS.readFileSync(process.env.LEONIDAS_E2E_CODEX_TRANSCRIPT, "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));

// Frames the recorded app-server sent after each request, keyed by the request method.
const repliesByMethod = new Map();
let current = null;
for (const record of transcript) {
  if (record.type === "expect_outbound" && record.frame.id !== undefined) {
    current = { requestId: record.frame.id, frames: [] };
    repliesByMethod.set(record.frame.method, current);
  } else if (record.type === "expect_outbound") {
    current = null;
  } else if (record.type === "emit_inbound" && current !== null) {
    current.frames.push(record.frame);
  }
}

const model = (id, isDefault) => ({
  id,
  model: id,
  displayName: id,
  description: "",
  hidden: false,
  isDefault,
  defaultReasoningEffort: "medium",
  supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "" }],
  serviceTiers: [],
});
const probeResults = {
  initialize: {
    userAgent: "codex/0.156.1",
    codexHome: process.env.CODEX_HOME ?? "",
    platformFamily: "unix",
    platformOs: "linux",
  },
  "account/read": {
    account: { type: "chatgpt", email: "e2e@example.com", planType: "plus" },
    requiresOpenaiAuth: false,
  },
  "skills/list": { data: [] },
  "model/list": { data: [model("gpt-6-luna", true)], nextCursor: null },
};

const write = (frame) => process.stdout.write(`${JSON.stringify(frame)}\n`);

NodeReadline.createInterface({ input: process.stdin }).on("line", (line) => {
  const { id, method, params } = JSON.parse(line);
  if (id === undefined) return;
  const recorded = repliesByMethod.get(method);
  if (recorded !== undefined && method !== "initialize") {
    const workspace = JSON.stringify(params?.cwd ?? process.cwd());
    for (const frame of recorded.frames) {
      const text = JSON.stringify(frame).replaceAll('"<workspace>"', workspace);
      const out = JSON.parse(text);
      write(out.id === recorded.requestId ? { ...out, id } : out);
    }
  } else if (method === "feedback/upload") {
    write({ id, result: { threadId: params.threadId } });
  } else if (method in probeResults) {
    write({ id, result: probeResults[method] });
  } else {
    write({ id, error: { code: -32601, message: `unsupported in e2e fake: ${method}` } });
  }
});

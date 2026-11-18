var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/relay.ts
var TYPES = ["bug", "idea", "suggestion"];
var MAX_BODY_CHARS = 3e6;
var MAX_TEXT_CHARS = 4e3;
var MAX_SCREENSHOT_CHARS = 2e6;
var PER_INSTALL_PER_MINUTE = 5;
var PER_INSTALL_PER_DAY = 25;
var PER_IP_PER_HOUR = 40;
var CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
var CONTEXT_KEYS = [
  "appVersion",
  "platform",
  "route",
  "source",
  "submittedAt",
  "provider",
  "model",
  "lastError",
];
function clip(value, max) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}
__name(clip, "clip");
function parseReport(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw;
  const installId = clip(body.installId, 64);
  const text = clip(body.text, MAX_TEXT_CHARS);
  const type = TYPES.find((candidate) => candidate === body.type);
  if (!installId || !/^[0-9a-f-]{8,64}$/i.test(installId) || !text || !type) return null;
  const context = {};
  const rawContext = typeof body.context === "object" && body.context ? body.context : {};
  for (const key of CONTEXT_KEYS) {
    const value = clip(rawContext[key], key === "lastError" ? 500 : 120);
    if (value) context[key] = value;
  }
  let screenshot = null;
  if (typeof body.screenshot === "string" && body.screenshot.length <= MAX_SCREENSHOT_CHARS) {
    const match2 = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body.screenshot);
    if (match2?.[1] && match2[2]) {
      screenshot = { ext: match2[1] === "jpeg" ? "jpg" : match2[1], base64: match2[2] };
    }
  }
  return { installId, name: clip(body.name, 80), type, text, screenshot, context };
}
__name(parseReport, "parseReport");
function defang(text) {
  return text.replace(/@/g, "@\u200B");
}
__name(defang, "defang");
function buildIssue(report, screenshotUrl) {
  const firstLine = report.text.split(/\r?\n/, 1)[0] ?? report.text;
  const title = `[${report.type}] ${defang(firstLine).slice(0, 70)}`;
  const rows = Object.entries(report.context).map(
    ([key, value]) => `| ${key} | ${defang(value).replace(/[|\r\n]+/g, " ")} |`,
  );
  const body = [
    defang(report.text),
    ...(screenshotUrl ? ["", `![screenshot](${screenshotUrl})`] : []),
    "",
    "| Context | |",
    "| --- | --- |",
    `| reporter | ${report.name ? defang(report.name).replace(/[|\r\n]+/g, " ") : "anonymous"} |`,
    `| install | ${report.installId.slice(0, 8)} |`,
    ...rows,
    "",
    `<!-- feedback-install:${report.installId} -->`,
  ].join("\n");
  return { title, body, labels: [report.type, "needs-triage"] };
}
__name(buildIssue, "buildIssue");
async function overLimit(kv, key, limit, ttlSeconds) {
  const count2 = Number((await kv.get(key)) ?? "0");
  if (count2 >= limit) return true;
  await kv.put(key, String(count2 + 1), { expirationTtl: ttlSeconds });
  return false;
}
__name(overLimit, "overLimit");
function reply(status, body) {
  return new Response(body === void 0 ? null : JSON.stringify(body), {
    status,
    headers: { ...CORS, ...(body === void 0 ? {} : { "content-type": "application/json" }) },
  });
}
__name(reply, "reply");
async function github(env, path, init) {
  return fetch(`https://api.github.com/repos/${env.GITHUB_REPO}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "user-agent": "leonidas-feedback-relay",
      "content-type": "application/json",
    },
  });
}
__name(github, "github");
async function handleRequest(request, env) {
  if (request.method === "OPTIONS") return reply(204);
  const url = new URL(request.url);
  if (request.method !== "POST" || url.pathname !== "/feedback") return reply(404);
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return reply(413);
  let report;
  try {
    report = parseReport(JSON.parse(text));
  } catch {
    report = null;
  }
  if (!report) return reply(400, { ok: false });
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const limited =
    (await overLimit(env.RATE, `m:${report.installId}`, PER_INSTALL_PER_MINUTE, 60)) ||
    (await overLimit(env.RATE, `d:${report.installId}`, PER_INSTALL_PER_DAY, 86400)) ||
    (await overLimit(env.RATE, `ip:${ip}`, PER_IP_PER_HOUR, 3600));
  if (limited) return reply(429, { ok: false });
  let screenshotUrl = null;
  if (report.screenshot) {
    const path = `screenshots/${crypto.randomUUID()}.${report.screenshot.ext}`;
    const upload = await github(env, `/contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({ message: "feedback screenshot", content: report.screenshot.base64 }),
    });
    if (upload.ok)
      screenshotUrl = `https://github.com/${env.GITHUB_REPO}/blob/main/${path}?raw=true`;
  }
  const issue = await github(env, "/issues", {
    method: "POST",
    body: JSON.stringify(buildIssue(report, screenshotUrl)),
  });
  if (!issue.ok) {
    console.error("github issue failed", issue.status, (await issue.text()).slice(0, 300));
    return reply(502, { ok: false });
  }
  const created = await issue.json();
  return reply(200, { ok: true, issue: created.number ?? null });
}
__name(handleRequest, "handleRequest");

// src/community.ts
var COMMUNITY_PATHS = /^\/(stuck|fixed|board|admin)(\/|$)/;
var MAX_MEMBERS = 20;
var MAX_FIXED_LOOKUP = 20;
var CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var MAX_COUNT = 1e8;
var HEX32 = /^[0-9a-f]{32}$/;
var VERSION = /^[0-9A-Za-z.+-]{1,32}$/;
var TOKEN = /^[A-Za-z0-9._-]{1,40}$/;
var ERROR_CODE = /^[A-Za-z0-9._-]{1,40}$/;
var SCREEN = /^[a-z0-9/_-]{1,60}$/;
var CODE = /^[A-Z2-9]{8}$/;
var WEEK = /^\d{4}-\d{2}-\d{2}$/;
var NICKNAME = /^[\p{L}\p{N} _.-]{1,20}$/u;
function isCommunityPath(pathname) {
  return COMMUNITY_PATHS.test(pathname);
}
__name(isCommunityPath, "isCommunityPath");
function match(value, pattern) {
  return typeof value === "string" && pattern.test(value) ? value : null;
}
__name(match, "match");
function optional(value, pattern) {
  if (value === void 0 || value === null) return null;
  return match(value, pattern) ?? void 0;
}
__name(optional, "optional");
function parseStuck(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw;
  const id = match(body.reportId, HEX32);
  const appVersion = match(body.appVersion, VERSION);
  const platform = match(body.platform, TOKEN);
  const screen = match(body.screen, SCREEN);
  const lastAction = match(body.lastAction, TOKEN);
  const errorCode = optional(body.errorCode, ERROR_CODE);
  const provider = optional(body.provider, TOKEN);
  const source = body.source === "voice" ? "voice" : body.source === "button" ? "button" : null;
  if (!id || !appVersion || !platform || !screen || !lastAction || !source) return null;
  if (errorCode === void 0 || provider === void 0) return null;
  return { id, appVersion, platform, screen, lastAction, errorCode, provider, source };
}
__name(parseStuck, "parseStuck");
function buildStuckIssue(report) {
  const what = report.errorCode ?? report.lastAction;
  const rows = [
    ["screen", report.screen],
    ["last action", report.lastAction],
    ["error", report.errorCode ?? "none"],
    ["provider", report.provider ?? "none"],
    ["version", report.appVersion],
    ["platform", report.platform],
    ["trigger", report.source],
  ].map(([key, value]) => `| ${key} | ${value} |`);
  return {
    title: `[stuck] ${report.screen}: ${what}`,
    body: [
      "A user pressed I'm stuck. This report holds app state only, never their text.",
      "",
      "| State | |",
      "| --- | --- |",
      ...rows,
      "",
      `<!-- stuck-report:${report.id} -->`,
    ].join("\n"),
    labels: ["stuck", "needs-triage"],
  };
}
__name(buildStuckIssue, "buildStuckIssue");
async function readJson(request) {
  try {
    const text = await request.text();
    return text.length > 2e4 ? null : JSON.parse(text);
  } catch {
    return null;
  }
}
__name(readJson, "readJson");
function count(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_COUNT
    ? value
    : null;
}
__name(count, "count");
function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}
__name(newCode, "newCode");
function currentWeek(now) {
  const day = new Date(now);
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(now - sinceMonday * 864e5).toISOString().slice(0, 10);
}
__name(currentWeek, "currentWeek");
async function postStuck(request, env, ip) {
  const report = parseStuck(await readJson(request));
  if (!report) return reply(400, { ok: false });
  if (await overLimit(env.RATE, `stuck:${ip}`, 20, 3600)) return reply(429, { ok: false });
  await env.DB.prepare(
    "INSERT OR IGNORE INTO stuck_reports (id, created_at, app_version, platform, screen, last_action, error_code, provider, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      report.id,
      Date.now(),
      report.appVersion,
      report.platform,
      report.screen,
      report.lastAction,
      report.errorCode,
      report.provider,
      report.source,
    )
    .run();
  const row = await env.DB.prepare("SELECT issue_number FROM stuck_reports WHERE id = ?")
    .bind(report.id)
    .first();
  if (row?.issue_number) return reply(200, { ok: true, issue: row.issue_number });
  const issue = await github(env, "/issues", {
    method: "POST",
    body: JSON.stringify(buildStuckIssue(report)),
  });
  if (!issue.ok) {
    console.error("github stuck issue failed", issue.status, (await issue.text()).slice(0, 300));
    return reply(502, { ok: false });
  }
  const created = await issue.json();
  if (created.number) {
    await env.DB.prepare("UPDATE stuck_reports SET issue_number = ? WHERE id = ?")
      .bind(created.number, report.id)
      .run();
  }
  return reply(200, { ok: true, issue: created.number ?? null });
}
__name(postStuck, "postStuck");
async function getFixed(url, env) {
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .filter((id) => HEX32.test(id))
    .slice(0, MAX_FIXED_LOOKUP);
  if (ids.length === 0) return reply(200, { fixed: [] });
  const marks = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT id, fixed_in FROM stuck_reports WHERE fixed_in IS NOT NULL AND id IN (${marks})`,
  )
    .bind(...ids)
    .all();
  return reply(200, { fixed: results.map((row) => ({ id: row.id, version: row.fixed_in })) });
}
__name(getFixed, "getFixed");
async function postAdminFixed(request, env) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return reply(401, { ok: false });
  const body = await readJson(request);
  const issue = count(body?.issue);
  const version = match(body?.version, VERSION);
  if (!issue || !version) return reply(400, { ok: false });
  await env.DB.prepare(
    "UPDATE stuck_reports SET fixed_in = ?, fixed_at = ? WHERE issue_number = ? AND fixed_in IS NULL",
  )
    .bind(version, Date.now(), issue)
    .run();
  return reply(200, { ok: true });
}
__name(postAdminFixed, "postAdminFixed");
async function memberCount(env, code) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE code = ?")
    .bind(code)
    .first();
  return row?.n ?? 0;
}
__name(memberCount, "memberCount");
async function isMember(env, code, boardId) {
  const row = await env.DB.prepare("SELECT 1 AS ok FROM members WHERE code = ? AND board_id = ?")
    .bind(code, boardId)
    .first();
  return row !== null;
}
__name(isMember, "isMember");
async function boardCreate(env, ip) {
  if (await overLimit(env.RATE, `board:${ip}`, 5, 86400)) return reply(429, { ok: false });
  const code = newCode();
  await env.DB.prepare("INSERT INTO boards (code, created_at) VALUES (?, ?)")
    .bind(code, Date.now())
    .run();
  return reply(200, { ok: true, code });
}
__name(boardCreate, "boardCreate");
async function boardJoin(request, env) {
  const body = await readJson(request);
  const code = match(body?.code, CODE);
  const boardId = match(body?.boardId, HEX32);
  const nickname = optional(body?.nickname, NICKNAME);
  if (!code || !boardId || nickname === void 0) return reply(400, { ok: false });
  const board = await env.DB.prepare("SELECT code FROM boards WHERE code = ?").bind(code).first();
  if (!board) return reply(404, { ok: false });
  const already = await isMember(env, code, boardId);
  if (!already && (await memberCount(env, code)) >= MAX_MEMBERS) return reply(409, { ok: false });
  await env.DB.prepare(
    "INSERT INTO members (code, board_id, nickname, joined_at) VALUES (?, ?, ?, ?) ON CONFLICT (code, board_id) DO UPDATE SET nickname = excluded.nickname",
  )
    .bind(code, boardId, nickname, Date.now())
    .run();
  return reply(200, { ok: true });
}
__name(boardJoin, "boardJoin");
async function boardScore(request, env) {
  const body = await readJson(request);
  const code = match(body?.code, CODE);
  const boardId = match(body?.boardId, HEX32);
  const week = match(body?.week, WEEK);
  const xp = count(body?.xp);
  const tokens = count(body?.tokens);
  const skills = count(body?.skills);
  const tasks = count(body?.tasks);
  if (!code || !boardId || !week || xp === null || tokens === null)
    return reply(400, { ok: false });
  if (skills === null || tasks === null) return reply(400, { ok: false });
  if (!(await isMember(env, code, boardId))) return reply(403, { ok: false });
  await env.DB.prepare(
    "INSERT INTO scores (code, board_id, week, xp, tokens, skills, tasks, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (code, board_id, week) DO UPDATE SET xp = excluded.xp, tokens = excluded.tokens, skills = excluded.skills, tasks = excluded.tasks, updated_at = excluded.updated_at",
  )
    .bind(code, boardId, week, xp, tokens, skills, tasks, Date.now())
    .run();
  return reply(200, { ok: true });
}
__name(boardScore, "boardScore");
async function boardGet(url, env, code) {
  const me = match(url.searchParams.get("me"), HEX32);
  const week = match(url.searchParams.get("week"), WEEK) ?? currentWeek(Date.now());
  const { results: members } = await env.DB.prepare(
    "SELECT board_id, nickname FROM members WHERE code = ? ORDER BY joined_at, rowid",
  )
    .bind(code)
    .all();
  if (members.length === 0) return reply(404, { ok: false });
  if (!me || !members.some((member) => member.board_id === me)) return reply(403, { ok: false });
  const { results: scores } = await env.DB.prepare(
    "SELECT board_id, xp, tokens, skills, tasks FROM scores WHERE code = ? AND week = ?",
  )
    .bind(code, week)
    .all();
  const byId = new Map(scores.map((score) => [score.board_id, score]));
  const rows = members.map((member, index) => {
    const score = byId.get(member.board_id);
    return {
      name: member.nickname ?? `Friend ${index + 1}`,
      isMe: member.board_id === me,
      xp: score?.xp ?? 0,
      tokens: score?.tokens ?? 0,
      skills: score?.skills ?? 0,
      tasks: score?.tasks ?? 0,
    };
  });
  rows.sort((a, b) => b.xp - a.xp);
  return reply(200, { ok: true, week, rows });
}
__name(boardGet, "boardGet");
async function boardLeave(request, env) {
  const body = await readJson(request);
  const code = match(body?.code, CODE);
  const boardId = match(body?.boardId, HEX32);
  if (!code || !boardId) return reply(400, { ok: false });
  await env.DB.prepare("DELETE FROM scores WHERE code = ? AND board_id = ?")
    .bind(code, boardId)
    .run();
  await env.DB.prepare("DELETE FROM members WHERE code = ? AND board_id = ?")
    .bind(code, boardId)
    .run();
  return reply(200, { ok: true });
}
__name(boardLeave, "boardLeave");
async function handleCommunity(request, env) {
  if (request.method === "OPTIONS") return reply(204);
  const url = new URL(request.url);
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const route = `${request.method} ${url.pathname}`;
  if (route === "POST /stuck") return postStuck(request, env, ip);
  if (route === "GET /fixed") return getFixed(url, env);
  if (route === "POST /admin/fixed") return postAdminFixed(request, env);
  if (route === "POST /board") return boardCreate(env, ip);
  if (route === "POST /board/join") return boardJoin(request, env);
  if (route === "POST /board/score") return boardScore(request, env);
  if (route === "POST /board/leave") return boardLeave(request, env);
  const board = /^\/board\/([A-Z2-9]{8})$/.exec(url.pathname);
  if (request.method === "GET" && board?.[1]) return boardGet(url, env, board[1]);
  return reply(404);
}
__name(handleCommunity, "handleCommunity");

// src/index.ts
var src_default = {
  fetch: /* @__PURE__ */ __name(
    (request, env) =>
      isCommunityPath(new URL(request.url).pathname)
        ? handleCommunity(request, env)
        : handleRequest(request, env),
    "fetch",
  ),
};

// ../../../../Users/Jacob/AppData/Local/npm-cache/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {}
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../Users/Jacob/AppData/Local/npm-cache/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause),
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true",
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-Z4mVE9/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default,
];
var middleware_insertion_facade_default = src_default;

// ../../../../Users/Jacob/AppData/Local/npm-cache/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    },
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware,
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-Z4mVE9/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (
    __INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 ||
    __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0
  ) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function (request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function (type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {},
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    },
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (
    __INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 ||
    __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0
  ) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {},
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher,
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export { __INTERNAL_WRANGLER_MIDDLEWARE__, middleware_loader_entry_default as default };
//# sourceMappingURL=index.js.map

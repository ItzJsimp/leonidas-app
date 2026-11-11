import { assert, describe, it } from "@effect/vitest";

import {
  findCallbackPort,
  parseLsofListeners,
  parseNetstatListeners,
  parseProcessRows,
  withAutomaticCallback,
} from "./ClaudeCallbackPort.ts";

// URL shape taken from the real `claude auth login --claudeai` output (2.1.322).
const manualUrl =
  "https://claude.com/cai/oauth/authorize?code=true&client_id=test-client&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=user%3Ainference&code_challenge=abc&code_challenge_method=S256&state=xyz";

describe("withAutomaticCallback", () => {
  it("swaps the code page for the local listener and keeps every other parameter", () => {
    const url = new URL(withAutomaticCallback(manualUrl, 58807));
    assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:58807/callback");
    assert.equal(url.searchParams.get("state"), "xyz");
    assert.equal(url.searchParams.get("code_challenge"), "abc");
    assert.equal(url.host, "claude.com");
  });
});

describe("parsers", () => {
  it("reads process rows", () => {
    assert.deepEqual(parseProcessRows("  10 1\r\n20 10\nnot a row\n"), [
      { pid: 10, ppid: 1 },
      { pid: 20, ppid: 10 },
    ]);
  });

  it("reads only loopback listeners from netstat", () => {
    const out = [
      "  Proto  Local Address          Foreign Address        State           PID",
      "  TCP    127.0.0.1:58807        0.0.0.0:0              LISTENING       4040",
      "  TCP    0.0.0.0:445            0.0.0.0:0              LISTENING       4",
      "  TCP    127.0.0.1:50000        127.0.0.1:58807        ESTABLISHED     77",
    ].join("\r\n");
    assert.deepEqual(parseNetstatListeners(out), [{ pid: 4040, port: 58807 }]);
  });

  it("reads only loopback listeners from lsof", () => {
    const out = "p4040\nn127.0.0.1:58807\np9\nn*:5000\nn[::1]:6000\n";
    assert.deepEqual(parseLsofListeners(out), [
      { pid: 4040, port: 58807 },
      { pid: 9, port: 6000 },
    ]);
  });
});

describe("findCallbackPort", () => {
  const rows = [
    { pid: 2, ppid: 1 }, // shim started by Leonidas
    { pid: 3, ppid: 2 }, // the real CLI
    { pid: 8, ppid: 1 }, // unrelated process
  ];

  it("finds the port of a grandchild", () => {
    assert.equal(findCallbackPort(rows, [{ pid: 3, port: 58807 }], 2), 58807);
  });

  it("ignores listeners outside the process tree", () => {
    assert.isNull(findCallbackPort(rows, [{ pid: 8, port: 5000 }], 2));
  });

  it("gives up when the tree listens on more than one port", () => {
    const listeners = [
      { pid: 3, port: 58807 },
      { pid: 3, port: 58808 },
    ];
    assert.isNull(findCallbackPort(rows, listeners, 2));
  });
});

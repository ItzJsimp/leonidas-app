import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { AccountLoadBadge, accountLoadLabel } from "./AccountLoadBadge";

describe("accountLoadLabel", () => {
  it("names open chats and how many run", () => {
    expect(accountLoadLabel({ chats: 5, running: 2 })).toBe("5 open chats, 2 running");
    expect(accountLoadLabel({ chats: 1, running: 0 })).toBe("1 open chat");
    expect(accountLoadLabel({ chats: 0, running: 0 })).toBe("");
  });
});

describe("AccountLoadBadge", () => {
  it("shows nothing when the account has no open chats", () => {
    expect(renderToStaticMarkup(<AccountLoadBadge chats={0} running={0} />)).toBe("");
  });

  it("is green while an agent runs and grey when every chat is quiet", () => {
    const running = renderToStaticMarkup(<AccountLoadBadge chats={5} running={2} />);
    const quiet = renderToStaticMarkup(<AccountLoadBadge chats={3} running={0} />);
    expect(running).toContain("bg-success");
    expect(running).toContain(">5<");
    expect(quiet).not.toContain("bg-success");
    expect(quiet).toContain(">3<");
  });

  it("caps a long count at 9+", () => {
    expect(renderToStaticMarkup(<AccountLoadBadge chats={12} running={0} />)).toContain(">9+<");
  });
});

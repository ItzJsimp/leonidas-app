// End to end: the real app, the real server and a replayed Codex turn. See test/e2e/serverSetup.ts.
import { createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { E2E_AUTH_TOKEN, E2E_TURN_REPLY } from "../../test/e2e/config";
import { render } from "../../test/render";
import { AppRoot } from "../AppRoot";
import { getRouter } from "../router";
import "../index.css";

const E2E_TIMEOUT_MS = 90_000;

async function waitForElement<T extends Element>(selector: string): Promise<T> {
  const deadline = Date.now() + E2E_TIMEOUT_MS;
  for (;;) {
    const element = document.querySelector<T>(selector);
    if (element !== null) return element;
    if (Date.now() > deadline) throw new Error(`No element matches ${selector}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

describe("ChatView send (e2e)", () => {
  it(
    "sends a message and shows the provider's reply",
    async () => {
      const pairing = await fetch("/api/auth/browser-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential: E2E_AUTH_TOKEN }),
      });
      expect(pairing.ok).toBe(true);

      // A finished first run, so no setup dialog covers the chat.
      localStorage.setItem(
        "t3code:client-settings:v1",
        JSON.stringify({ onboardingCompletedAt: "2026-01-01T00:00:00.000Z" }),
      );
      await page.viewport(1280, 800);
      const router = getRouter(createMemoryHistory({ initialEntries: ["/"] }));
      await using _screen = await render(<AppRoot router={router} />, { router: false });

      const chatLink = await waitForElement<HTMLAnchorElement>('a[aria-label="Leonidas Chat"]');
      chatLink.click();
      const editor = await waitForElement<HTMLElement>('[contenteditable="true"]');
      const composer = page.elementLocator(editor);
      await userEvent.type(composer, "Say the fixture text.");
      await userEvent.keyboard("{Enter}");

      const wait = { timeout: E2E_TIMEOUT_MS };
      await expect.element(page.getByText("Say the fixture text."), wait).toBeVisible();
      await expect.element(page.getByText(E2E_TURN_REPLY), wait).toBeVisible();
    },
    E2E_TIMEOUT_MS * 2,
  );
});

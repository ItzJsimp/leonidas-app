import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";

const submit = vi.hoisted(() => vi.fn<(credential: string) => Promise<void>>());
vi.mock("../../environments/primary", () => ({
  peekPairingTokenFromUrl: () => null,
  stripPairingTokenFromUrl: vi.fn(),
  submitServerAuthCredential: submit,
}));
vi.mock("../../connection/onboarding", () => ({ connectPairing: {} }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../../hostedPairing", () => ({ readHostedPairingRequest: () => null }));

const { PairingRouteSurface } = await import("./PairingRouteSurface");

const AUTH = { bootstrapMethods: ["one-time-token"] } as never;
const field = (container: HTMLElement) =>
  container.querySelector<HTMLInputElement>("#pairing-token")!;

it("opens with focus in the field, a Connect button and the path to a code", async () => {
  await using screen = await render(<PairingRouteSurface auth={AUTH} onAuthenticated={vi.fn()} />, {
    router: false,
  });
  expect(document.activeElement).toBe(field(screen.container));
  const buttons = [...screen.container.querySelectorAll("button")].map((node) => node.textContent);
  expect(buttons).toContain("Connect");
  expect(buttons).not.toContain("Continue");
  expect(screen.container.textContent).toContain("Settings, then Connections, then Create link");
  expect(field(screen.container).hasAttribute("aria-invalid")).toBe(false);
  expect(field(screen.container).closest("[data-slot=input-control]")?.className).toContain(
    "border-input-strong",
  );
});

it("after a wrong code, marks the field invalid, links it to the alert and refocuses it", async () => {
  submit.mockRejectedValueOnce(new Error("This code does not work."));
  await using screen = await render(<PairingRouteSurface auth={AUTH} onAuthenticated={vi.fn()} />, {
    router: false,
  });
  await act(async () => {
    screen.container.querySelector("form")!.requestSubmit();
  });
  const alert = screen.container.querySelector('[role="alert"]')!;
  expect(alert.textContent).toContain("This code does not work.");
  expect(field(screen.container).getAttribute("aria-invalid")).toBe("true");
  expect(field(screen.container).getAttribute("aria-describedby")).toBe(alert.id);
  expect(document.activeElement).toBe(field(screen.container));
});

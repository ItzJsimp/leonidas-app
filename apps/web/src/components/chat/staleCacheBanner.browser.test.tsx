import { render as renderUi } from "../../../test/render";
import "../../index.css";

import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { ComposerBannerStack } from "./ComposerBannerStack";
import { useStaleCacheBanner } from "./staleCacheBanner";

function Harness(props: { onCompact: () => void }) {
  const banner = useStaleCacheBanner({
    chatKey: "thread-1",
    tokens: 411_000,
    disabled: false,
    onCompact: props.onCompact,
  });
  return <ComposerBannerStack items={banner ? [banner] : []} />;
}

const WIDTHS = [1280, 800, 390] as const;

it.each(WIDTHS)("shows the stale cache banner without overflow at %ipx", async (width) => {
  const onCompact = vi.fn();
  await page.viewport(width, 300);
  const container = document.createElement("div");
  container.style.width = `${width}px`;
  await using screen = await renderUi(<Harness onCompact={onCompact} />, { container });

  await expect.element(page.getByText("Cache expired")).toBeVisible();
  await expect.element(page.getByText("Next message re-reads 411k tokens.")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Compact first" }), { timeout: 20_000 })
    .toBeVisible();
  expect(screen.container.scrollWidth).toBeLessThanOrEqual(screen.container.clientWidth);

  await page.getByRole("button", { name: "Compact first" }).click();
  expect(onCompact).toHaveBeenCalledTimes(1);

  await page.getByRole("button", { name: "Dismiss cache notice" }).click();
  await expect.element(page.getByText("Cache expired")).not.toBeInTheDocument();
});

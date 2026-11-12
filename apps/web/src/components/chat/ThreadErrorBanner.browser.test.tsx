import { render as renderUi } from "../../../test/render";
import "../../index.css";

import { expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { ThreadErrorBanner } from "./ThreadErrorBanner";

it("shows a plain summary and expands to the exact error text", async () => {
  const error = '  {"error": {"message":"Turn failed", "code":"unsupported_value"}}\t ';

  await using screen = await renderUi(<ThreadErrorBanner error={error} />);
  const { container } = screen;

  await expect.element(page.getByTestId("thread-error-summary")).toBeVisible();
  expect(
    container.querySelector('[data-testid="thread-error-summary"]')?.textContent,
  ).not.toContain("unsupported_value");

  await page.getByRole("button", { name: "View details" }).click();

  const diagnostics = page.getByTestId("thread-error-details");
  await expect.element(diagnostics).toBeVisible();
  expect(diagnostics.element().textContent).toBe(error);
});

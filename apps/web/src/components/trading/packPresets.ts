import type { TradingPackView, TradingState } from "@t3tools/contracts";

export type PresetFirm = Extract<TradingPackView, { status: "ready" }>["firms"][number];
export type PresetProduct = PresetFirm["products"][number];
type Account = TradingState["accounts"][number];

/** The firms a linked pack offers. No pack, or a bad one, gives none: the forms show plain fields. */
export const presetFirms = (pack: TradingPackView | undefined): readonly PresetFirm[] =>
  pack?.status === "ready" ? pack.firms : [];

export const findProduct = (
  firms: readonly PresetFirm[],
  firm: string,
  product: string,
): PresetProduct | undefined =>
  firms.find((item) => item.name === firm)?.products.find((item) => item.name === product);

/** `50000` to `50K`, the way traders name an account size. */
export const sizeLabel = (size: number): string =>
  size >= 1000 && size % 1000 === 0 ? `${size / 1000}K` : String(size);

const text = (price: number | null | undefined): string =>
  price === null || price === undefined ? "" : String(price);

/** The Evaluation fee a new account starts with: the monthly price, else the one-time price. */
export const evaluationFee = (product: PresetProduct): string =>
  text(product.prices.monthly ?? product.prices.oneTime);

/**
 * The fee a form fills in for an account, from its firm and product in the pack. Empty when the
 * pack has no such product or no such price, so the trader types it.
 */
export function accountFee(
  firms: readonly PresetFirm[],
  account: Account | undefined,
  kind: "purchase" | "reset" | "activation",
): string {
  if (!account) return "";
  const product = findProduct(firms, account.firm, account.product);
  if (!product) return "";
  if (kind === "purchase") return evaluationFee(product);
  return text(kind === "reset" ? product.prices.reset : product.prices.activation);
}

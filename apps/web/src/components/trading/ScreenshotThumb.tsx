import type { EnvironmentId, TradingStateInput } from "@t3tools/contracts";

import { Spinner } from "~/components/ui/spinner";
import { useEnvironmentQuery } from "~/state/query";
import { tradingScreenshotQuery } from "~/state/trading";

/** A saved screenshot as a small picture. The alt text says what the picture is. */
export function ScreenshotImage({
  mime,
  dataBase64,
  alt,
}: {
  readonly mime: string;
  readonly dataBase64: string;
  readonly alt: string;
}) {
  return (
    <img
      src={`data:${mime};base64,${dataBase64}`}
      alt={alt}
      loading="lazy"
      className="h-16 w-24 shrink-0 rounded-md border border-border object-cover"
    />
  );
}

/** Reads one saved screenshot and shows it. The query runs only when the Journal shows the trade. */
export function ScreenshotThumb({
  environmentId,
  scope,
  day,
  name,
  alt,
}: {
  readonly environmentId: EnvironmentId;
  readonly scope: TradingStateInput;
  readonly day: string;
  readonly name: string;
  readonly alt: string;
}) {
  const query = useEnvironmentQuery(
    tradingScreenshotQuery({ environmentId, input: { ...scope, day, name } }),
  );
  if (query.data) {
    return <ScreenshotImage mime={query.data.mime} dataBase64={query.data.dataBase64} alt={alt} />;
  }
  if (query.error) {
    return <p className="text-xs text-muted-foreground">Screenshot unavailable</p>;
  }
  return (
    <span className="grid h-16 w-24 shrink-0 place-items-center rounded-md border border-border">
      <Spinner size="sm" aria-label="Loading screenshot" />
    </span>
  );
}

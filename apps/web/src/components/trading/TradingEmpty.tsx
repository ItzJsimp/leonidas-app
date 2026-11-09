import { Link } from "@tanstack/react-router";

import { Button } from "~/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from "~/components/ui/empty";
import { RailWindow } from "~/components/twoState/RailWindow";

/** One Trading tab before it has data: the page title, one teaching line, one working action. */
export function TradingEmpty({
  title,
  line,
  action,
}: {
  readonly title: string;
  readonly line: string;
  readonly action: { readonly label: string; readonly to: "/" | "/trading/accounts" };
}) {
  return (
    <RailWindow title={title}>
      <Empty size="compact">
        <EmptyHeader>
          <EmptyDescription>{line}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button render={<Link to={action.to} />}>{action.label}</Button>
        </EmptyContent>
      </Empty>
    </RailWindow>
  );
}

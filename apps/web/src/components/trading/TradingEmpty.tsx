import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Button } from "~/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from "~/components/ui/empty";
import { RailWindow } from "~/components/twoState/RailWindow";

/** One Trading tab before it has data: the page title, one teaching line, one working action. */
export function TradingEmpty({
  title,
  line,
  action,
  actions,
}: {
  readonly title: string;
  readonly line: string;
  /** A link, or a button when the action opens a form on this page. */
  readonly action:
    | { readonly label: string; readonly to: "/" | "/trading/accounts" }
    | { readonly label: string; readonly onClick: () => void };
  /** Window header actions, such as the Add menu. */
  readonly actions?: ReactNode;
}) {
  return (
    <RailWindow title={title} actions={actions}>
      <Empty size="compact">
        <EmptyHeader>
          <EmptyDescription>{line}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {"to" in action ? (
            <Button render={<Link to={action.to} />}>{action.label}</Button>
          ) : (
            <Button onClick={action.onClick}>{action.label}</Button>
          )}
        </EmptyContent>
      </Empty>
    </RailWindow>
  );
}

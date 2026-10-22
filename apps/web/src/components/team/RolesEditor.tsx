import type { EnvironmentId, WorkspaceOrg } from "@t3tools/contracts";
import { CopyIcon, Trash2Icon } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { Button } from "~/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { workspaceOrgChange } from "~/state/taskBoard";
import { useAtomCommand } from "~/state/use-atom-command";
import { cn } from "~/lib/utils";

import { copyRole, diffRoleTable, SHIPPED_ROLES, summarizeResults } from "./teamView.logic";

type Role = WorkspaceOrg["roles"][number];
/** `fresh` marks a row the Owner added here, so its name stays editable while typed. */
type Row = { readonly role: Role; readonly fresh: boolean };

const SELECT =
  "h-8 w-full min-w-28 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

// Every Role sees the whole Area, so the table only edits what a Role may do (roles.md).
const WRITE: ReadonlyArray<readonly [Role["write"], string]> = [
  ["none", "Nothing"],
  ["files", "Files and tasks"],
  ["all", "Everything"],
];
const APPROVE: ReadonlyArray<readonly [Role["approve"], string]> = [
  ["none", "Nothing"],
  ["area", "Inside the Area"],
];
const MANAGE: ReadonlyArray<readonly [Role["manage"], string]> = [
  ["none", "Nothing"],
  ["area", "The Area"],
];

function Pick<T extends string>(props: {
  readonly label: string;
  readonly value: T;
  readonly options: ReadonlyArray<readonly [T, string]>;
  readonly disabled?: boolean;
  readonly onChange: (value: T) => void;
}) {
  return (
    <select
      aria-label={props.label}
      className={SELECT}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value as T)}
    >
      {props.options.map(([value, text]) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
    </select>
  );
}

/**
 * The permission table of the business (ADR-0088). An Owner edits the Roles that ship, except
 * Owner, and copies a Role into a custom one. The server decides what applies now (narrowing) and
 * what waits for an Owner (widening), so this form never claims more than the server answered.
 */
export function RolesEditor(props: {
  readonly environmentId: EnvironmentId;
  readonly scope: { readonly workspaceId?: string };
  readonly org: WorkspaceOrg;
  readonly onDone: (changed: boolean) => void;
}) {
  const id = useId();
  const run = useAtomCommand(workspaceOrgChange, { reportFailure: false });
  const [draft, setDraft] = useState<ReadonlyArray<Row>>(
    props.org.roles.map((role) => ({ role, fresh: false })),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const shipped = (name: string) => (SHIPPED_ROLES as ReadonlyArray<string>).includes(name);
  const changes = diffRoleTable(
    props.org.roles,
    draft.map((row) => row.role),
  );

  const patch = (index: number, next: Partial<Role>) =>
    setDraft((old) =>
      old.map((row, i) => (i === index ? { ...row, role: { ...row.role, ...next } } : row)),
    );

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const results: Array<{ result: string; message: string }> = [];
    for (const change of changes) {
      const response = await run({
        environmentId: props.environmentId,
        input: { ...props.scope, change },
      });
      results.push(
        response._tag === "Success"
          ? response.value
          : { result: "invalid", message: "The change could not be sent. Try again." },
      );
    }
    setBusy(false);
    const sent =
      results.length > 0 && results.every((r) => r.result === "applied" || r.result === "proposed");
    if (sent) props.onDone(true);
    else setMessage(summarizeResults(results));
  };

  return (
    <form className="contents" onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>Roles and permissions</DialogTitle>
        <DialogDescription>
          Every Role sees the whole Area. Lowering a permission applies at once. Raising one, or
          adding a Role, waits for an Owner to approve.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-separate border-spacing-y-1.5 text-sm">
            <caption className="sr-only">Permissions of each Role</caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="pr-2 font-medium">
                  Role
                </th>
                <th scope="col" className="pr-2 font-medium">
                  Can write
                </th>
                <th scope="col" className="pr-2 font-medium">
                  Can approve
                </th>
                <th scope="col" className="pr-2 font-medium">
                  Can manage
                </th>
                <th scope="col" className="w-20 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {draft.map(({ role, fresh }, index) => {
                const locked = role.name === "Owner";
                return (
                  <tr key={fresh ? `${id}-new-${index}` : role.name}>
                    <th scope="row" className="pr-2 text-left font-medium align-middle">
                      {fresh ? (
                        <Input
                          aria-label="Name of the new Role"
                          autoFocus
                          value={role.name}
                          maxLength={24}
                          onChange={(event) => patch(index, { name: event.target.value })}
                        />
                      ) : (
                        <span className={cn(locked && "text-muted-foreground")}>
                          {role.name}
                          {locked ? " (locked)" : ""}
                        </span>
                      )}
                    </th>
                    <td className="pr-2">
                      <Pick
                        label={`${role.name}: can write`}
                        value={role.write}
                        options={WRITE}
                        disabled={locked}
                        onChange={(write) => patch(index, { write })}
                      />
                    </td>
                    <td className="pr-2">
                      {locked ? (
                        <span className="text-muted-foreground">Across the wall</span>
                      ) : (
                        <Pick
                          label={`${role.name}: can approve`}
                          value={role.approve}
                          options={APPROVE}
                          onChange={(approve) => patch(index, { approve })}
                        />
                      )}
                    </td>
                    <td className="pr-2">
                      {locked ? (
                        <span className="text-muted-foreground">The business</span>
                      ) : (
                        <Pick
                          label={`${role.name}: can manage`}
                          value={role.manage}
                          options={MANAGE}
                          onChange={(manage) => patch(index, { manage })}
                        />
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Copy the ${role.name} Role`}
                          disabled={busy}
                          onClick={() =>
                            setDraft((old) => [
                              ...old,
                              { role: copyRole(role, `${role.name} copy`), fresh: true },
                            ])
                          }
                        >
                          <CopyIcon aria-hidden />
                        </Button>
                        {shipped(role.name) ? null : (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Remove the ${role.name || "new"} Role`}
                            disabled={busy}
                            onClick={() => setDraft((old) => old.filter((_, i) => i !== index))}
                          >
                            <Trash2Icon aria-hidden />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p
          role="status"
          className={cn(
            "mt-3 min-h-5 text-sm",
            message ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {message}
        </p>
      </DialogPanel>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => props.onDone(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || changes.length === 0}>
          {busy ? <Spinner /> : null}
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

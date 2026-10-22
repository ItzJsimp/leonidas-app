import type { EnvironmentId, WorkspaceOrg, WorkspaceOrgChange } from "@t3tools/contracts";
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
import { Label } from "~/components/ui/label";
import { Spinner } from "~/components/ui/spinner";
import { workspaceOrgChange } from "~/state/taskBoard";
import { useAtomCommand } from "~/state/use-atom-command";
import { cn } from "~/lib/utils";

import { diffRoles, rolesFor, suggestSlug, summarizeResults } from "./teamView.logic";

type Member = WorkspaceOrg["members"][number];
type Change = WorkspaceOrgChange;

/** What the dialog edits: one existing Member, or a new one. */
export type EditorTarget =
  | { readonly mode: "edit"; readonly member: Member }
  | { readonly mode: "add" };

const SELECT =
  "h-8 min-w-32 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function RoleSelect(props: {
  readonly label: string;
  readonly value: string;
  readonly roles: ReadonlyArray<string>;
  readonly onChange: (role: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="min-w-0 truncate text-sm">
        {props.label}
      </Label>
      <select
        id={id}
        className={SELECT}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option value="">No Role</option>
        {props.roles.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Edit the Roles of a Member, add a Member, or remove one (ADR-0088). The server decides what
 * each change does: lowering a Role applies at once, raising one waits for an Owner. This form
 * never claims more than the server answered.
 */
export function MemberEditor(props: {
  readonly environmentId: EnvironmentId;
  readonly scope: { readonly workspaceId?: string };
  readonly org: WorkspaceOrg;
  readonly target: EditorTarget;
  readonly canRemove: boolean;
  readonly onDone: (changed: boolean) => void;
}) {
  const { org, target } = props;
  const id = useId();
  const run = useAtomCommand(workspaceOrgChange, { reportFailure: false });
  const areas = org.areas.filter((area) => area.status !== "archived");
  const editing = target.mode === "edit" ? target.member : null;
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [kind, setKind] = useState<"person" | "agent">("person");
  const [github, setGithub] = useState("");
  const [owner, setOwner] = useState("");
  const [department, setDepartment] = useState(org.departments[0]?.slug ?? "");
  const [roles, setRoles] = useState<Record<string, string>>(
    editing ? { ...editing.roles } : { home: "Viewer" },
  );
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const persons = org.members.filter((m) => m.kind === "person" && m.status === "active");
  const roleList = rolesFor(editing?.kind ?? kind);

  const send = async (changes: ReadonlyArray<Change>) => {
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
    const sum = summarizeResults(results);
    const allGood =
      results.length > 0 && results.every((r) => r.result === "applied" || r.result === "proposed");
    if (allGood) props.onDone(true);
    else setMessage(sum);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (editing) {
      void send(diffRoles(editing, areas, roles));
      return;
    }
    const chosen = Object.fromEntries(Object.entries(roles).filter(([, role]) => role !== ""));
    void send([
      {
        kind: "addMember",
        member: {
          slug: slug || suggestSlug(name),
          name: name.trim(),
          kind,
          department,
          ...(kind === "agent" ? { owner } : { github: github.trim() }),
          roles: chosen,
        },
      },
    ]);
  };

  return (
    <form className="contents" onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${editing.name}` : "Add a Member"}</DialogTitle>
        <DialogDescription>
          Lowering a Role applies at once. Adding a Member or raising a Role waits for an Owner to
          approve.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <div className="flex flex-col gap-4">
          {editing ? null : (
            <>
              <Label className="flex flex-col items-stretch" htmlFor={`${id}-name`}>
                Name
                <Input
                  id={`${id}-name`}
                  autoFocus
                  value={name}
                  maxLength={80}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (!slugTouched) setSlug(suggestSlug(event.target.value));
                  }}
                />
              </Label>
              <Label className="flex flex-col items-stretch" htmlFor={`${id}-slug`}>
                Short name
                <Input
                  id={`${id}-slug`}
                  value={slug}
                  maxLength={40}
                  onChange={(event) => {
                    setSlug(event.target.value);
                    setSlugTouched(true);
                  }}
                />
              </Label>
              <fieldset className="flex gap-4">
                <legend className="mb-1 text-sm font-medium">Kind</legend>
                {(["person", "agent"] as const).map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`${id}-kind`}
                      checked={kind === option}
                      onChange={() => {
                        setKind(option);
                        if (option === "agent")
                          setRoles((old) =>
                            Object.fromEntries(
                              Object.entries(old).map(([area, role]) => [
                                area,
                                role === "Owner" ? "Admin" : role,
                              ]),
                            ),
                          );
                      }}
                    />
                    {option === "person" ? "Person" : "Agent"}
                  </label>
                ))}
              </fieldset>
              {kind === "person" ? (
                <Label className="flex flex-col items-stretch" htmlFor={`${id}-github`}>
                  GitHub login
                  <Input
                    id={`${id}-github`}
                    value={github}
                    maxLength={39}
                    onChange={(event) => setGithub(event.target.value)}
                  />
                </Label>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={`${id}-owner`} className="text-sm">
                    Answers to
                  </Label>
                  <select
                    id={`${id}-owner`}
                    className={SELECT}
                    value={owner}
                    onChange={(event) => setOwner(event.target.value)}
                  >
                    <option value="">Choose a person</option>
                    {persons.map((person) => (
                      <option key={person.slug} value={person.slug}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`${id}-dept`} className="text-sm">
                  Department
                </Label>
                <select
                  id={`${id}-dept`}
                  className={SELECT}
                  value={department}
                  onChange={(event) => setDepartment(event.target.value)}
                >
                  {org.departments.map((entry) => (
                    <option key={entry.slug} value={entry.slug}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Role in each Area</legend>
            {areas.map((area) => (
              <RoleSelect
                key={area.slug}
                label={area.name}
                value={roles[area.slug] ?? ""}
                roles={roleList}
                onChange={(role) => setRoles((old) => ({ ...old, [area.slug]: role }))}
              />
            ))}
          </fieldset>
          <p
            role="status"
            className={cn(
              "min-h-5 text-sm",
              message ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {message}
          </p>
        </div>
      </DialogPanel>
      <DialogFooter>
        {editing && props.canRemove ? (
          <Button
            type="button"
            variant="destructive-outline"
            disabled={busy}
            className="mr-auto"
            onClick={() => {
              if (!confirmRemove) {
                setConfirmRemove(true);
                return;
              }
              void send([{ kind: "removeMember", member: editing.slug }]);
            }}
          >
            {confirmRemove ? "Confirm: remove, keeps their files" : "Remove Member"}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={() => props.onDone(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <Spinner /> : null}
          {editing ? "Save" : "Add Member"}
        </Button>
      </DialogFooter>
    </form>
  );
}

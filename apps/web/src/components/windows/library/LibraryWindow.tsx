import { PackageIcon, ScrollTextIcon, SparklesIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "~/components/ui/input";
import { ReplyStyleSettingsRow } from "~/components/settings/ReplyStyleSettingsRow";
import { SettingsScopeProvider } from "~/components/settings/SettingsScopeContext";
import {
  RailWindow,
  WindowEmpty,
  WindowLoading,
  type WindowTab,
} from "~/components/twoState/RailWindow";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useServerConfigs } from "~/state/entities";
import { useEnvironmentProviders } from "~/state/environments";

import { packRows, skillRows } from "./skillRows";

const TABS: readonly WindowTab[] = [
  { id: "skills", label: "Skills" },
  { id: "reply-styles", label: "Reply styles" },
  { id: "rules", label: "Rules" },
  { id: "packs", label: "Packs" },
];

const ignoreScopeChange = () => {};

/** Library: what Leonidas can use. Each tab reuses the view the app already has for it. */
export function LibraryWindow() {
  return (
    <RailWindow title="Library" tabs={TABS}>
      {(tab) => {
        switch (tab) {
          case "reply-styles":
            return <ReplyStyles />;
          case "rules":
            return (
              <WindowEmpty
                icon={ScrollTextIcon}
                title="Rules are not listed here yet"
                line="The rules Leonidas follows will show here. Today they live in your AIOS folder."
              />
            );
          case "packs":
            return <Packs />;
          default:
            return <Skills />;
        }
      }}
    </RailWindow>
  );
}

function Skills() {
  const environmentId = usePrimaryEnvironmentId();
  const config = useServerConfigs().get(environmentId as never);
  const providers = useEnvironmentProviders().get(environmentId as never);
  const [query, setQuery] = useState("");
  const skills = useMemo(
    () => (providers ?? []).flatMap((provider) => provider.skills),
    [providers],
  );
  const rows = useMemo(() => skillRows(skills, query), [skills, query]);
  const total = useMemo(() => skillRows(skills, "").length, [skills]);
  if (config === undefined) return <WindowLoading label="Reading your skills" />;
  if (total === 0) {
    return (
      <WindowEmpty
        icon={SparklesIcon}
        title="No skills found yet"
        line="Skills are saved instructions Leonidas can follow. They show here once an agent is connected and your AIOS folder has some."
        action={{ label: "Connect an agent", to: "/settings/providers" }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        value={query}
        placeholder="Search skills"
        aria-label="Search skills"
        onChange={(event) => setQuery(event.target.value)}
      />
      {rows.length === 0 ? (
        <p role="status" className="px-1 py-6 text-center text-sm text-muted-foreground">
          No skill matches &ldquo;{query.trim()}&rdquo;. Try other words.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-col gap-0.5 px-4 py-2.5">
              <span title={row.name} className="truncate text-sm font-medium">
                {row.name}
              </span>
              <span title={row.line} className="line-clamp-2 text-xs text-muted-foreground">
                {row.line}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="px-1 text-xs text-muted-foreground tabular-nums">
        {query.trim() === ""
          ? `${total} ${total === 1 ? "skill" : "skills"}`
          : `${rows.length} of ${total} skills`}
      </p>
    </div>
  );
}

/** The reply style picker reads its computer from the settings scope, so pin that to this computer. */
function ReplyStyles() {
  const environmentId = usePrimaryEnvironmentId();
  const search = useMemo(() => ({ machine: environmentId ?? undefined }), [environmentId]);
  return (
    <SettingsScopeProvider search={search} onChange={ignoreScopeChange}>
      <div className="rounded-xl border border-border bg-card px-4">
        <ReplyStyleSettingsRow />
      </div>
    </SettingsScopeProvider>
  );
}

function Packs() {
  const packs = useMemo(() => packRows(), []);
  if (packs.length === 0) {
    return (
      <WindowEmpty
        icon={PackageIcon}
        title="No packs yet"
        line="Bundles of skills you can add show here."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Starter packs are bundles of skills for what you build. Adding a pack from here is coming.
      </p>
      <ul className="flex flex-col gap-3">
        {packs.map((pack) => (
          <li key={pack.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold">{pack.label}</h2>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {pack.skills.length} {pack.skills.length === 1 ? "skill" : "skills"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{pack.hint}</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {pack.skills.map((skill) => (
                <li key={skill.name} className="flex flex-col">
                  <span className="text-sm">{skill.name}</span>
                  <span title={skill.line} className="line-clamp-2 text-xs text-muted-foreground">
                    {skill.line}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

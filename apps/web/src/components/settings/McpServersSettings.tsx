import { AuthSettingsWriteScope } from "@t3tools/contracts";
import { MoreVertical, PlusIcon } from "lucide-react";
import { useState } from "react";

import { useEnvironmentScope } from "../../state/session";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  EMPTY_MCP_SERVER_DRAFT,
  type McpServerDraft,
  buildMcpServer,
  draftFromMcpServer,
  removeMcpServer,
  setMcpServerEnabled,
  upsertMcpServer,
} from "./mcpServersSettings.logic";
import { useSettingsScope } from "./SettingsScopeContext";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

export function McpServersSettingsPanel() {
  return (
    <SettingsPageContainer>
      <SettingsSection id="tools" title="Tools">
        <McpServersSettings />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function McpServersSettings() {
  const { scope, target } = useSettingsScope();
  const servers = useScopedSettings((settings) => settings.mcpServers);
  const updateSettings = useUpdateScopedSettings();
  const canConfigure = useEnvironmentScope(target?.environmentId ?? null, AuthSettingsWriteScope);
  const projectScope = scope.kind === "project" || scope.kind === "checkout";
  const locked = !canConfigure || projectScope;
  // `null` means the form is closed, `editingId` null means a new server.
  const [form, setForm] = useState<{ draft: McpServerDraft; editingId: string | null } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!form) return;
    const result = buildMcpServer(form.draft, servers, form.editingId);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    updateSettings({ mcpServers: upsertMcpServer(servers, result.server, form.editingId) });
    setForm(null);
    setError(null);
  };

  return (
    <SettingsRow
      id="mcp-servers"
      title="MCP servers"
      serverScoped
      settingKeys={["mcpServers"]}
      description="Tools every AI service can use. New chats pick up changes."
      control={
        <Button
          size="sm"
          variant="outline"
          disabled={locked || form !== null}
          onClick={() => setForm({ draft: EMPTY_MCP_SERVER_DRAFT, editingId: null })}
        >
          <PlusIcon className="size-3.5" /> Add server
        </Button>
      }
    >
      <div className="pt-3 pb-2">
        {servers.length === 0 && form === null ? (
          <p className="py-2 text-sm text-muted-foreground">No servers.</p>
        ) : null}
        {servers.map((server) => (
          <div key={server.id} className="flex items-center gap-2 border-t border-border/50 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{server.id}</p>
              <p className="truncate text-xs text-muted-foreground">
                {server.transport === "http"
                  ? server.url
                  : [server.command, ...(server.args ?? [])].join(" ")}
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span>
                    <Switch
                      checked={server.enabled}
                      disabled={locked}
                      aria-label={`${server.id} on or off`}
                      onCheckedChange={(checked) =>
                        updateSettings({
                          mcpServers: setMcpServerEnabled(servers, server.id, Boolean(checked)),
                        })
                      }
                    />
                  </span>
                }
              />
              <TooltipPopup>{server.enabled ? "On: new chats can use it" : "Off"}</TooltipPopup>
            </Tooltip>
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost-muted"
                    disabled={locked}
                    aria-label={`${server.id} options`}
                  />
                }
              >
                <MoreVertical />
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuItem
                  onClick={() =>
                    setForm({ draft: draftFromMcpServer(server), editingId: server.id })
                  }
                >
                  Edit
                </MenuItem>
                <MenuItem
                  variant="destructive"
                  onClick={() =>
                    updateSettings({ mcpServers: removeMcpServer(servers, server.id) })
                  }
                >
                  Remove
                </MenuItem>
              </MenuPopup>
            </Menu>
          </div>
        ))}
        {form ? (
          <McpServerForm
            draft={form.draft}
            error={error}
            onChange={(draft) => setForm({ ...form, draft })}
            onSave={save}
            onClose={() => {
              setForm(null);
              setError(null);
            }}
          />
        ) : null}
      </div>
    </SettingsRow>
  );
}

function McpServerForm({
  draft,
  error,
  onChange,
  onSave,
  onClose,
}: {
  draft: McpServerDraft;
  error: string | null;
  onChange: (draft: McpServerDraft) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const set = (patch: Partial<McpServerDraft>) => onChange({ ...draft, ...patch });
  return (
    <div className="mt-2 space-y-3 rounded-lg border border-border/60 p-3 text-sm">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={draft.transport === "http" ? "default" : "outline"}
          onClick={() => set({ transport: "http" })}
        >
          Web address
        </Button>
        <Button
          size="sm"
          variant={draft.transport === "stdio" ? "default" : "outline"}
          onClick={() => set({ transport: "stdio" })}
        >
          Command
        </Button>
      </div>
      <label className="block space-y-1.5">
        <span>Name</span>
        <Input value={draft.id} onChange={(event) => set({ id: event.target.value })} />
      </label>
      {draft.transport === "http" ? (
        <>
          <label className="block space-y-1.5">
            <span>Address</span>
            <Input
              value={draft.url}
              placeholder="https://"
              onChange={(event) => set({ url: event.target.value })}
            />
          </label>
          <label className="block space-y-1.5">
            <span>Token variable</span>
            <Input
              value={draft.bearerTokenEnvVar}
              placeholder="Optional"
              onChange={(event) => set({ bearerTokenEnvVar: event.target.value })}
            />
          </label>
        </>
      ) : (
        <>
          <label className="block space-y-1.5">
            <span>Command</span>
            <Input
              value={draft.command}
              onChange={(event) => set({ command: event.target.value })}
            />
          </label>
          <label className="block space-y-1.5">
            <span>Arguments</span>
            <Input value={draft.args} onChange={(event) => set({ args: event.target.value })} />
          </label>
          <label className="block space-y-1.5">
            <span>Variables to pass</span>
            <Input
              value={draft.envVars}
              placeholder="Optional"
              onChange={(event) => set({ envVars: event.target.value })}
            />
          </label>
        </>
      )}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost-muted" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSave}>
          Save
        </Button>
      </div>
    </div>
  );
}

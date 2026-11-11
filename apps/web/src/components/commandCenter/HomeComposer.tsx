import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ModelSelection, ProviderInstanceId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { useNavigate } from "@tanstack/react-router";
import { FolderIcon } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import { ComposerSurface } from "~/components/chat/ComposerSurface";
import {
  COMPOSER_SEND_BUTTON_CLASS,
  ComposerSendIcon,
} from "~/components/chat/ComposerPrimaryActions";
import { ProviderModelPicker } from "~/components/chat/ProviderModelPicker";
import { Spinner } from "~/components/ui/spinner";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { useComposerDraftStore } from "~/composerDraftStore";
import { useHandleNewThread } from "~/hooks/useHandleNewThread";
import { useEnvironmentSettings } from "~/hooks/useSettings";
import { getAppModelOptionsForInstance } from "~/modelSelection";
import { useOnboardingChat } from "~/onboarding/useOnboardingChat";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
} from "~/providerInstances";
import { useEnvironmentProviders } from "~/state/environments";
import { buildThreadRouteParams } from "~/threadRoutes";

import { clipTitle } from "../twoState/safeText";
import { Tip } from "../twoState/Tip";
import { useAiosHome } from "../twoState/useTwoStateData";

const TITLE_LENGTH = 60;
const NO_PROVIDERS = [] as const;

/**
 * The Ask box: the chat composer's frame, model picker and send button. The model it uses is the
 * one new chats use, so a pick here is the pick in Chat and back. Send starts a normal chat in
 * the AIOS folder (or the newest project) and opens it.
 */
export function HomeComposer() {
  const workspace = useActiveAiosWorkspace();
  const environmentId = workspace.environmentId;
  const root = useAiosHome().data?.root ?? null;
  const { canOperate, ensureFolderProject, startChat, defaultSelection } = useOnboardingChat(
    environmentId ?? undefined,
  );
  // A phone paired to a computer with projects but no AIOS folder still gets a working box.
  const { defaultProjectRef } = useHandleNewThread();
  const fallbackProjectId =
    defaultProjectRef?.environmentId === environmentId ? defaultProjectRef.projectId : null;
  const navigate = useNavigate();
  const settings = useEnvironmentSettings(environmentId ?? ("" as EnvironmentId));
  const providersByEnvironment = useEnvironmentProviders();
  const providers =
    (environmentId ? providersByEnvironment.get(environmentId) : undefined) ?? NO_PROVIDERS;
  const stickyProvider = useComposerDraftStore((store) => store.stickyActiveProvider);
  const stickySelection = useComposerDraftStore((store) =>
    store.stickyActiveProvider
      ? (store.stickyModelSelectionByProvider[store.stickyActiveProvider] ?? null)
      : null,
  );
  const setStickyModelSelection = useComposerDraftStore((store) => store.setStickyModelSelection);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entries = useMemo(
    () =>
      sortProviderInstanceEntries(
        applyProviderInstanceSettings(deriveProviderInstanceEntries(providers), settings, null),
      ),
    [providers, settings],
  );
  const selection: ModelSelection | null =
    (stickyProvider &&
    stickySelection &&
    entries.some((entry) => entry.instanceId === stickyProvider)
      ? stickySelection
      : null) ?? defaultSelection;
  const options = useMemo(() => {
    const out = new Map<ProviderInstanceId, ReturnType<typeof getAppModelOptionsForInstance>>();
    for (const entry of entries) {
      out.set(
        entry.instanceId,
        getAppModelOptionsForInstance(
          settings,
          entry,
          entry.instanceId === selection?.instanceId ? selection.model : null,
        ),
      );
    }
    return out;
  }, [entries, settings, selection]);

  const ready = (root !== null || fallbackProjectId !== null) && canOperate && environmentId;
  const text = prompt.trim();

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!ready || text === "" || sending) return;
    setSending(true);
    setError(null);
    const project =
      root !== null
        ? await ensureFolderProject(root)
        : { ok: true as const, projectId: fallbackProjectId! };
    const chat = project.ok
      ? await startChat({
          projectId: project.projectId,
          title: clipTitle(text, TITLE_LENGTH),
          prompt: text,
          ...(selection ? { modelSelection: selection } : {}),
        })
      : project;
    setSending(false);
    if (!chat.ok) {
      setError(chat.message);
      return;
    }
    setPrompt("");
    await navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(environmentId!, chat.threadId)),
    });
  };

  return (
    <form onSubmit={send} aria-label="Ask Leonidas" className="w-full">
      <ComposerSurface.Shell className="max-w-none">
        <ComposerSurface.Host>
          <ComposerSurface.Main>
            <div className="rounded-2xl">
              <textarea
                aria-label="Ask Leonidas"
                value={prompt}
                rows={1}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={
                  root !== null
                    ? "Ask Leonidas to start something in your AIOS"
                    : "Ask Leonidas to start something"
                }
                disabled={sending}
                className="block max-h-40 min-h-11 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-sm outline-none [field-sizing:content] placeholder:text-placeholder"
              />
              <div className="flex min-w-0 items-center gap-1.5 px-2.5 pb-2.5">
                {selection ? (
                  <ProviderModelPicker
                    environmentId={environmentId}
                    compact={false}
                    isComposerOwned
                    activeInstanceId={selection.instanceId}
                    model={selection.model}
                    lockedProvider={null}
                    instanceEntries={entries}
                    modelOptionsByInstance={options}
                    disabled={sending}
                    onInstanceModelChange={(instanceId, model) =>
                      setStickyModelSelection(createModelSelection(instanceId, model))
                    }
                  />
                ) : null}
                {root !== null ? (
                  <Tip text="The chat starts in this AIOS folder and can read and write it">
                    <span
                      tabIndex={0}
                      className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <FolderIcon aria-hidden className="size-3.5 shrink-0" />
                      <span className="truncate">{workspace.active?.name ?? "Your AIOS"}</span>
                    </span>
                  </Tip>
                ) : null}
                {error !== null ? (
                  <span
                    role="alert"
                    className="min-w-0 truncate text-xs text-destructive-foreground"
                  >
                    {error}
                  </span>
                ) : canOperate && root === null && fallbackProjectId === null ? (
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    Add a project on your computer to start a chat.
                  </span>
                ) : null}
                <Tip
                  text={
                    ready
                      ? "Start the chat and open it (Enter)"
                      : "Add a project on your computer to start a chat"
                  }
                >
                  <button
                    type="submit"
                    disabled={!ready || text === "" || sending}
                    aria-label="Start the chat"
                    className={`ml-auto shrink-0 ${COMPOSER_SEND_BUTTON_CLASS}`}
                  >
                    {sending ? <Spinner size="sm" aria-hidden="true" /> : <ComposerSendIcon />}
                  </button>
                </Tip>
              </div>
            </div>
          </ComposerSurface.Main>
        </ComposerSurface.Host>
      </ComposerSurface.Shell>
    </form>
  );
}

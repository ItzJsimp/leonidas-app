import { ProjectId, ThreadId, type ModelSelection } from "@t3tools/contracts";

const samePath = (left: string, right: string) => {
  const clean = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
  return clean(left) === clean(right);
};

/** The project whose folder is the AIOS root: the Home chat runs there, so it finds the team. */
export function findAiosProject<
  T extends { readonly workspaceRoot: string; readonly deletedAt?: string | null },
>(projects: ReadonlyArray<T>, aiosRoot: string): T | null {
  return (
    projects.find(
      (project) => project.deletedAt == null && samePath(project.workspaceRoot, aiosRoot),
    ) ?? null
  );
}

/**
 * One fixed id for the Home chat of a project. A second create call fails with "already exists",
 * so opening Home twice, or in two windows, never makes a second Home chat.
 */
export const homeThreadId = (projectId: ProjectId): ThreadId => ThreadId.make(`home-${projectId}`);

/**
 * One fixed id for an agent's own chat in a project, so a second click opens the same chat.
 * shortcut: two names that differ only in punctuation share one chat; add a hash if that happens.
 */
export const agentThreadId = (projectId: ProjectId, agentName: string): ThreadId =>
  ThreadId.make(`agent-${projectId}-${agentName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);

interface ModelListing {
  readonly instanceId: ModelSelection["instanceId"];
  readonly enabled: boolean;
  readonly installed: boolean;
  readonly availability?: "available" | "unavailable" | undefined;
  readonly models: ReadonlyArray<{
    readonly slug: string;
    readonly isDefault?: boolean | undefined;
  }>;
}

/**
 * The model a new Home chat starts on: the one last used in a chat, then the project's own choice,
 * then the default model of the first connected account. The user changes it with the model picker.
 */
export function homeModelSelection(input: {
  readonly lastUsed: ModelSelection | null;
  readonly projectDefault: ModelSelection | null;
  readonly providers: ReadonlyArray<ModelListing>;
}): ModelSelection | null {
  if (input.lastUsed !== null) return input.lastUsed;
  if (input.projectDefault !== null) return input.projectDefault;
  for (const provider of input.providers) {
    if (!provider.enabled || !provider.installed || provider.availability === "unavailable") {
      continue;
    }
    const model = provider.models.find((entry) => entry.isDefault === true) ?? provider.models[0];
    if (model !== undefined) return { instanceId: provider.instanceId, model: model.slug };
  }
  return null;
}

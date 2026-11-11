import { useAtomValue } from "@effect/atom-react";
import { useFocusEffect } from "@react-navigation/native";
import {
  CaptureDraft,
  dailyFocusTasks,
  defaultDueForFocus,
  formatDue,
  INBOX_SECTION,
  quickDueOptions,
  taskSectionSlug,
  toggleCompletionStatus,
  type DailyFocus,
} from "@t3tools/client-runtime/task-board/daily-planning";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type { TaskBoardCardUpdateInput, TaskBoardTask } from "@t3tools/contracts";
import { useCallback, useState } from "react";
import { Alert, AppState, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text, AppTextInput as TextInput } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import { Menu } from "../../components/ui/Menu";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { uuidv4 } from "../../lib/uuid";
import { useEnvironmentQuery } from "../../state/query";
import {
  taskBoardCardCreate,
  taskBoardCardUpdate,
  taskBoardWorkspaceQuery,
} from "../../state/taskBoard";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  AndroidSettingsEnvironmentFilter,
  SettingsEnvironmentFilterHeader,
} from "../settings/components/SettingsEnvironmentFilterHeader";
import { SettingsScreen } from "../settings/components/SettingsScreen";
import { SettingsSection } from "../settings/components/SettingsSection";
import { SettingsSwitchRow } from "../settings/components/SettingsSwitchRow";
import {
  useSettingsEnvironmentFilter,
  type SettingsTarget,
} from "../settings/settings-environment-filter";

const FOCUS_OPTIONS = [
  { value: "inbox", label: "Inbox" },
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
] as const satisfies readonly { value: DailyFocus; label: string }[];

type CardPatch = Omit<TaskBoardCardUpdateInput, "taskId" | "projectId" | "actor">;

/** The clock for due labels: re-read on focus, when the app returns, and each minute. */
function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useFocusEffect(
    useCallback(() => {
      const update = () => setNow(Date.now());
      update();
      const timer = setInterval(update, 60_000);
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") update();
      });
      return () => {
        clearInterval(timer);
        subscription.remove();
      };
    }, []),
  );
  return now;
}

function failureMessage(result: AtomCommandResult<unknown, unknown>): string | null {
  if (result._tag === "Success" || isAtomCommandInterrupted(result)) return null;
  const error = squashAtomCommandFailure(result);
  return error instanceof Error && error.message.trim() ? error.message : String(error);
}

/**
 * Daily planning on the phone: Inbox, Today (with overdue work) and Upcoming, per connected
 * environment, over the same task cards and commands the desktop Tasks page uses.
 */
export function TasksRouteScreen() {
  const now = useNow();
  const insets = useSafeAreaInsets();
  const [focus, setFocus] = useState<DailyFocus>("today");
  const [includeDone, setIncludeDone] = useState(false);
  const { availableTargets, selectedTargets } = useSettingsEnvironmentFilter();

  return (
    <>
      <SettingsEnvironmentFilterHeader />
      <SettingsScreen title="Tasks" trailing={<AndroidSettingsEnvironmentFilter />}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          className="flex-1"
          contentContainerClassName="gap-5 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
        >
          <SegmentedControl
            options={FOCUS_OPTIONS}
            selected={focus}
            onSelect={setFocus}
            role="tab"
          />
          <SettingsSection>
            <SettingsSwitchRow
              icon="checkmark.circle"
              label="Show completed"
              value={includeDone}
              onValueChange={setIncludeDone}
            />
          </SettingsSection>
          {selectedTargets.length > 0 ? (
            selectedTargets.map((environment) => (
              <EnvironmentDailyTasks
                key={environment.environmentId}
                environment={environment}
                focus={focus}
                includeDone={includeDone}
                now={now}
              />
            ))
          ) : (
            <Text className="px-2 text-base text-foreground-muted">
              {availableTargets.length === 0
                ? "Connect a computer to plan your tasks."
                : "No computers match these filters. Change the filter above."}
            </Text>
          )}
        </ScrollView>
      </SettingsScreen>
    </>
  );
}

function EnvironmentDailyTasks(props: {
  readonly environment: SettingsTarget;
  readonly focus: DailyFocus;
  readonly includeDone: boolean;
  readonly now: number;
}) {
  const { environment, focus, includeDone, now } = props;
  const environmentId = environment.environmentId;
  const workspace = useEnvironmentQuery(taskBoardWorkspaceQuery({ environmentId, input: {} }));
  const canCreate = useAtomValue(taskBoardCardCreate.permissionAtom(environmentId));
  const canEdit = useAtomValue(taskBoardCardUpdate.permissionAtom(environmentId));
  const runCreate = useAtomCommand(taskBoardCardCreate, { reportFailure: false });
  const runUpdate = useAtomCommand(taskBoardCardUpdate, { reportFailure: false });
  const [projectSlug, setProjectSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => CaptureDraft.empty(uuidv4));
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());

  const data = workspace.data;
  const member = data?.member ?? null;
  const projects = (data?.projects ?? []).filter((project) => project.slug !== INBOX_SECTION);
  const selectedProject = projects.find((project) => project.slug === projectSlug) ?? null;
  const projectName = (task: TaskBoardTask) => {
    const slug = taskSectionSlug(task);
    return slug === INBOX_SECTION
      ? null
      : (projects.find((project) => project.slug === slug)?.name ?? task.project);
  };
  const tasks = data ? dailyFocusTasks(data.tasks, focus, now, { includeDone, projectSlug }) : [];

  const capture = async () => {
    if (member === null || capturing) return;
    const [sending, submission] = CaptureDraft.submit(draft);
    if (submission === null) return;
    setDraft(sending);
    setCapturing(true);
    const result = await runCreate({
      environmentId,
      input: {
        ...submission,
        actor: member,
        due: defaultDueForFocus(focus, now),
        projectSlug: focus === "inbox" ? null : projectSlug,
      },
    });
    setCapturing(false);
    const failure = failureMessage(result);
    // A failed capture keeps its text and key, so sending again after reconnecting cannot duplicate.
    setDraft((current) =>
      CaptureDraft.settle(current, submission, { ok: result._tag === "Success" }),
    );
    if (failure !== null) Alert.alert("Could not add task", failure);
    workspace.refresh();
  };

  const update = async (task: TaskBoardTask, patch: CardPatch, failureTitle: string) => {
    if (member === null || busy.has(task.id)) return;
    setBusy((current) => new Set(current).add(task.id));
    // The version the user saw goes along, so an edit from a stale view is refused, not applied.
    const result = await runUpdate({
      environmentId,
      input: { taskId: task.id, actor: member, expectedUpdatedAt: task.updatedAt, ...patch },
    });
    setBusy((current) => {
      const next = new Set(current);
      next.delete(task.id);
      return next;
    });
    const failure = failureMessage(result);
    if (failure !== null) Alert.alert(failureTitle, failure);
    workspace.refresh();
  };

  const projectFilter =
    focus === "inbox" || projects.length === 0 ? undefined : (
      <Menu
        actions={[
          { id: "all", title: "All projects", state: projectSlug === null ? "on" : "off" },
          ...projects.map((project) => ({
            id: `project:${project.slug}`,
            title: project.name,
            state: project.slug === projectSlug ? ("on" as const) : ("off" as const),
          })),
        ]}
        onPressAction={({ nativeEvent }) => {
          const id = nativeEvent.event;
          setProjectSlug(id.startsWith("project:") ? id.slice("project:".length) : null);
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose project"
          className="flex-row items-center gap-1 rounded-full bg-subtle px-3 py-1.5 active:opacity-70"
        >
          <Text className="text-sm font-t3-medium text-foreground" numberOfLines={1}>
            {selectedProject?.name ?? "All projects"}
          </Text>
          <SymbolView name="chevron.down" size={12} tintColorClassName="accent-icon" />
        </Pressable>
      </Menu>
    );

  return (
    <SettingsSection title={environment.label} trailing={projectFilter}>
      <View className="flex-row items-center gap-2 px-4 py-3">
        <TextInput
          className="flex-1"
          accessibilityLabel="New task"
          placeholder={focus === "inbox" ? "Add to Inbox" : "Add a task for today"}
          value={draft.text}
          editable={canCreate && member !== null}
          onChangeText={(text) => setDraft((current) => CaptureDraft.edit(current, text))}
          onSubmitEditing={() => void capture()}
          returnKeyType="done"
          submitBehavior="submit"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add task"
          accessibilityState={{ disabled: !canCreate || capturing || draft.text.trim() === "" }}
          disabled={!canCreate || capturing || draft.text.trim() === ""}
          onPress={() => void capture()}
          className="size-11 items-center justify-center rounded-full disabled:opacity-50"
        >
          <SymbolView name="plus" size={20} tintColorClassName="accent-icon" />
        </Pressable>
      </View>
      {workspace.error && !data ? (
        <Text className="p-4 text-base text-danger-foreground">{workspace.error}</Text>
      ) : !data ? (
        <Text className="p-4 text-base text-foreground-muted">Loading tasks…</Text>
      ) : !data.aiosConnected && data.tasks.length === 0 ? (
        <Text className="p-4 text-base text-foreground-muted">
          This computer has no task folder yet. Add a task to start one.
        </Text>
      ) : tasks.length === 0 ? (
        <Text className="p-4 text-base text-foreground-muted">
          {focus === "inbox"
            ? "Nothing waiting in the Inbox."
            : focus === "today"
              ? "Nothing due today."
              : "Nothing scheduled."}
        </Text>
      ) : (
        tasks.map((task) => (
          <DailyTaskRow
            key={task.id}
            task={task}
            now={now}
            projectName={projectName(task)}
            projects={projects}
            disabled={!canEdit || busy.has(task.id)}
            onPatch={(patch, title) => void update(task, patch, title)}
          />
        ))
      )}
    </SettingsSection>
  );
}

function DailyTaskRow(props: {
  readonly task: TaskBoardTask;
  readonly now: number;
  readonly projectName: string | null;
  readonly projects: ReadonlyArray<{ readonly slug: string; readonly name: string }>;
  readonly disabled: boolean;
  readonly onPatch: (patch: CardPatch, failureTitle: string) => void;
}) {
  const { task, now, disabled, onPatch } = props;
  const done = task.status === "done";
  const dueLabel = formatDue(task.due, now);
  const detail = [dueLabel, props.projectName].filter(Boolean).join(" · ");
  const toggle = () =>
    onPatch(
      { status: toggleCompletionStatus(task.status) },
      done ? "Could not reopen task" : "Could not complete task",
    );

  return (
    <View className="flex-row items-center gap-1 border-t border-border-subtle px-2 py-2">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        accessibilityState={{ checked: done, disabled }}
        disabled={disabled}
        onPress={toggle}
        className="size-11 items-center justify-center disabled:opacity-50"
      >
        <SymbolView
          name={done ? "checkmark.circle" : "circle"}
          size={22}
          tintColorClassName={done ? "accent-primary" : "accent-icon"}
        />
      </Pressable>
      <View className="min-w-0 flex-1 gap-0.5 py-1">
        <Text
          className={
            done ? "text-base text-foreground-muted line-through" : "text-base text-foreground"
          }
          numberOfLines={2}
        >
          {task.title}
        </Text>
        {detail ? (
          <Text
            className={
              dueLabel?.startsWith("Overdue") && !done
                ? "text-sm text-danger-foreground"
                : "text-sm text-foreground-muted"
            }
            numberOfLines={1}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      <Menu
        actions={[
          { id: "toggle", title: done ? "Reopen" : "Complete", attributes: { disabled } },
          {
            id: "due",
            title: "Due date",
            subactions: [
              ...quickDueOptions(now).map((option) => ({
                id: `due:${option.due}`,
                title: option.label,
                state: task.due === option.due ? ("on" as const) : ("off" as const),
                attributes: { disabled },
              })),
              {
                id: "due:clear",
                title: "Clear due date",
                attributes: { disabled: disabled || !task.due, destructive: true },
              },
            ],
          },
          {
            id: "project",
            title: "Move to",
            subactions: [
              {
                id: "project:",
                title: "Inbox",
                state: taskSectionSlug(task) === INBOX_SECTION ? "on" : "off",
                attributes: { disabled },
              },
              ...props.projects.map((project) => ({
                id: `project:${project.slug}`,
                title: project.name,
                state: taskSectionSlug(task) === project.slug ? ("on" as const) : ("off" as const),
                attributes: { disabled },
              })),
            ],
          },
        ]}
        onPressAction={({ nativeEvent }) => {
          const id = nativeEvent.event;
          if (id === "toggle") {
            toggle();
          } else if (id === "due:clear") {
            onPatch({ due: null }, "Could not clear due date");
          } else if (id.startsWith("due:")) {
            onPatch({ due: id.slice("due:".length) }, "Could not change due date");
          } else if (id.startsWith("project:")) {
            const slug = id.slice("project:".length);
            onPatch({ projectSlug: slug === "" ? null : slug }, "Could not change the project");
          }
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${task.title}`}
          className="size-11 items-center justify-center"
        >
          <SymbolView
            name="ellipsis"
            size={18}
            tintColorClassName="accent-icon"
            type="monochrome"
          />
        </Pressable>
      </Menu>
    </View>
  );
}

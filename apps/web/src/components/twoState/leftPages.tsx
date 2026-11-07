import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

import { DetachedTabContext } from "./detachedTab";
import { WindowLoading } from "./RailWindow";
import { type LeftPage, useTwoStateStore } from "./twoStateStore";

const named = <K extends string>(
  load: () => Promise<Record<K, ComponentType>>,
  name: K,
): ComponentType =>
  lazy(() => load().then((module) => ({ default: module[name] as ComponentType })));

/** Rail pages the split can keep on the left while a chat is open. Each one reads no route params. */
const PAGES: Readonly<Record<string, ComponentType>> = {
  "/meetings": named(() => import("~/components/meetings/MeetingsPage"), "MeetingsPage"),
  "/inbox": named(() => import("~/components/windows/inbox/InboxWindow"), "InboxWindow"),
  "/today": named(() => import("~/components/windows/today/TodayWindow"), "TodayWindow"),
  "/tasks": named(() => import("~/components/taskBoard/TasksPage"), "TasksPage"),
  "/projects": named(
    () => import("~/components/windows/projects/ProjectsWindow"),
    "ProjectsWindow",
  ),
  "/memory": named(() => import("~/components/windows/memory/MemoryWindow"), "MemoryWindow"),
  "/library": named(() => import("~/components/windows/library/LibraryWindow"), "LibraryWindow"),
  "/images": named(() => import("~/components/images/ImagesPage"), "ImagesPage"),
  "/marketing": named(() => import("~/components/marketing/MarketingView"), "MarketingView"),
  "/content": named(() => import("~/components/content/ContentView"), "ContentView"),
  "/files": named(() => import("~/components/windows/files/FilesWindow"), "FilesWindow"),
  "/subagents": named(
    () => import("~/components/windows/subagents/SubagentsWindow"),
    "SubagentsWindow",
  ),
  "/team": named(() => import("~/components/windows/team/TeamWindow"), "TeamWindow"),
};

// Scribe takes its tab as props; the module check keeps an unknown saved tab on Home.
const ScribeLeft = lazy(() =>
  import("~/components/scribe/ScribePage").then(({ ScribePage, isScribeTabId }) => ({
    default: (props: { readonly tab: string | null; readonly onTab: (tab: string) => void }) => (
      <ScribePage tab={isScribeTabId(props.tab) ? props.tab : "home"} onTabChange={props.onTab} />
    ),
  })),
);

/** True when the split can keep this path on the left. */
export const isLeftPagePath = (path: string) =>
  path === "/command-center" || path === "/scribe" || path in PAGES;

/**
 * The remembered rail page for the left pane, with its tab kept in the store instead of the URL,
 * because the URL belongs to the chat. Null when no page is remembered or it is the Command Center.
 */
export function LeftPagePane({ page }: { readonly page: LeftPage | null }): ReactNode {
  const rememberLeftPage = useTwoStateStore((state) => state.rememberLeftPage);
  if (!page) return null;
  const setTab = (tab: string | null) => rememberLeftPage({ path: page.path, tab });
  if (page.path === "/scribe") {
    return (
      <Suspense fallback={<WindowLoading />}>
        <ScribeLeft tab={page.tab} onTab={(next) => setTab(next === "home" ? null : next)} />
      </Suspense>
    );
  }
  const Page = PAGES[page.path];
  if (!Page) return null;
  return (
    <DetachedTabContext value={{ tab: page.tab, setTab }}>
      <Suspense fallback={<WindowLoading />}>
        <Page />
      </Suspense>
    </DetachedTabContext>
  );
}

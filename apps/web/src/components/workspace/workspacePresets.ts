import type { AiosWorkspaceType } from "@t3tools/contracts";
import { BriefcaseIcon, CandlestickChartIcon, UserIcon, type LucideIcon } from "lucide-react";

/** One card in the New workspace dialog. A new kind of workspace is one more entry here. */
export interface WorkspacePreset {
  readonly type: AiosWorkspaceType;
  readonly name: string;
  readonly line: string;
  readonly icon: LucideIcon;
  /** The Name field starts with this. Empty means the person types it. */
  readonly defaultName: string;
  /** The folder beside the managed `projects` folder that holds new workspaces of this kind. */
  readonly folderParent: string;
  /** True when "Use an existing folder" is offered (the setup adds only workspace.json). */
  readonly existingFolder: boolean;
  /** The page the app opens once the new workspace is active. */
  readonly landing: "/command-center" | "/trading/dashboard";
}

export const WORKSPACE_PRESETS: ReadonlyArray<WorkspacePreset> = [
  {
    type: "personal",
    name: "Personal",
    line: "Your own tasks, notes and projects",
    icon: UserIcon,
    defaultName: "Personal",
    folderParent: "workspaces",
    existingFolder: true,
    landing: "/command-center",
  },
  {
    type: "business",
    name: "Business",
    line: "A team with an Owner, roles and a Home",
    icon: BriefcaseIcon,
    defaultName: "",
    folderParent: "businesses",
    existingFolder: false,
    landing: "/command-center",
  },
  {
    type: "trading",
    name: "Trading",
    line: "Accounts, journal and risk limits",
    icon: CandlestickChartIcon,
    defaultName: "Trading",
    folderParent: "workspaces",
    existingFolder: true,
    landing: "/trading/dashboard",
  },
];

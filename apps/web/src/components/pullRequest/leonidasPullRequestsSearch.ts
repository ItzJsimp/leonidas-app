import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

import type { PullRequestListPreferences } from "./pullRequestListPreferences";

export interface PullRequestsSearch extends PullRequestListPreferences {
  /**
   * Narrows the list to one server. Absent means every connected one, which is the default the
   * page has now — so a link written before servers could be chosen still opens the whole list.
   */
  readonly environmentId?: EnvironmentId;
  /** Scopes the list. Separate from the selection so one cannot silently change the other. */
  readonly projectId?: ProjectId;
  /**
   * Narrows the list to one host, named as the host itself: two GitHub installs are two
   * accounts, and their shared provider kind cannot tell them apart. Absent means every host.
   */
  readonly host?: string;
  readonly repository?: string;
  readonly number?: number;
  readonly selectedProjectId?: ProjectId;
  /** Host of the open review; changing tabs must not narrow the list host filter. */
  readonly selectedHost?: string;
  /**
   * Which server the selected pull request was read from. A project id only names a project on
   * its own server, so this is what tells two servers holding one project apart. Optional: a
   * link without it still opens, resolved by project id alone where that is unambiguous.
   */
  readonly selectedEnvironmentId?: EnvironmentId;
}

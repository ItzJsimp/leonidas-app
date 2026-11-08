export interface GitActionFacts {
  /** The worktree folder of the calling thread. Null when the thread works in the project folder. */
  readonly worktreePath: string | null;
  /** The branch the thread was made for. */
  readonly threadBranch: string | null;
  readonly isRepo: boolean;
  /** The branch checked out in that folder now. Null when detached. */
  readonly currentBranch: string | null;
  readonly isDefaultBranch: boolean;
}

const PROTECTED = new Set(["main", "master", "trunk", "develop"]);

/**
 * Why a commit, push or pull request from an agent must not run, or null when it may. The tool has no
 * branch, folder or force input, so this guard is the whole rule: only the thread's own branch, in its
 * own worktree, never a default branch. Landing on `main` stays with the merge queue.
 */
export function gitActionRefusal(facts: GitActionFacts): string | null {
  if (facts.worktreePath === null)
    return "This thread has no worktree of its own. Use leo_worktree_handoff first.";
  if (!facts.isRepo) return "The thread worktree is not a git repository.";
  if (facts.currentBranch === null)
    return "The worktree has no branch checked out (detached HEAD).";
  if (facts.isDefaultBranch || PROTECTED.has(facts.currentBranch))
    return `Refused: ${facts.currentBranch} is a protected branch. Land work on main with the merge queue.`;
  if (facts.threadBranch === null || facts.threadBranch !== facts.currentBranch)
    return "Refused: the checked-out branch is not this thread's branch.";
  return null;
}

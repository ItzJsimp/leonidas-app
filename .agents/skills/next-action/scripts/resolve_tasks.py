"""Bounded task-store discovery, ranking, and execution routing with a workspace-local relative-path cache."""
import argparse
import json
import os
import re
import sys
from pathlib import Path


def project_slug(workspace, store_root):
    try:
        parts = workspace.relative_to(store_root).parts
    except ValueError:
        return None
    return parts[1] if len(parts) >= 2 and parts[0] == "projects" else None


def canonical_store(folder, workspace):
    # Generated project views have one write path in the parent AIOS.
    readme = folder / "README.md"
    is_view = readme.is_file() and "generated view" in readme.read_text(encoding="utf-8").lower()
    if is_view:
        for parent in workspace.parents:
            if (parent / "projects").is_dir() and (parent / "tasks").is_dir():
                return parent / "tasks"
    return folder


def detect_project_context(workspace, store_root=None):
    """Detect the active project name (e.g. 'leonidas-code') even in standalone checkouts."""
    workspace = Path(workspace).resolve()
    # 1. Standard AIOS projects/<slug> layout
    if store_root:
        slug = project_slug(workspace, store_root)
        if slug:
            return slug
    for p in (workspace, *workspace.parents):
        try:
            parts = p.parts
            if "projects" in parts:
                idx = parts.index("projects")
                if idx + 1 < len(parts):
                    return parts[idx + 1]
        except Exception:
            pass

    # 2. Check for leonidas-code indicators
    for p in (workspace, *workspace.parents):
        if p.name.lower() in ("leonidas-code", "leonidas_code", "t3-code", "t3code"):
            return "leonidas-code"
        if (p / "leonidas-release.json").is_file():
            return "leonidas-code"
        pkg = p / "package.json"
        if pkg.is_file():
            try:
                data = json.loads(pkg.read_text(encoding="utf-8"))
                name = data.get("name", "")
                if "leonidas-code" in name or "@t3tools" in name:
                    return "leonidas-code"
            except Exception:
                pass
        proj_md = p / "project.md"
        if proj_md.is_file():
            try:
                for line in proj_md.read_text(encoding="utf-8").splitlines():
                    if line.startswith("# "):
                        slug_val = line.replace("# ", "").strip().lower().replace(" ", "-")
                        if slug_val:
                            return slug_val
            except Exception:
                pass

    # 3. Check for standalone git repo root (not AIOS root)
    for p in (workspace, *workspace.parents):
        if (p / ".git").is_dir() and not (p / "dashboards").is_dir() and not (p / "projects").is_dir():
            return p.name.lower()

    return None


SHARED_LANES = {"", "agent", "leonidas", "draft", "grill", "shared"}


def detect_user(explicit_user=None):
    """Explicit canon identity wins; account names are only fallback hints."""
    value = (explicit_user or os.environ.get("USERNAME") or os.environ.get("USER") or "user").lower().strip()
    aliases = {}  # owner aliases: add per user
    return aliases.get(value, value)


def parse_task_card(file_path):
    """Parse YAML frontmatter and key markdown sections from a task card."""
    try:
        text = file_path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return None
    fm_match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.DOTALL)
    if not fm_match:
        return None
    fm_text, body = fm_match.group(1), fm_match.group(2)
    meta = {}
    for line in fm_text.splitlines():
        if ":" in line:
            parts = line.split(":", 1)
            meta[parts[0].strip()] = parts[1].strip().strip("\"'")
    why_match = re.search(r"## Why\s*\n(.*?)(?=\n##|\Z)", body, re.DOTALL)
    why = why_match.group(1).strip() if why_match else ""
    if not why:
        # Cards without "## Why": use the first prose paragraph under the title.
        for para in re.split(r"\n\s*\n", body):
            para = para.strip()
            if para and not para.startswith(("#", "---", "|", "- [")):
                why = para[:300]
                break
    start_match = re.search(r"## Start here\s*\n(.*?)(?=\n##|\Z)", body, re.DOTALL)
    start_here = start_match.group(1).strip() if start_match else ""
    done_match = re.search(r"## Done when\s*\n(.*?)(?=\n##|\Z)", body, re.DOTALL)
    done_when = done_match.group(1).strip() if done_match else ""
    return {
        "id": meta.get("id", file_path.stem),
        "name": meta.get("name", file_path.stem),
        "status": meta.get("status", "Unknown"),
        "priority": meta.get("priority", "Medium"),
        "energy_type": meta.get("energy_type", "Strategic"),
        "effort": meta.get("effort", "Medium"),
        "lane": meta.get("lane", ""),
        "owner": meta.get("owner", ""),
        "project": meta.get("project", ""),
        "autonomous": meta.get("autonomous", "false").lower() == "true",
        "blocked_by": meta.get("blocked_by", "").strip("[] "),
        "why": why,
        "start_here": start_here,
        "done_when": done_when,
        "path": str(file_path.resolve()),
        "url": file_path.resolve().as_uri(),
        "filename": file_path.name,
    }


def find_task_files(folder, workspace, project_filter=None):
    """Discover real task cards, resolving views and symlinks even across separate checkouts."""
    folder = Path(folder).resolve()
    workspace = Path(workspace).resolve()
    cards = []
    seen_paths = set()

    def add_card(p):
        rp = p.resolve()
        if rp in seen_paths:
            return
        if not rp.is_file() or rp.name in ("README.md", "tasks-index.md"):
            return
        c = parse_task_card(rp)
        if c:
            seen_paths.add(rp)
            cards.append(c)

    # 1. Scan designated folder
    if folder.is_dir():
        for entry in folder.iterdir():
            if entry.name.endswith(".md"):
                if entry.is_symlink():
                    resolved = entry.resolve()
                    if resolved.exists():
                        add_card(resolved)
                    else:
                        filename = entry.name
                        found = False
                        for ancestor in (workspace, *workspace.parents):
                            cand = ancestor / "tasks" / filename
                            if cand.is_file():
                                add_card(cand)
                                found = True
                                break
                        if not found and folder.parent != folder:
                            for ancestor in folder.parent.parents:
                                cand = ancestor / "tasks" / filename
                                if cand.is_file():
                                    add_card(cand)
                                    break
                else:
                    add_card(entry)

    # 2. Fall back to parent tasks if empty
    if len(cards) == 0:
        for ancestor in (workspace, *workspace.parents):
            cand_tasks = ancestor / "tasks"
            if cand_tasks.is_dir() and cand_tasks.resolve() != folder:
                for entry in cand_tasks.iterdir():
                    if entry.name.endswith(".md") and entry.name not in ("README.md", "tasks-index.md"):
                        add_card(entry)
                if cards:
                    break

    # 3. Filter by project if requested
    if project_filter:
        p_clean = project_filter.lower().replace("projects/", "").strip()
        filtered = []
        for c in cards:
            proj = c["project"].lower().replace("projects/", "").strip()
            fname = c["filename"].lower()
            local_store = folder.parent in (workspace, *workspace.parents) and not (folder.parent / "projects").is_dir()
            if proj == p_clean or (not proj and (local_store or p_clean in fname or (p_clean == "leonidas-code" and "t3-code" in fname))):
                filtered.append(c)
        return filtered

    return cards


def score_task(task, user="user", energy="all", focus="all"):
    """Score a task based on status, operator affinity, priority, energy, and focus."""
    status = task["status"].lower()
    if status not in {"ready", "not started", "in progress", "in-progress", "awaiting review"}:
        return -9999
    score = 0
    if task.get("blocked_by"):
        score -= 40
    if status == "awaiting review":
        score += 5  # review backlog is real work, but ranks behind ready work
    elif any(s in status for s in ["in progress", "ready", "not started"]):
        score += 20

    user = (user or "user").lower()
    lane = task["lane"].lower()
    owner = task["owner"].lower()
    text = (task["name"] + " " + task["why"]).lower()

    # Another person's personal lane is never recommended; shared lanes are open to everyone.
    if lane not in SHARED_LANES and lane != user:
        return -9999
    if lane == user or owner == user:
        score += 60
    if lane in ("leonidas", "agent", "draft", "grill"):
        score += 15

    prio = task["priority"].lower()
    if "critical" in prio or "urgent" in prio:
        score += 50
    elif "high" in prio:
        score += 30
    elif "medium" in prio:
        score += 15
    elif "low" in prio:
        score += 5

    energy = (energy or "all").lower()
    e_type = task["energy_type"].lower()
    effort = task["effort"].lower()
    if energy == "low":
        if any(w in e_type for w in ["quick win", "chores", "review", "admin", "triage"]):
            score += 40
        if effort == "low":
            score += 30
        if effort == "high":
            score -= 30
    elif energy == "medium":
        if any(w in e_type for w in ["feature", "refactor", "implementation", "documentation", "strategic"]):
            score += 30
        if effort == "medium":
            score += 20
    elif energy == "high":
        if any(w in e_type for w in ["deep work", "strategic", "build", "architecture"]):
            score += 40
        if effort == "high":
            score += 30
        if effort == "low":
            score -= 10

    focus = (focus or "all").lower()
    if focus == "code":
        if any(w in text for w in ["fix", "build", "component", "hook", "ui", "api", "refactor", "feature"]):
            score += 25
    elif focus == "arch":
        if any(w in text for w in ["decision", "architecture", "plan", "spec", "standard", "model", "protocol"]):
            score += 25
    elif focus == "review":
        if any(w in text for w in ["test", "verify", "audit", "check", "drift", "lint", "regression"]):
            score += 25

    return score


def assign_execution_route(task):
    """Determine best execution route: in-chat, prompt-composer (new chat), or subagents."""
    effort = task["effort"].lower()
    e_type = task["energy_type"].lower()
    is_auto = task["autonomous"]
    title = task["name"].lower()
    lane = task.get("lane", "").lower()

    if task["status"].lower() == "awaiting review":
        return {"route": "review", "badge": "🟡 Review", "action": "Check the finished work", "reason": "Work is done and waits for a check against Done when."}
    if lane == "grill":
        return {"route": "grill", "badge": "🟠 Grill First", "action": "Settle the open decisions with the grilling skill", "reason": "Card lane is grill: decisions are open and only the operator can settle them."}
    if lane == "human":
        return {"route": "human", "badge": "⚪ Human Steps", "action": "Walk the operator through the manual steps", "reason": "Card lane is human: the steps need the operator's own accounts or hands."}
    if is_auto and task.get("start_here") and task.get("done_when") and task.get("lane", "").lower() in SHARED_LANES - {"grill"}:
        return {
            "route": "subagent",
            "badge": "🟣 Subagent-Ready",
            "action": "Delegate to Subagent",
            "reason": "Candidate only: inspect boundaries and dependencies before offering delegation.",
        }
    if effort == "low" or "quick win" in e_type:
        return {
            "route": "in-chat",
            "badge": "🟢 In-Chat Execution",
            "action": "Bang it out right here",
            "reason": "Compact scope and clear finish line; fast and easy to resolve in this session.",
        }
    return {
        "route": "prompt-composer",
        "badge": "🔵 New Chat (Prompt Composer)",
        "action": "Spin up fresh chat with tailored prompt",
        "reason": "Deep architectural focus requiring dedicated context and extended reasoning.",
    }


def draft_prompt_composer(task, project="current project"):
    """Draft a production-ready agent prompt according to the prompt-composer standard."""
    title = task.get("name", "Task")
    why = task.get("why", "")
    start_here = task.get("start_here", "")
    done_when = task.get("done_when", "")
    path = task.get("path", "")

    return f"""<task>
{title}
</task>

<context>
- Project: {project}
- Task Card: {path}
- Objective: {why}
{f'- Start Here: {start_here}' if start_here else ''}
</context>

<rules>
- Read the exact task card and workspace instructions; confirm current status and acceptance gates.
- Preserve concurrent edits; run the smallest checks that prove this task.
- DO NOT edit unrelated files outside this task scope.
</rules>

<verification>
{done_when if done_when else '- Verify all acceptance criteria and run project test suite.'}
</verification>"""


def rank_tasks(folder, workspace, project=None, user=None, energy="all", focus="all", limit=5):
    """Find, score, rank, and route candidate tasks."""
    cards = find_task_files(folder, workspace, project_filter=project)
    scored = []
    for c in cards:
        s = score_task(c, user=user, energy=energy, focus=focus)
        if s > -1000:
            route = assign_execution_route(c)
            c["score"] = s
            c["route"] = route
            scored.append((s, c))
    scored.sort(key=lambda x: (-x[0], x[1]["id"]))
    top = [c for _, c in scored[:limit]]
    return top, len(scored)


def resolve(workspace, tasks_dir=None, all_projects=False, save=True, rank=False, energy="all", focus="all", user=None, project=None, limit=5):
    workspace = Path(workspace).resolve()
    if not workspace.is_dir():
        raise ValueError("Workspace must be an existing directory")
    cache = workspace / ".agents" / "next-action.json"
    folder = None
    source = "discovered"
    if tasks_dir:
        folder = Path(tasks_dir)
        if not folder.is_absolute():
            folder = workspace / folder
        if not folder.is_dir():
            raise ValueError("Explicit task folder does not exist")
        source = "explicit"
    elif cache.is_file():
        try:
            data = json.loads(cache.read_text(encoding="utf-8"))
            cached = workspace / data["tasks_dir"]
            if cached.is_dir():
                folder = cached
                source = "cache"
        except (ValueError, KeyError, TypeError):
            pass
    if folder is None:
        for parent in (workspace, *workspace.parents):
            if parent == parent.parent:
                break
            candidate = parent / "tasks"
            if candidate.is_dir():
                folder = candidate
                break
    if folder is None:
        return {"status": "not_found", "workspace": str(workspace)}
    folder = folder.resolve() if source == "cache" else canonical_store(folder.resolve(), workspace).resolve()
    # Prove readability without scanning or loading every task.
    with os.scandir(folder) as entries:
        next(entries, None)
    payload = {"version": 1, "tasks_dir": os.path.relpath(folder, workspace).replace(os.sep, "/")}
    cache_error = None
    if save:
        try:
            cache.parent.mkdir(parents=True, exist_ok=True)
            ignore = cache.parent / ".gitignore"
            previous = ignore.read_text(encoding="utf-8") if ignore.exists() else ""
            if "next-action.json" not in previous.splitlines():
                with ignore.open("a", encoding="utf-8") as stream:
                    stream.write(("\n" if previous and not previous.endswith("\n") else "") + "next-action.json\n")
            # Avoid rewriting a valid cache on every invocation.
            content = json.dumps(payload, indent=2) + "\n"
            if not cache.exists() or cache.read_text(encoding="utf-8") != content:
                cache.write_text(content, encoding="utf-8")
        except OSError as error:
            cache_error = str(error)

    detected_proj = project or detect_project_context(workspace, folder.parent)
    effective_user = detect_user(user)

    result = {
        "status": "found",
        "tasks_dir": str(folder),
        "store_root": str(folder.parent),
        "project": None if all_projects else project_slug(workspace, folder.parent),
        "source": source,
        "cache_error": cache_error,
    }

    if rank:
        top_tasks, total_found = rank_tasks(
            folder, workspace,
            project=None if all_projects else (project or detected_proj),
            user=effective_user,
            energy=energy,
            focus=focus,
            limit=limit
        )
        result["detected_project"] = detected_proj
        result["user"] = effective_user
        result["energy"] = energy
        result["focus"] = focus
        result["total_tasks"] = total_found
        result["tasks"] = top_tasks

    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", default=".")
    parser.add_argument("--tasks-dir")
    parser.add_argument("--all-projects", action="store_true")
    parser.add_argument("--rank", action="store_true", help="Rank and route top candidate tasks")
    parser.add_argument("--energy", default="all", choices=["all", "low", "medium", "high"])
    parser.add_argument("--focus", default="all", choices=["all", "code", "arch", "review"])
    parser.add_argument("--user", help="Explicit user (your name)")
    parser.add_argument("--project", help="Explicit project name")
    parser.add_argument("--limit", type=int, default=5, help="Candidates to return (use 12 to pre-read the pool)")
    parser.add_argument("--draft-prompt", type=int, help="Output prompt composer draft for task 1-5")
    args = parser.parse_args()
    try:
        result = resolve(
            args.workspace,
            args.tasks_dir,
            args.all_projects,
            rank=args.rank or bool(args.draft_prompt),
            energy=args.energy,
            focus=args.focus,
            user=args.user,
            project=args.project,
            limit=args.limit,
        )
    except (OSError, ValueError) as error:
        print(json.dumps({"status": "error", "error": str(error)}))
        return 1

    if args.draft_prompt and result.get("tasks"):
        idx = args.draft_prompt - 1
        tasks = result["tasks"]
        if 0 <= idx < len(tasks):
            task = tasks[idx]
            proj_name = task.get("project") or result.get("detected_project") or result.get("project") or "this project"
            prompt = draft_prompt_composer(task, proj_name)
            print(prompt)
            return 0
        else:
            print(f"Task index {args.draft_prompt} out of range (1-{len(tasks)})", file=sys.stderr)
            return 1

    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "found" else 2


if __name__ == "__main__":
    sys.exit(main())

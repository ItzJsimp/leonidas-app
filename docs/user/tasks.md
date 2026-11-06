# Tasks

Open **Tasks** to capture work for yourself and your agents. Type a title in the quick-add field and press Enter, or choose **New task** to add details, a priority, and a project. New tasks are saved in your connected Leonidas environment; an AIOS folder is optional. Existing AIOS tasks also appear when connected.

Choose **New project…** when creating a task to organize personal work without a code repository. That project appears in Tasks once you save its first task.

## Plan your day

**Inbox** holds tasks without a project. **Today** includes tasks due today and overdue work. **Upcoming** shows dated work starting today. Dates follow the calendar day in your device's timezone.

Open a task to change its due date or project. Clearing the date removes it from Today and Upcoming. Use the circle beside a task to complete it; enable **Show closed** to find completed work and reopen it.

## Work with agents and people

Choose **Send to agent** on a task to start work explicitly. The task records the linked thread, and the agent can report progress and completion through the task tools. Creating or assigning a task does not start an agent automatically.

To share tasks, link them to a Leonidas project connected to a GitHub repository and choose **Share with collaborators**. Collaborators need access to that repository. Sharing uses the existing project board; it is not a separate team account or invitation system.

## Release roadmaps

Open **Tasks → Roadmap** to see the path from a project’s current version to its target release. The connected map links versions in release order and branches into each milestone’s tasks. Use zoom to explain the overall path, select a task node for its brief and actions, or switch to **Milestone details** for goals and task lists. **Add planned tasks** turns the briefs into ordinary editable tasks; repeating it adds only missing briefs. Open a task to change or clear its version milestone, complete/reopen it, or explicitly send it to an agent.

Leonidas includes a V0.21 to V1.0 plan. Milestones describe intended scope, not published versions or promised dates. V1.0 requires a verified candidate and explicit owner approval for public launch. Other coding projects can define their version path in a `project-roadmap.json` at the workspace root, using Leonidas’s plan as a starting example. Task assignments persist with their task cards and follow the existing project sharing flow.

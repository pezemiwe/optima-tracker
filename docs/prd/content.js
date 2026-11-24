'use strict';
/*
 * Cortex Tracker BRD/PRD: all document content as data.
 * Status:  D = Delivered (in the current build), P = Partial, N = Planned, X = Out of scope for this horizon
 * Priority: M = Must, S = Should, C = Could, W = Won't (this horizon)
 * Release: which release delivers it (R1 is the current build)
 */

const doc = {
  product: 'Cortex Tracker',
  title: 'Business & Product Requirements Document',
  version: '1.0',
  date: '24 November 2026',
  status: 'Draft for review',
};

/* ---------- business requirements ---------- */
const businessRequirements = [
  ['BR-01', 'One place to plan, track and report work', 'Replace spreadsheets, chat threads and scattered tools with a single system of record for projects, tasks and decisions.', 'Teams run their weekly planning and status reporting entirely in Cortex Tracker.'],
  ['BR-02', 'Parity on core work management with Jira, ClickUp and Asana', 'Tasks, views, agile planning and collaboration must match what small and mid-size teams expect from the market leaders (Release 1). Automation, integrations and insight follow by Release 4.', 'Capability matrix (section 3.2): no "Must" parity row left uncovered by Release 4.'],
  ['BR-03', 'Fast and simple to adopt', 'Setup in minutes, first task in minutes, and a responsive interface that stays fast on large projects.', 'Median time to first task under 5 minutes; a 10,000-task project usable in under 1 second.'],
  ['BR-04', 'Secure and auditable by default', 'Role-based access, hardened sign-in, and enterprise controls (SSO, two-factor, audit log, private projects) before enterprise sales.', 'Independent penetration test with no open high findings; SSO and audit log live by Release 3.'],
  ['BR-05', 'Low cost of ownership', 'Deployable by a small team on commodity hosting (one Node service and PostgreSQL) without specialist operations staff.', 'Production deployment in under 30 minutes by a non-specialist following the README.'],
  ['BR-06', 'Accessible to everyone', 'Usable with keyboard and assistive technology; meets WCAG 2.1 level AA.', 'Zero serious or critical automated findings on every main screen, checked on every release.'],
  ['BR-07', 'Easy to switch to', 'Import from Jira, Asana, ClickUp, Trello and CSV so adoption does not mean re-keying work.', 'A 1,000-task project imported with field mapping in under 15 minutes.'],
  ['BR-08', 'Fits the customer\'s stack', 'Public API, webhooks and first-party integrations so Cortex Tracker connects to chat, code and calendars.', 'Public API with documented scopes; Slack, Teams and GitHub integrations generally available by Release 4.'],
  ['BR-09', 'Continuity with the Optima close-out programme', 'Existing close-out data and the daily checklist workflow carry over without loss.', 'All legacy tasks, subtasks, owners and dates imported (delivered).'],
];

const kpis = [
  ['Activation', 'Share of invited users who create or complete a task within 7 days', 'Not yet measured', '≥ 80%'],
  ['Time to first task', 'Median minutes from sign-up to first task created', 'Not yet measured', '< 5 min'],
  ['Weekly active ratio', 'Weekly active members ÷ total members in active workspaces', 'Not yet measured', '≥ 60%'],
  ['Workspace retention', 'Workspaces still active 90 days after creation', 'Not yet measured', '≥ 80%'],
  ['Task throughput', 'Tasks completed per active member per week', 'Not yet measured', 'Trend up quarter on quarter'],
  ['Responsiveness', 'p95 API latency for task and board requests', 'Median 3–110 ms at 20,000 tasks (single instance, local database)', '< 300 ms p95 in production'],
  ['Availability', 'Monthly uptime of the hosted service', 'Not yet measured', '≥ 99.5%'],
  ['Accessibility', 'Serious or critical automated findings on main screens', '0 (light and dark themes)', '0 on every release'],
  ['Satisfaction', 'Net Promoter Score from in-app survey', 'Not yet measured', '≥ 40'],
];

/* ---------- competitive analysis ---------- */
const incumbents = [
  ['Jira', 'Deep issue types and configurable workflows; strong agile boards, sprints and reports; powerful query language; very large integration marketplace; enterprise-grade administration.', 'Heavy to configure and administer; steep learning curve for non-engineering teams; many capabilities sit in separate paid products.', 'Match sprints, backlog, dependencies and reports for software teams, but keep setup minimal and defaults sensible.'],
  ['ClickUp', 'Breadth: tasks, docs, goals, whiteboards, time tracking and automation in one product; very flexible views and custom fields; aggressive feature pace.', 'Large surface area can overwhelm new users and teams; perceived performance and consistency issues as workspaces grow.', 'Offer the breadth that matters (views, fields, automation, docs, goals) with a consistent, fast, keyboard-first interface.'],
  ['Asana', 'Clean, approachable interface; timelines, portfolios, goals and forms; strong for cross-functional and marketing work.', 'Less native depth for agile and engineering workflows; several advanced features gated to higher plans.', 'Match the clarity and portfolio-level visibility, while including agile planning as a first-class capability.'],
];

const positioning = 'For teams that have outgrown spreadsheets but find Jira heavy and ClickUp overwhelming, Cortex Tracker is a fast, focused work-management platform that covers planning, execution and reporting in one place, with minutes-to-deploy setup and full ownership of your data.';

const differentiators = [
  ['Fast at scale', 'A 10,000-task project becomes usable in about 0.3 seconds; list and board render in windows so the interface stays responsive.', 'Evidence in hand (benchmarked)'],
  ['Simple to run', 'One Node service and one PostgreSQL database; self-host or managed hosting; no separate search, queue or file services required to start.', 'Evidence in hand'],
  ['Opinionated, not empty', 'Sensible defaults (statuses, views, roles) so a team is productive before any configuration.', 'Hypothesis: to validate with pilot teams'],
  ['Accessible and keyboard-first', 'Command palette, shortcuts, keyboard alternatives to every drag-and-drop, WCAG AA scans in CI.', 'Evidence in hand'],
  ['Own your data', 'Data in the customer\'s own database; full export and deletion tooling planned (FR-IMP-05).', 'Partly delivered'],
];

/* Capability parity matrix. Values: F full, P partial, N none. Cortex now reflects the current build. */
const parity = [
  ['Work management', [
    ['Tasks, subtasks, priorities, labels', 'F', 'F', 'F', 'F', 'R1'],
    ['Task dependencies (blocks, related, duplicates)', 'F', 'F', 'F', 'P', 'R3'],
    ['Recurring tasks', 'P', 'F', 'F', 'P', 'R2'],
    ['Custom fields', 'F', 'F', 'F', 'P', 'R2'],
    ['Multiple assignees on a task', 'N', 'F', 'N', 'N', 'R3'],
    ['Task types and epics', 'F', 'P', 'P', 'N', 'R4'],
  ]],
  ['Views', [
    ['List', 'F', 'F', 'F', 'F', 'R1'],
    ['Board (Kanban)', 'F', 'F', 'F', 'F', 'R1'],
    ['Calendar', 'F', 'F', 'F', 'F', 'R1'],
    ['Timeline / Gantt', 'F', 'F', 'F', 'P', 'R4'],
    ['Table with configurable columns', 'P', 'F', 'F', 'N', 'R2'],
    ['Workload and capacity', 'P', 'F', 'F', 'P', 'R4'],
  ]],
  ['Agile', [
    ['Backlog and sprints', 'F', 'F', 'P', 'F', 'R1'],
    ['Story points and estimates', 'F', 'F', 'P', 'F', 'R1'],
    ['Burndown, velocity and sprint reports', 'F', 'F', 'P', 'P', 'R4'],
    ['Workflows with transitions and rules', 'F', 'P', 'N', 'P', 'R2'],
  ]],
  ['Collaboration', [
    ['Comments, mentions, activity history', 'F', 'F', 'F', 'F', 'R1'],
    ['Docs and wiki', 'P', 'F', 'P', 'N', 'R4'],
    ['Forms and request intake', 'F', 'F', 'F', 'N', 'R4'],
    ['Goals and OKRs', 'P', 'F', 'F', 'N', 'R4'],
    ['Live presence and instant updates', 'P', 'F', 'P', 'P', 'R2'],
  ]],
  ['Automation and integrations', [
    ['Automation rules', 'F', 'F', 'F', 'N', 'R2'],
    ['Public API and webhooks', 'F', 'F', 'F', 'N', 'R2'],
    ['Chat, code and calendar integrations', 'F', 'F', 'F', 'N', 'R4'],
    ['Import from other tools and CSV', 'F', 'F', 'F', 'N', 'R2'],
  ]],
  ['Insight', [
    ['Dashboards and reports', 'F', 'F', 'F', 'P', 'R4'],
    ['Time tracking', 'P', 'F', 'P', 'N', 'R4'],
    ['Portfolio and roadmap', 'F', 'P', 'F', 'N', 'R4'],
    ['AI assistance', 'F', 'F', 'F', 'N', 'R5'],
  ]],
  ['Security and administration', [
    ['Roles and permissions', 'F', 'F', 'F', 'P', 'R3'],
    ['Single sign-on and two-factor sign-in', 'F', 'F', 'F', 'N', 'R3'],
    ['Audit log', 'F', 'F', 'F', 'P', 'R3'],
    ['Data export and deletion tooling', 'F', 'F', 'F', 'N', 'R3'],
  ]],
  ['Platform', [
    ['Mobile apps', 'F', 'F', 'F', 'P', 'R5'],
    ['Self-hosted option', 'P', 'N', 'N', 'F', 'R1'],
  ]],
];

/* ---------- personas and roles ---------- */
const personas = [
  ['Programme or project manager', 'Plans work, tracks progress, reports to stakeholders.', 'Status lives in spreadsheets and email; hard to see what is late or blocked.', 'Timeline, dashboards, due-date views, daily checklist, Excel export, notifications.'],
  ['Team member (contributor)', 'Does the work; needs to know what to do next.', 'Updates in several tools; surprise assignments; lost context.', 'My Tasks, board, comments and mentions, inbox, keyboard shortcuts.'],
  ['Engineering or product lead', 'Runs sprints and keeps the backlog healthy.', 'Planning overhead; unclear scope changes; weak burndown visibility.', 'Backlog, sprints, story points, burndown, dependencies, saved views.'],
  ['Workspace administrator', 'Owns access, setup and compliance.', 'Onboarding friction; password resets; unclear who can see what.', 'Invitations, roles, reset links, project settings, custom fields, audit (planned).'],
  ['Executive stakeholder', 'Needs a clear picture without operating the tool.', 'Chasing updates; inconsistent reports.', 'Read-only (Viewer) access, Home dashboard, project progress, exports.'],
];

const permissionRows = [
  ['View projects, tasks, comments and files', 1, 1, 1, 1],
  ['Create and edit tasks, comment, attach files', 0, 1, 1, 1],
  ['Plan sprints, create projects and labels', 0, 1, 1, 1],
  ['Delete tasks they created', 0, 1, 1, 1],
  ['Delete any task or comment', 0, 0, 1, 1],
  ['Project settings, statuses, custom fields, archive and delete projects', 0, 0, 1, 1],
  ['Invite and remove members, change roles, create password reset links', 0, 0, 1, 1],
  ['Rename workspace', 0, 0, 1, 1],
  ['Manage owners and delete the workspace', 0, 0, 0, 1],
];

/* ---------- scope and releases ---------- */
const inScope = [
  'Work management: workspaces, projects, tasks, subtasks, dependencies, custom fields, recurrence.',
  'Planning and views: list, board, backlog and sprints, timeline, calendar, daily checklist, dashboards.',
  'Collaboration: comments, mentions, watchers, activity, notifications (in-app and email), files.',
  'Administration: roles, invitations, sign-in security, audit and enterprise controls.',
  'Automation, public API, webhooks and first-party integrations.',
  'Import, export and data portability.',
  'Insight: reports, workload, time tracking, goals, docs and forms.',
  'Assistive AI features, opt-in and administrator controlled.',
];
const outScope = [
  'Real-time chat or video meetings (integrate with chat tools instead).',
  'Whiteboard and diagramming canvas.',
  'Full CRM, helpdesk or ITSM suites (intake forms and automation cover light cases).',
  'Native desktop clients (web and mobile only).',
  'Marketplace for third-party paid apps (an app directory is a later consideration).',
  'Accounting, invoicing and payroll.',
];

const releases = [
  ['R1', 'Foundation', 'Delivered', 'Accounts, workspaces and roles; projects, tasks, subtasks, dependencies, recurrence; custom fields; list, board, backlog and sprints, timeline, calendar, daily views; filters and saved views; comments, mentions, notifications and email; files; markdown; home dashboard; Excel export; legacy import; conflict detection; accessibility scans and CI.', 'Delivered and verified (see section 10).'],
  ['R1.1', 'Brand alignment', 'Next', 'Rename the product to Cortex Tracker across the interface, emails, documents, favicon and repository; update deployment names.', 'No remaining "Optima" strings in user-facing surfaces.'],
  ['R2', 'Automate and connect', 'Q1 2027 (indicative)', 'Public API tokens and webhooks; automation rules v1 and status workflows; CSV import; custom-field filters and columns; table view; recurrence patterns; notification preferences; instant updates over WebSockets.', 'Rules and webhooks run reliably with an execution log; CSV import round-trips an export.'],
  ['R3', 'Scale and secure', 'Q2 2027 (indicative)', 'SSO (SAML, OIDC) and two-factor sign-in; audit log; guests and private projects; multiple assignees; object storage for files; full-text search; admin console; full data export and deletion; dependency-aware rescheduling.', 'Penetration test passed; enterprise security questionnaire answerable.'],
  ['R4', 'Insight and collaboration', 'Q3 2027 (indicative)', 'Custom dashboards and reports; velocity charts; workload and capacity; time tracking; docs; goals; forms; roadmaps; task types and epics; Slack, Teams and GitHub integrations.', 'Pilot customers run reporting and planning without exports to other tools.'],
  ['R5', 'Intelligence and ecosystem', 'Q4 2027 (indicative)', 'AI assistance; import from Jira, Asana, ClickUp and Trello; mobile apps; app directory groundwork.', 'AI features opt-in with audit; mobile parity for daily work.'],
];

/* ---------- functional requirements ---------- */
/* [id, requirement, priority, status, release, acceptance criteria] */
const modules = [
  {
    code: 'AUT', name: 'Accounts and authentication',
    goal: 'People can sign in safely, recover access without help, and administrators can raise the security bar as customers demand it.',
    rows: [
      ['01', 'Sign in with email and password; passwords are stored only as salted slow hashes and must be at least 8 characters.', 'M', 'D', 'R1', 'Wrong email and wrong password give the same message and similar response time.'],
      ['02', 'First-run setup creates the owner and workspace; afterwards sign-up requires an invitation.', 'M', 'D', 'R1', 'A second visitor without an invite cannot create an account.'],
      ['03', 'Sessions use a random token in an HttpOnly, SameSite cookie (Secure in production), 30 days with sliding renewal; sign out ends the session.', 'M', 'D', 'R1', 'Token stored only as a hash; expired or revoked sessions return 401.'],
      ['04', 'Forgot password by email: single-use link valid for 1 hour; the response never reveals whether an account exists; resetting signs out every other session.', 'M', 'D', 'R1', 'Same response for known and unknown email; link works once.'],
      ['05', 'Administrators can create a one-time reset link (24 hours) when email is unavailable; the action is recorded.', 'S', 'D', 'R1', 'Link works once; appears in the activity feed.'],
      ['06', 'Change password with the current password; other devices are signed out.', 'M', 'D', 'R1', 'Old sessions return 401 after change.'],
      ['07', 'Profile: display name, avatar colour, theme (auto, light, dark), and email-notification opt-out.', 'S', 'D', 'R1', 'Changes persist across devices.'],
      ['08', 'Rate limiting on sign-in, sign-up and reset requests per address.', 'M', 'D', 'R1', 'Excess attempts return 429 with Retry-After.'],
      ['09', 'Cross-site request protection: writes from another origin are rejected.', 'M', 'D', 'R1', 'Request with foreign Origin returns 403.'],
      ['10', 'Two-factor authentication (authenticator app) with recovery codes; administrators can require it for all members.', 'S', 'N', 'R3', 'Required 2FA blocks access until enrolled.'],
      ['11', 'Single sign-on with SAML 2.0 and OpenID Connect, just-in-time provisioning and enforced domains.', 'S', 'N', 'R3', 'Members of a verified domain can only sign in through the identity provider.'],
      ['12', 'Account security page: list active sessions and devices, revoke any, view sign-in history.', 'C', 'N', 'R3', 'Revoked session fails on its next request.'],
      ['13', 'Email verification for new accounts and account lockout after repeated failures.', 'S', 'N', 'R3', 'Unverified accounts cannot accept invitations.'],
      ['14', 'SCIM provisioning and deprovisioning from identity providers.', 'C', 'N', 'R5', 'Deactivated user loses access within 5 minutes.'],
    ],
  },
  {
    code: 'WSP', name: 'Workspaces, members and invitations',
    goal: 'A workspace is the security and billing boundary. Admins control who joins and what they can do.',
    rows: [
      ['01', 'A user can belong to several workspaces and switch between them; workspaces are fully isolated.', 'M', 'D', 'R1', 'Resources in other workspaces return 404.'],
      ['02', 'Four roles (Owner, Admin, Member, Viewer) enforced on every request (see section 4.2).', 'M', 'D', 'R1', 'Each permission in the matrix verified by automated tests.'],
      ['03', 'Invite by email: single-use link bound to the invited address, role chosen, valid 14 days, emailed automatically when email is configured, otherwise shown once to the admin.', 'M', 'D', 'R1', 'Link works once; another account cannot use it.'],
      ['04', 'Accept an invitation as a new or an existing account.', 'M', 'D', 'R1', 'Existing account sees a pending-invite prompt.'],
      ['05', 'Placeholder members: imported names can be claimed by an invitation so history stays attached to the real person.', 'S', 'D', 'R1', 'Tasks of the placeholder move to the new account.'],
      ['06', 'Change a member\'s role, remove a member (their tasks become unassigned), or leave; a workspace always keeps at least one owner.', 'M', 'D', 'R1', 'Demoting or removing the last owner is refused.'],
      ['07', 'Rename and delete a workspace; deletion is owner-only and needs the name typed.', 'M', 'D', 'R1', 'Deletion without the exact name is refused.'],
      ['08', 'Guests: external collaborators restricted to chosen projects, with their own seat type.', 'S', 'N', 'R3', 'A guest cannot see any project they were not added to.'],
      ['09', 'Private projects and per-project membership and roles.', 'S', 'N', 'R3', 'Non-members cannot find a private project, even by search.'],
      ['10', 'Custom roles built from a permission list.', 'C', 'N', 'R4', 'Custom role limits match its permission set.'],
      ['11', 'Workspace settings: time zone, working days, default project template, branding.', 'C', 'N', 'R4', 'Dates and reminders honour the workspace time zone.'],
    ],
  },
  {
    code: 'PRJ', name: 'Projects, statuses and labels',
    goal: 'Projects hold the work. Teams shape statuses and labels to match how they actually work.',
    rows: [
      ['01', 'Create a project with name, 2–8 character key, colour, description and lead; default statuses are created.', 'M', 'D', 'R1', 'Duplicate keys in a workspace are refused.'],
      ['02', 'Tasks are numbered KEY-n, unique within a project and never reused.', 'M', 'D', 'R1', 'Concurrent creates never share a number.'],
      ['03', 'Statuses: add, rename, recolour, reorder, assign a category (To do, In progress, Done) and delete with reassignment; a project always keeps an open and a done status.', 'M', 'D', 'R1', 'Deleting a status in use requires choosing a destination.'],
      ['04', 'Labels: members create; admins rename, recolour and delete; names unique ignoring case.', 'M', 'D', 'R1', 'Deleting a label removes it from all tasks.'],
      ['05', 'Archive and restore: archived projects are read-only everywhere.', 'M', 'D', 'R1', 'Every write returns a clear "archived" error.'],
      ['06', 'Delete a project with the name typed to confirm; everything inside is deleted.', 'M', 'D', 'R1', 'Wrong name refuses.'],
      ['07', 'Project templates and duplicate project (statuses, fields, labels, optional sample tasks).', 'S', 'N', 'R3', 'Duplicate preserves statuses, fields and labels.'],
      ['08', 'Folders or spaces to group projects, and favourites.', 'C', 'N', 'R4', 'Sidebar shows grouped projects and pinned favourites.'],
      ['09', 'Project overview page with health, milestones and status updates.', 'C', 'N', 'R4', 'Weekly status update can be posted and read by all members.'],
    ],
  },
  {
    code: 'TSK', name: 'Tasks',
    goal: 'The task is the unit of work. Creating, finding and updating one must take seconds.',
    rows: [
      ['01', 'Create a task from the dialog, a list quick-add row, a board column, a calendar day, the command palette or the N shortcut.', 'M', 'D', 'R1', 'Each entry point creates a task in the right project and status.'],
      ['02', 'Fields: title (300 characters), description, status, priority (Urgent, High, Medium, Low, None), assignee, reporter, labels, start date, due date and time, estimate, story points.', 'M', 'D', 'R1', 'All fields editable inline in the task panel.'],
      ['03', 'Validation: start not after due; due time needs a due date; assignee must be a workspace member.', 'M', 'D', 'R1', 'Invalid combinations return a clear message.'],
      ['04', 'Task panel with inline editing, copyable link, watch toggle and delete; opens from a URL and closes with Escape.', 'M', 'D', 'R1', 'Panel state is shareable by link.'],
      ['05', 'Markdown in descriptions and comments (headings, lists, code, quotes, links, task lists); checklists can be ticked in place; HTML is never interpreted and only http, https and mailto links are active.', 'M', 'D', 'R1', 'Script and javascript: links render as inert text.'],
      ['06', 'Bulk actions: select many tasks to change status, priority, assignee, due date, sprint or labels, or delete.', 'S', 'D', 'R1', 'Bulk changes are all-or-nothing.'],
      ['07', 'Deletion rules: members delete tasks they created, admins delete any; subtasks, comments and files go with the task.', 'M', 'D', 'R1', 'A member cannot delete another person\'s task.'],
      ['08', 'Edit-conflict detection: if someone else changed the same title or description, the editor chooses to keep theirs or overwrite.', 'S', 'D', 'R1', 'Different fields never conflict; the base is captured when editing starts.'],
      ['09', 'History: every change records who, what and before/after values, shown on the task and in feeds.', 'M', 'D', 'R1', 'Field changes appear in order with names, not ids.'],
      ['10', 'Multiple assignees per task.', 'S', 'N', 'R3', 'All assignees are notified and see the task in My Tasks.'],
      ['11', 'Task types (task, bug, story, epic) with type-specific fields and workflows.', 'S', 'N', 'R4', 'Type can change the available fields and statuses.'],
      ['12', 'Deeper hierarchy: epics and nested subtasks to a configurable depth, with roll-up of progress.', 'S', 'N', 'R4', 'Parent shows aggregate progress of all descendants.'],
      ['13', 'Duplicate a task; save and apply task templates.', 'S', 'N', 'R3', 'Duplicate copies fields, labels and subtasks.'],
      ['14', 'Move or copy a task to another project, mapping statuses and fields.', 'S', 'N', 'R3', 'Numbering and history follow the move.'],
      ['15', 'Trash with 30-day restore and undo for destructive actions.', 'S', 'N', 'R3', 'A deleted task can be restored with its comments and files.'],
      ['16', 'Rich-text editor with slash commands and task mentions.', 'C', 'N', 'R4', 'Typing # inserts a link to another task.'],
    ],
  },
  {
    code: 'REL', name: 'Subtasks, dependencies and recurrence',
    goal: 'Real work has parts, order and rhythm. Cortex Tracker models all three.',
    rows: [
      ['01', 'Subtasks (one level) with their own status and assignee; progress rolls up on the parent.', 'M', 'D', 'R1', 'Parent shows done/total and a progress bar.'],
      ['02', 'Relations: blocks / blocked by, related to, duplicates; allowed across projects in the same workspace.', 'M', 'D', 'R1', 'Relations visible from both tasks with direction.'],
      ['03', 'A blocking relation that would create a loop is refused, however long the chain.', 'M', 'D', 'R1', 'A→B→C→A is rejected with a clear message.'],
      ['04', 'A Blocked badge shows while any blocker is not done and clears when blockers finish.', 'S', 'D', 'R1', 'Badge appears in list, board and backlog.'],
      ['05', 'Recurring tasks: every day, weekday, week, 2 weeks or month; completing a task creates the next copy exactly once with the same details; month ends are clamped.', 'S', 'D', 'R1', '31 January repeats to 28 or 29 February; reopening does not duplicate.'],
      ['06', 'Custom recurrence: chosen weekdays, nth weekday of the month, end date or count, skip holidays.', 'C', 'N', 'R2', 'Series stops after the configured end.'],
      ['07', 'Dependency-aware scheduling: moving a blocker offers to shift dependents; warnings for conflicts.', 'S', 'N', 'R3', 'Dependent bars shift together when accepted.'],
      ['08', 'Convert a subtask to a task and back.', 'C', 'N', 'R3', 'History and comments are preserved.'],
    ],
  },
  {
    code: 'FLD', name: 'Custom fields',
    goal: 'Teams track what matters to them without engineering involvement.',
    rows: [
      ['01', 'Admins define project fields of type text, number, date, choice list or checkbox; names unique ignoring case.', 'S', 'D', 'R1', 'A choice field needs at least one choice.'],
      ['02', 'Members set values in the task panel; values are validated by type and can be cleared.', 'S', 'D', 'R1', 'Invalid values are refused with the field name in the message.'],
      ['03', 'Removing a choice clears values that used it; deleting a field removes its values.', 'M', 'D', 'R1', 'No task keeps an invalid value.'],
      ['04', 'Value changes appear in history and are included in the Excel export.', 'S', 'D', 'R1', 'Export has one column per field.'],
      ['05', 'Show custom fields as columns in list and table views; filter, group and sort by them.', 'M', 'N', 'R2', 'A saved view can filter on a field value.'],
      ['06', 'More types: multi-select, people, URL, currency, progress, formula.', 'S', 'N', 'R3', 'Formula fields recalculate when inputs change.'],
      ['07', 'Workspace-level fields and field templates shared across projects.', 'S', 'N', 'R3', 'Editing a shared field updates every project using it.'],
    ],
  },
  {
    code: 'VWS', name: 'Views',
    goal: 'The same work, seen the way each role needs it. Views stay fast and respond to the same filters.',
    rows: [
      ['01', 'List: grouped by status, assignee, priority, label or none; sortable; collapsible groups; quick add; inline status and assignee; selection; renders 100 rows at a time.', 'M', 'D', 'R1', 'A 10,000-task project is usable in under one second.'],
      ['02', 'Board: columns from statuses; drag cards between and within columns with exact ordering; Alt+Arrow keyboard moves with spoken announcement; quick add.', 'M', 'D', 'R1', 'Order persists; keyboard users can do everything a mouse can.'],
      ['03', 'Backlog: sprints and backlog as sections; drag between them; inline story points; per-row sprint menu.', 'M', 'D', 'R1', 'Dropping a task on a sprint assigns it.'],
      ['04', 'Timeline: bars from start to due date; drag to move, drag edges to resize; dependency arrows; Day, Week and Month zoom; today line; keyboard moves; list of unscheduled tasks.', 'S', 'D', 'R1', 'A 3-day drag changes dates by 3 days.'],
      ['05', 'Calendar: month grid; drag to reschedule; click a day to add; panel of tasks without dates.', 'S', 'D', 'R1', 'Dropping on a day sets the due date.'],
      ['06', 'Daily: the close-out checklist for one day with summary strip and "bring unfinished here".', 'S', 'D', 'R1', 'Overdue open tasks move to the chosen day in one action.'],
      ['07', 'My Tasks across projects grouped Overdue, Today, Upcoming, No date, Done this week; Inbox with reminders.', 'M', 'D', 'R1', 'Checking a task off updates its project.'],
      ['08', 'Table view with configurable, resizable, reorderable columns and a frozen first column; inline edit.', 'S', 'N', 'R2', 'Column choices persist per saved view.'],
      ['09', 'Board swimlanes (by assignee or priority) and work-in-progress limits.', 'S', 'N', 'R2', 'Exceeding a limit highlights the column.'],
      ['10', 'Workload view: capacity versus assigned effort per person per week.', 'S', 'N', 'R4', 'Overloaded people are flagged.'],
      ['11', 'Gantt extras: critical path and baselines.', 'C', 'N', 'R4', 'Baseline comparison visible on bars.'],
      ['12', 'Per-user view preferences (density, columns) and read-only shareable view links.', 'C', 'N', 'R4', 'A shared link shows data without sign-in only if enabled by an admin.'],
    ],
  },
  {
    code: 'SPR', name: 'Sprints and agile planning',
    goal: 'Engineering and product teams plan in time-boxes and see honestly whether they will finish.',
    rows: [
      ['01', 'Create, edit and delete sprints with name, goal and dates.', 'M', 'D', 'R1', 'End cannot precede start.'],
      ['02', 'Start a sprint: only one can run per project; missing dates default to two weeks.', 'M', 'D', 'R1', 'Starting a second sprint is refused.'],
      ['03', 'Assign tasks by drag, menu, new-task dialog or bulk action; subtasks follow their parent.', 'M', 'D', 'R1', 'Tasks can only join planned or active sprints.'],
      ['04', 'Story points with sprint totals (tasks, done, points).', 'M', 'D', 'R1', 'Totals update as tasks complete.'],
      ['05', 'Complete a sprint: choose where unfinished tasks go (backlog or a planned sprint); a snapshot is kept; completed sprints are read-only.', 'M', 'D', 'R1', 'Finished work stays with the sprint for the record.'],
      ['06', 'Burndown chart in points or tasks against an ideal line; frozen on completion.', 'S', 'D', 'R1', 'Chart is readable by screen readers through a text summary.'],
      ['07', 'Velocity chart and sprint report across the last N sprints (committed versus completed).', 'S', 'N', 'R4', 'Report exports to PDF and CSV.'],
      ['08', 'Burn-up and cumulative flow diagrams.', 'C', 'N', 'R4', 'Flow shows work-in-progress growth by status.'],
      ['09', 'Scope-change tracking: tasks added or removed after the sprint started.', 'S', 'N', 'R4', 'Burndown marks mid-sprint scope changes.'],
      ['10', 'Sprint capacity per person and retrospective template.', 'C', 'N', 'R4', 'Capacity warns when planned points exceed it.'],
    ],
  },
  {
    code: 'SRC', name: 'Search, filters and saved views',
    goal: 'Anything can be found in two keystrokes and any slice of work can be saved and shared.',
    rows: [
      ['01', 'Search a project by title and key; matches update as you type.', 'M', 'D', 'R1', 'Searching a key such as WR-3 finds the task.'],
      ['02', 'Filters: status, assignee (including me and unassigned), priority, label, due date (overdue, today, next 7 days, none), sprint, hide done, show subtasks; combined with AND.', 'M', 'D', 'R1', 'Active filter count is visible and clearable.'],
      ['03', 'Group by status, assignee, priority, label or none; sort by key, title, priority, due, status, created or updated; ascending or descending.', 'M', 'D', 'R1', 'Choices persist per project.'],
      ['04', 'Saved views store the tab, filters, grouping and sort; private or shared; owners and admins can delete.', 'S', 'D', 'R1', 'Applying a view restores its filters exactly.'],
      ['05', 'Command palette (Ctrl or Cmd + K) searches tasks across all projects and runs navigation and actions.', 'S', 'D', 'R1', 'Wildcard characters are treated literally.'],
      ['06', 'Workspace-wide full-text search across tasks, comments, files and people with ranking and highlights.', 'S', 'N', 'R3', 'Search returns relevant results in under 200 ms at 100,000 tasks.'],
      ['07', 'Advanced query language, for example "assignee = me AND due < today".', 'S', 'N', 'R3', 'Invalid queries explain what is wrong.'],
      ['08', 'Filters on custom fields and dates; OR conditions and nested groups.', 'S', 'N', 'R2', 'Saved views can use OR groups.'],
      ['09', 'Subscribe to a filter by email or in-app digest.', 'C', 'N', 'R4', 'Digest lists only new matches.'],
    ],
  },
  {
    code: 'COL', name: 'Collaboration',
    goal: 'Conversation lives next to the work so context is never lost.',
    rows: [
      ['01', 'Comments in markdown; authors edit their own; authors and admins delete.', 'M', 'D', 'R1', 'Edited comments are marked.'],
      ['02', '@mentions with autocomplete; mentioned people are notified and start watching.', 'M', 'D', 'R1', 'A longer name never triggers a mention of a shorter one.'],
      ['03', 'Watchers: automatic on create, assign and comment; manual watch and unwatch.', 'S', 'D', 'R1', 'Watchers receive comment and status notifications.'],
      ['04', 'Activity at task, project and workspace level with actor, action and context.', 'M', 'D', 'R1', 'Feed links to each task.'],
      ['05', 'Changes by others appear within about 5 seconds without reloading.', 'M', 'P', 'R1', 'Delivered by polling; instant push planned in R2.'],
      ['06', 'Instant updates and presence (who is viewing or typing) over WebSockets.', 'S', 'N', 'R2', 'Updates arrive in under 1 second.'],
      ['07', 'Threaded replies, reactions and resolve on comments; assign a comment as an action item.', 'C', 'N', 'R4', 'Resolved threads collapse.'],
    ],
  },
  {
    code: 'NTF', name: 'Notifications and email',
    goal: 'People hear about what matters to them, once, in the place they prefer.',
    rows: [
      ['01', 'In-app notifications for assignment, mention, comment and status change on watched tasks, and accepted invitations; bell with live unread count and an Inbox page.', 'M', 'D', 'R1', 'Actors are never notified of their own actions.'],
      ['02', 'Mark notifications read individually or all at once.', 'M', 'D', 'R1', 'Unread count updates immediately.'],
      ['03', 'Reminders for overdue and due-today tasks in the Inbox.', 'S', 'D', 'R1', 'List is always current without background jobs.'],
      ['04', 'Email digests: notifications batched into one message per person after a short delay, each linking to its task; per-person opt-out; failed sends retry.', 'S', 'D', 'R1', 'A notification is never emailed twice.'],
      ['05', 'Invitation and password-reset emails.', 'M', 'D', 'R1', 'Works with any SMTP provider; the app still works without email.'],
      ['06', 'Granular preferences per event and channel, quiet hours and digest frequency.', 'S', 'N', 'R2', 'Preferences apply to email, in-app and push independently.'],
      ['07', 'Due-date reminders by email and push at chosen offsets.', 'S', 'N', 'R2', 'Reminder fires once at the configured offset.'],
      ['08', 'Browser and mobile push notifications.', 'S', 'N', 'R5', 'Push opens the task directly.'],
    ],
  },
  {
    code: 'FIL', name: 'Files and links',
    goal: 'Evidence, specs and screenshots sit on the task and are safe to open.',
    rows: [
      ['01', 'Attach files by drag and drop or picker: up to 10 MB each, 25 per task, with a per-workspace storage quota.', 'M', 'D', 'R1', 'Over-limit uploads are refused with a clear message.'],
      ['02', 'Files download by default; only PNG, JPEG, GIF, WebP and PDF can display inline; SVG and HTML never do; every file is served sandboxed with content sniffing disabled.', 'M', 'D', 'R1', 'An uploaded script file cannot execute in the application origin.'],
      ['03', 'Uploaders and admins remove files; uploads and removals appear in history.', 'S', 'D', 'R1', 'Viewers can download but not upload or delete.'],
      ['04', 'Add named links to external documents (http and https only).', 'S', 'D', 'R1', 'Other schemes are rejected.'],
      ['05', 'Optional S3-compatible object storage, larger files and malware scanning.', 'S', 'N', 'R3', 'Files above 10 MB upload with resumable chunks.'],
      ['06', 'Preview Office documents and PDFs in the panel; file versions.', 'C', 'N', 'R4', 'Uploading the same name offers a new version.'],
      ['07', 'Attach from Google Drive, OneDrive, SharePoint and Dropbox.', 'C', 'N', 'R4', 'Linked files show title and owner.'],
    ],
  },
  {
    code: 'RPT', name: 'Dashboards and reporting',
    goal: 'Managers answer "where are we?" without leaving the product or exporting to spreadsheets.',
    rows: [
      ['01', 'Home dashboard: my open, due today, overdue and done this week; project progress; team workload; recent activity.', 'M', 'D', 'R1', 'Numbers match the underlying lists.'],
      ['02', 'Sprint burndown chart.', 'S', 'D', 'R1', 'See SPR-06.'],
      ['03', 'Custom dashboards with widgets (counts, charts by status, assignee, priority, time), filters and sharing.', 'M', 'N', 'R4', 'A dashboard can be shared read-only with the workspace.'],
      ['04', 'Reports: cycle time, lead time, throughput, overdue trend, with export to CSV and PDF.', 'S', 'N', 'R4', 'Report totals reconcile to task data.'],
      ['05', 'Portfolio view across projects with status, progress, dates and health.', 'S', 'N', 'R4', 'Executives see all projects on one page.'],
      ['06', 'Scheduled report emails.', 'C', 'N', 'R5', 'Report arrives on the chosen schedule.'],
    ],
  },
  {
    code: 'IMP', name: 'Import and export',
    goal: 'Data flows in easily and is never trapped.',
    rows: [
      ['01', 'Excel export per project: tasks, summary, subtasks, sprint, points, repeat and custom fields.', 'M', 'D', 'R1', 'Export opens in Excel with one row per task.'],
      ['02', 'One-time import of the original Optima close-out data into a project; people become claimable placeholders.', 'M', 'D', 'R1', 'Statuses, numbers, dates, notes and subtasks all carried over.'],
      ['03', 'CSV import with column mapping, preview and dry run.', 'M', 'N', 'R2', 'An export re-imports to the same project without loss.'],
      ['04', 'Import from Jira, Asana, ClickUp and Trello with field and status mapping.', 'S', 'N', 'R5', 'A 1,000-task project imports in under 15 minutes.'],
      ['05', 'Full workspace export (JSON and CSV archive) and member data deletion.', 'S', 'N', 'R3', 'Archive contains every task, comment and file.'],
      ['06', 'Calendar feed (iCal) of a person\'s tasks.', 'C', 'N', 'R4', 'Subscribed calendar shows due dates.'],
    ],
  },
  {
    code: 'AUTO', name: 'Automation and workflows',
    goal: 'Repetitive coordination runs itself so people spend time on the work.',
    rows: [
      ['01', 'Rule builder: trigger, conditions, actions. Triggers: task created, status or field changed, assigned, comment added, due date approaching or overdue. Actions: set status, field, assignee or priority; add label; create subtask; comment; notify; move to sprint; call a webhook.', 'M', 'N', 'R2', 'A rule changes a task within 10 seconds of its trigger.'],
      ['02', 'Rule templates, enable and disable, project and workspace scope.', 'S', 'N', 'R2', 'Templates cover the ten most common rules.'],
      ['03', 'Execution log with success, failure and reason; loop guard and rate limits.', 'M', 'N', 'R2', 'A rule cannot trigger itself endlessly.'],
      ['04', 'Scheduled triggers (daily, weekly, monthly).', 'S', 'N', 'R2', 'Scheduled rules run once per period.'],
      ['05', 'Status workflows: allowed transitions, required fields on transition, optional approvers.', 'S', 'N', 'R2', 'A blocked transition explains what is missing.'],
      ['06', 'Approval requests on tasks with approve and reject.', 'C', 'N', 'R4', 'Decision and approver are recorded in history.'],
    ],
  },
  {
    code: 'TIM', name: 'Time tracking and capacity',
    goal: 'Teams know how long work really takes and whether people are overloaded.',
    rows: [
      ['01', 'Start and stop a timer on a task; add manual time entries; per-person logs.', 'S', 'N', 'R4', 'Running timer survives page reloads.'],
      ['02', 'Weekly timesheets with submit, approve and lock.', 'C', 'N', 'R4', 'Locked periods cannot be edited.'],
      ['03', 'Estimate versus actual reporting; billable flag and rates.', 'C', 'N', 'R4', 'Report shows variance per project.'],
      ['04', 'Capacity planning: working hours, leave and availability with overload warnings.', 'S', 'N', 'R4', 'Over-allocation is highlighted in the workload view.'],
    ],
  },
  {
    code: 'DOC', name: 'Docs, goals and forms',
    goal: 'Context, objectives and intake live beside the tasks they relate to.',
    rows: [
      ['01', 'Docs: nested pages, rich text, task links, permissions and version history.', 'S', 'N', 'R4', 'A doc can embed and link live tasks.'],
      ['02', 'Goals and OKRs with key results linked to tasks or numeric targets and progress roll-up.', 'S', 'N', 'R4', 'Progress updates as linked tasks complete.'],
      ['03', 'Intake forms (internal and public) that create tasks with mapped fields, with spam protection.', 'S', 'N', 'R4', 'A submission appears as a task in the chosen project.'],
      ['04', 'Roadmaps: initiatives and milestones across projects.', 'S', 'N', 'R4', 'Roadmap rolls up from linked epics.'],
    ],
  },
  {
    code: 'INT', name: 'Integrations and public API',
    goal: 'Cortex Tracker fits into the tools customers already use.',
    rows: [
      ['01', 'Public REST API with personal and workspace tokens, scopes, rate limits, versioning and an OpenAPI description.', 'M', 'N', 'R2', 'Every UI capability has an API equivalent.'],
      ['02', 'Webhooks for task, comment and sprint events with signed payloads, retries and a delivery log.', 'M', 'N', 'R2', 'Failed deliveries retry with backoff and are visible.'],
      ['03', 'Slack and Microsoft Teams: notifications, create tasks from messages, link unfurling.', 'S', 'N', 'R4', 'Creating a task from a message links back to it.'],
      ['04', 'GitHub, GitLab and Bitbucket: link branches, pull requests and commits by task key; transition on merge.', 'S', 'N', 'R4', 'Merging a pull request moves the task to Done.'],
      ['05', 'Google and Microsoft calendar sync; email-to-task.', 'C', 'N', 'R4', 'Forwarded email becomes a task with attachments.'],
      ['06', 'Zapier and Make connectors; later an app directory.', 'C', 'N', 'R5', 'A published connector can create and update tasks.'],
    ],
  },
  {
    code: 'ADM', name: 'Enterprise and administration',
    goal: 'Security and compliance teams can approve Cortex Tracker without exceptions.',
    rows: [
      ['01', 'Audit log: who did what, when and from where; filterable; export; retention policy.', 'M', 'N', 'R3', 'Security events (sign-in, role change, export) are never missing.'],
      ['02', 'Admin console: members, seats, storage, sessions and usage.', 'S', 'N', 'R3', 'An admin sees storage use per project.'],
      ['03', 'Domain verification, allowed email domains and enforced SSO.', 'S', 'N', 'R3', 'Outside domains cannot be invited when restricted.'],
      ['04', 'Data protection tooling: subject access requests, retention and legal hold, documented backup and restore.', 'S', 'N', 'R3', 'A subject access export completes within 24 hours.'],
      ['05', 'Data residency choice and customer-managed encryption keys.', 'C', 'N', 'R5', 'Region is selectable at workspace creation.'],
      ['06', 'Plans, seats, limits and billing if offered commercially.', 'C', 'N', 'R4', 'Limits are enforced without data loss.'],
    ],
  },
  {
    code: 'AI', name: 'AI-assisted work (exploratory)',
    goal: 'Reduce typing and triage effort, only where the customer has opted in.',
    rows: [
      ['01', 'Summarise a task and its comment thread; draft a status update.', 'C', 'N', 'R5', 'Summary cites the comments it used.'],
      ['02', 'Suggest subtasks from a description and acceptance criteria.', 'C', 'N', 'R5', 'User reviews before anything is created.'],
      ['03', 'Natural-language search and filters ("overdue design tasks").', 'C', 'N', 'R5', 'The generated filter is shown and editable.'],
      ['04', 'Duplicate detection and assignee or priority suggestions.', 'C', 'N', 'R5', 'Suggestions are never applied automatically.'],
      ['05', 'Governance: opt-in per workspace, administrator controls, audit of AI actions, customer data never used to train models.', 'M', 'N', 'R5', 'Any AI feature is off until an admin enables it.'],
    ],
  },
  {
    code: 'BRN', name: 'Brand and platform housekeeping',
    goal: 'Make the product consistent with its new name.',
    rows: [
      ['01', 'Rename the product to Cortex Tracker in the interface, emails, page titles, favicon, documents and repository; update deployment and service names. The current build still carries the working name "Optima Work Tracker".', 'M', 'N', 'R1.1', 'No user-facing "Optima" strings remain except imported data.'],
      ['02', 'Trademark and domain check for "Cortex Tracker" before public launch.', 'M', 'N', 'R1.1', 'Legal clearance recorded.'],
    ],
  },
];

/* ---------- non-functional ---------- */
const nfrs = [
  ['Performance', 'Interactive actions respond in under 300 ms at p95; opening a project of 10,000 tasks is usable in under 1 second; search under 200 ms at 20,000 tasks.', 'Measured on one instance with a local database: first page of 500 tasks about 28 ms; 2,000-task page about 114 ms; whole 20,000-task project in about 1 s; search about 78 ms; browser usable after about 0.3 s for 10,000 tasks. Not yet measured under production load.', 'Partly verified'],
  ['Scalability', 'Support 200 concurrent users and 1,000 members per workspace on a single instance; scale out with a shared session and rate-limit store.', 'Not yet load-tested. Today the sign-in rate limiter and live-update polling are per process.', 'Target, to validate'],
  ['Availability and recovery', '99.5% monthly availability; daily backups with point-in-time recovery; recovery time under 4 hours.', 'Health endpoint present; backups depend on the hosting database plan.', 'Target'],
  ['Security', 'Meet OWASP ASVS level 2; TLS everywhere; secrets in environment variables; dependency scanning; independent penetration test before general availability.', 'Hardened sign-in, origin checks, rate limits, role checks on every request, safe markdown and file serving, strict content-security policy are in place. Dependency scanning and penetration test pending.', 'Partly verified'],
  ['Privacy and compliance', 'Data protection laws (for example GDPR and Nigeria\'s NDPA) supported through export, deletion, retention and a data-processing agreement.', 'Export and deletion tooling planned (FR-IMP-05, FR-ADM-04).', 'Planned'],
  ['Accessibility', 'WCAG 2.1 level AA; all functions available by keyboard.', 'Automated scan of every main screen in light and dark themes with zero serious or critical findings; keyboard alternatives for drag and drop. Manual screen-reader audit pending.', 'Partly verified'],
  ['Browser and device support', 'Latest two versions of Chrome, Edge, Firefox and Safari; responsive from 360 px wide.', 'Verified on Chromium (desktop and phone width). Other browsers not yet tested.', 'Partly verified'],
  ['Localisation', 'English first; language, date, time-zone and right-to-left support designed in.', 'Dates use the browser locale; strings are not yet externalised.', 'Planned'],
  ['Data integrity', 'Transactional writes, referential integrity, versioned migrations, conflict detection on shared text.', 'In place; 77 automated API tests exercise permissions, limits and cascade behaviour.', 'Verified'],
  ['Observability', 'Structured logs, error tracking, metrics and alerting; request tracing.', 'Basic logs and health check only.', 'Planned'],
  ['Maintainability', 'Automated tests and CI on every change; documentation for setup and operations.', 'Test suites and CI workflow committed; README documents setup, email, environment and security.', 'Verified'],
  ['Usability', 'A new user creates and completes a task within 5 minutes without training.', 'Not yet measured with users.', 'Target, to validate'],
];

/* ---------- architecture ---------- */
const stack = [
  ['Frontend', 'React 19 single-page app, Vite, Tailwind CSS; no UI framework dependency; small custom router and state layer.'],
  ['Backend', 'Node.js 22 and Express; JSON API under /api; cookie sessions; background email worker.'],
  ['Database', 'PostgreSQL 16; versioned SQL migrations; relational model with constraints; files stored in the database in R1.'],
  ['Security', 'scrypt password hashing; hashed session and invite tokens; origin check; rate limiting; strict content-security policy.'],
  ['Email', 'Optional SMTP through nodemailer; templates with text and HTML; batched digests.'],
  ['Quality', 'node:test API suite on real PostgreSQL; Playwright browser suite with axe accessibility scans; GitHub Actions CI; load benchmark script.'],
  ['Hosting', 'Single web service plus managed PostgreSQL (Render blueprint included); also runs on any host with Node and PostgreSQL.'],
];

const apiPrinciples = [
  'Every request is authenticated and authorised against the caller\'s workspace role; unknown and forbidden resources look identical (404).',
  'All writes validate input against an allow-list; unknown fields are rejected so mistakes never pass silently.',
  'Lists are cursor-paginated with stable ordering; large responses are compressed.',
  'Every change bumps a workspace revision so clients refresh only when something changed.',
  'Dates are plain calendar dates (no hidden time zones); times are stored as UTC timestamps.',
  'Destructive operations require explicit confirmation and are recorded in history.',
];

const entities = [
  'User', 'Session', 'Workspace', 'Member (role)', 'Invite', 'Password reset', 'Project', 'Status', 'Label', 'Custom field', 'Sprint', 'Task',
  'Task label', 'Field value', 'Relation', 'Comment', 'Link', 'Attachment', 'Watcher', 'Activity', 'Notification', 'Saved view',
];

/* ---------- UX ---------- */
const uxPrinciples = [
  ['Fast first', 'Every common action completes in under a second and never blocks the screen; large projects load in pages.'],
  ['Keyboard-first', 'N creates, / searches, Ctrl+K opens the command palette, [ toggles the sidebar, ? lists shortcuts; every drag has a keyboard alternative.'],
  ['Defaults that work', 'A new project is usable immediately with sensible statuses, views and roles.'],
  ['Progressive disclosure', 'Simple surface, power on demand: filters, saved views, fields and sprints appear when needed.'],
  ['Safe by default', 'Destructive actions confirm; conflicts are caught, not overwritten silently; archived data is read-only.'],
  ['Inclusive', 'Colour is never the only signal; contrast meets AA; focus is always visible; motion respects user settings.'],
];

const journeys = [
  ['Get started', 'Open the site, create the owner account and workspace, create a first project, add three tasks, invite a teammate with a link.', 'Under 5 minutes to first task; the invited person lands on the right workspace.'],
  ['My day', 'Open My Tasks, see overdue and due today, open a task, update status, comment with a mention, finish.', 'Fewer than 5 clicks to update a task from the home screen.'],
  ['Plan a sprint', 'Open Backlog, create a sprint, drag tasks in, set story points, start it, watch the burndown, complete and carry over.', 'The sprint can be planned and started in under 3 minutes.'],
  ['Review progress', 'Open Home, scan project progress and workload, open the timeline, drag a bar to reschedule, export to Excel.', 'A weekly status needs no data re-entry elsewhere.'],
  ['Administer access', 'Invite with a role, claim an imported person, reset a colleague\'s password with a one-time link, change a role.', 'Every admin task is possible without developer help.'],
];

/* ---------- quality ---------- */
const qa = [
  ['API and logic tests', '77 automated tests run against a real PostgreSQL database: authentication, sessions, rate limits, invitations, roles, isolation, projects, tasks, relations, sprints, custom fields, recurrence, files, email, pagination, conflicts, markdown and date logic.', 'Every change (CI)'],
  ['Browser tests', '17 end-to-end scenarios in Chromium: setup, task work, markdown safety, files, dependencies, board drag and keyboard moves, filters and bulk edits, conflicts between two users, invitations and live notifications, password reset by email, sprints, timeline drag, custom fields, recurrence, phone layout.', 'Every change (CI)'],
  ['Accessibility scans', 'axe WCAG 2.1 A and AA scan of every main screen in light and dark themes; serious or critical findings fail the build.', 'Every change (CI)'],
  ['Performance benchmark', 'Script seeds 20,000 tasks and reports latency and payload size for key requests.', 'Before each release'],
  ['Security review', 'Independent penetration test; dependency vulnerability scanning.', 'Before R3 and general availability'],
  ['Manual accessibility audit', 'Screen-reader testing with NVDA and VoiceOver; keyboard-only walkthrough.', 'Before general availability'],
  ['User acceptance', 'Pilot with 3–5 real teams for 4 weeks; track activation, time to first task and satisfaction.', 'Before each major release'],
];

const dod = [
  'All acceptance criteria met and demonstrated.',
  'Automated tests added for new behaviour, including permission and failure paths.',
  'No serious or critical accessibility findings; keyboard path exists.',
  'Works in light and dark themes and at phone width.',
  'Migrations are forward-only, tested on a copy of production-like data, and documented.',
  'README and in-product help updated; release notes written.',
];

/* ---------- risks, assumptions, questions ---------- */
const risks = [
  ['Breadth of the market leaders is large; chasing parity dilutes focus.', 'High', 'Prioritise by the parity matrix and pilot feedback; keep the simple, fast experience as the differentiator; resist one-off requests.'],
  ['Performance is proven to 20,000 tasks on one instance, not at production scale.', 'Medium', 'Load test to the NFR targets before R3; add caching and read replicas if needed.'],
  ['Files stored in the database grow it quickly.', 'Medium', 'Quota in place; object storage in R3; monitor database size.'],
  ['Security expectations of larger customers (SSO, audit, pen test).', 'High', 'Plan R3 around enterprise controls; schedule the penetration test early.'],
  ['Switching cost keeps teams in their current tool.', 'High', 'Import from major tools (R2 CSV, R5 direct); export always available.'],
  ['Single-instance design limits horizontal scaling.', 'Medium', 'Move sessions and rate limits to a shared store; run the email and automation workers separately.'],
  ['Team capacity versus roadmap ambition.', 'High', 'Treat dates as indicative; review at the end of each release; cut scope, not quality.'],
  ['Product name conflicts with an existing trademark.', 'Medium', 'Clearance check (FR-BRN-02) before public launch.'],
];

const assumptions = [
  'Primary segment is teams of 5–500 people that need structured project and sprint work without enterprise-suite overhead.',
  'Customers accept either managed hosting or self-hosting on a standard Node and PostgreSQL stack.',
  'English is the launch language; right-to-left and translations follow demand.',
  'Competitor capabilities in section 3 reflect publicly known features at the time of writing and change with plan tiers; they should be re-verified before any external use.',
  'Roadmap dates are indicative planning aids, not commitments.',
];

const dependencies = [
  'SMTP provider for email (any standard provider).',
  'Object storage service for large files (R3).',
  'Identity providers for SSO (R3) and third-party APIs for integrations (R4).',
  'Legal review of the product name, terms and data-processing agreement.',
  'Pilot customers for validation of activation and usability targets.',
];

const openQuestions = [
  'Commercial model: hosted subscription, self-hosted licence, or both? This drives billing, plan limits and support scope (FR-ADM-06).',
  'Primary audience: internal use for the Zenith programme first, or a commercial product from the start?',
  'Compliance regimes in scope (for example GDPR, Nigeria NDPA, SOC 2) and required data-residency options.',
  'Mobile approach: installable web app first, or native apps?',
  'Integration priorities: which chat, code and calendar tools matter most to the first customers?',
  'Is a public app directory and third-party marketplace a goal, or are first-party integrations enough?',
];

const shortcuts = [
  ['N', 'Create a task'], ['/', 'Focus search'], ['Ctrl or Cmd + K', 'Open the command palette'], ['[', 'Collapse or expand the sidebar'],
  ['?', 'Show shortcuts'], ['Esc', 'Close dialogs, menus and the task panel'], ['Ctrl + Enter', 'Save a form, send a comment'],
  ['Alt + Left or Right', 'Move a board card to the neighbouring column; move a timeline bar by one day'], ['Alt + Shift + Left or Right', 'Change the end date of a timeline bar by one day'],
];

const glossary = [
  ['Workspace', 'The top-level space for a team: members, projects and settings. The security boundary.'],
  ['Project', 'A body of work with its own key, statuses, labels, fields and sprints.'],
  ['Task', 'A unit of work identified as KEY-n. May have subtasks, comments, files and relations.'],
  ['Status category', 'To do, In progress or Done. Lets reports treat custom status names consistently.'],
  ['Sprint', 'A time-boxed period for a chosen set of tasks, with a goal, dates and burndown.'],
  ['Backlog', 'Tasks not assigned to any sprint.'],
  ['Story points', 'A relative size estimate used for sprint planning and burndown.'],
  ['Burndown', 'Remaining work plotted over a sprint against an ideal line.'],
  ['Relation', 'A link between tasks: blocks, relates to, duplicates.'],
  ['Placeholder member', 'A person imported from the legacy data who has not signed up yet; claimable through an invitation.'],
  ['Saved view', 'A stored tab, filter, grouping and sort that can be private or shared.'],
  ['Digest', 'A single email that batches several notifications for one person.'],
];

module.exports = {
  doc, businessRequirements, kpis, incumbents, positioning, differentiators, parity, personas, permissionRows,
  inScope, outScope, releases, modules, nfrs, stack, apiPrinciples, entities, uxPrinciples, journeys, qa, dod,
  risks, assumptions, dependencies, openQuestions, shortcuts, glossary,
};

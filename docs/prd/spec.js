'use strict';
/*
 * Developer specification for Cortex Tracker: capability standard, business rules, state machines,
 * notification rules, detailed specifications for modules not yet built, planned data model, screens and test cases.
 * State: F = in the current build, P = partly in the current build, N = not built yet.
 */

/* ---------- section 3: capability standard ---------- */
const capabilities = [
  ['Work management', [
    ['Tasks with subtasks, priority, labels, assignee, dates, estimate', 'Every field editable inline; history of every change; bulk edit; markdown description with checklists.', 'F'],
    ['Task dependencies', 'Blocks, blocked by, related, duplicates; loop protection; blocked badge; dependency-aware rescheduling.', 'P'],
    ['Recurring tasks', 'Daily, weekday, weekly, fortnightly, monthly now; custom weekday sets, nth weekday, end rules and holiday skipping.', 'P'],
    ['Custom fields', 'Text, number, date, choice, checkbox now; multi-select, people, URL, currency, progress, formula; shown as columns; usable in filters, grouping and automations.', 'P'],
    ['Multiple assignees', 'Several owners on one task, each notified, each seeing the task in My Tasks.', 'N'],
    ['Task types and hierarchy', 'Task, bug, story and epic types with type-specific fields; nested subtasks with progress roll-up.', 'N'],
    ['Templates, duplicate, move, trash', 'Task and project templates; duplicate; move between projects; 30-day trash with restore.', 'N'],
  ]],
  ['Views', [
    ['List, board, backlog, calendar, daily, timeline', 'All six views share filters, grouping, sort and saved views; each has a keyboard path.', 'F'],
    ['Table view', 'Configurable, resizable, reorderable columns with a frozen first column and inline editing.', 'N'],
    ['Swimlanes and WIP limits', 'Board lanes by assignee or priority; per-column limits with warning.', 'N'],
    ['Workload and capacity', 'Planned effort against capacity per person per week; overload flags.', 'N'],
    ['Roadmap across projects', 'One timeline across projects with milestones and a combined status.', 'N'],
  ]],
  ['Agile planning', [
    ['Backlog and sprints', 'Create, plan, start, complete sprints; carry-over choice; story points; completed sprints frozen.', 'F'],
    ['Burndown', 'Points or tasks against an ideal line; frozen at completion.', 'F'],
    ['Velocity, burn-up, cumulative flow, scope change', 'Sprint report across recent sprints; mid-sprint scope changes marked.', 'N'],
    ['Configurable workflows', 'Allowed status transitions per project and per task type with required fields on transition.', 'N'],
  ]],
  ['Collaboration', [
    ['Comments, mentions, watchers, activity', 'Markdown, edit and delete, autocomplete mentions, automatic watching, task and workspace feeds.', 'F'],
    ['Instant updates and presence', 'WebSocket push under 1 second; who is viewing a task; typing indicators on comments.', 'N'],
    ['Docs', 'Pages in a tree with formatting, version history and links to tasks.', 'N'],
    ['Goals', 'Objectives with measurable results linked to tasks; progress calculated.', 'N'],
    ['Forms and intake', 'Public or internal forms that create tasks with mapped fields.', 'N'],
  ]],
  ['Search', [
    ['Search, filters, saved views, command palette', 'Per-project search, multi-field filters, shared saved views, global palette.', 'F'],
    ['Workspace full-text search and query language', 'Ranked search over tasks, comments, files and people; structured queries.', 'N'],
  ]],
  ['Automation and integration', [
    ['Automation rules', 'Trigger, conditions, actions; run log; loop protection; per-project and workspace scope.', 'N'],
    ['Public API and webhooks', 'Personal and service tokens with scopes; versioned REST API; signed webhooks with retries.', 'N'],
    ['Chat, code and calendar integrations', 'Messages to chat channels, task links from code changes, calendar feeds.', 'N'],
    ['Import and export', 'Excel export now; CSV and tool-specific import with mapping and dry run; full workspace export.', 'P'],
  ]],
  ['Insight', [
    ['Home dashboard', 'My work, project progress, workload, activity.', 'F'],
    ['Custom dashboards and reports', 'Widgets for status, workload, cycle time, throughput; scheduled email reports; export.', 'N'],
    ['Time tracking', 'Timer and manual entries, estimates versus actuals, timesheets.', 'N'],
    ['AI assistance', 'Summaries, draft text and suggestions, switched on by an administrator and logged.', 'N'],
  ]],
  ['Security and administration', [
    ['Roles and permissions', 'Four workspace roles now; guests, private projects, per-project roles and custom roles.', 'P'],
    ['Sign-in protection', 'Password sign-in with hashing, rate limits and reset now; two-factor, SSO, session management, verification and lockout.', 'P'],
    ['Audit log', 'Immutable record of security and administrative actions with search and export.', 'P'],
    ['Data protection', 'Export, deletion, retention settings and data-processing documentation.', 'N'],
  ]],
  ['Platform', [
    ['Responsive web and accessibility', 'Works from 360 px; WCAG 2.1 AA; keyboard complete.', 'F'],
    ['Self-hosted deployment', 'One service and one database; documented environment variables.', 'F'],
    ['Mobile', 'Installable web app with notifications now planned; native apps decided later.', 'N'],
  ]],
];

/* ---------- section 7: cross-cutting rules ---------- */
/* [id, rule, enforced where] */
const businessRules = [
  ['BRL-01', 'Passwords are at least 8 characters. Sign-in failures for an email and address are limited to 10 per 15 minutes; registration to 20 per hour per address; password-reset requests to 5 per hour per email and address; reset submissions to 15 per hour per address. Exceeding a limit returns 429.', 'Server'],
  ['BRL-02', 'A session lasts 30 days and renews when more than half its life has passed. Only a hash of the session token is stored.', 'Server'],
  ['BRL-03', 'An invitation is bound to one email address, is single use and expires after 14 days. A reset link by email expires after 1 hour; an administrator-created link after 24 hours; both are single use. Using a reset ends every other session of that person.', 'Server'],
  ['BRL-04', 'Names: workspace, project and sprint names 1 to 80 characters; status, label and custom-field names 1 to 40; saved-view names 1 to 60; link names 1 to 120.', 'Server and form'],
  ['BRL-05', 'A project key is 2 to 8 characters, stored in capitals, unique in the workspace. Task numbers are KEY-n, increase by one for each new task in the project, and are never reused.', 'Database'],
  ['BRL-06', 'A task title is 1 to 300 characters. Descriptions are text. Estimates are whole minutes from 0 to 100,000. Story points are whole numbers from 0 to 1,000. Comments are 1 to 10,000 characters with at most 20 mentions.', 'Server'],
  ['BRL-07', 'A start date cannot be after the due date. A due time requires a due date. An assignee must be a member of the workspace. Dates are calendar dates without time zones; due times are clock times.', 'Server'],
  ['BRL-08', 'A project always has at least one status in the To do or In progress categories and one in the Done category. Deleting a status that tasks use requires choosing a replacement.', 'Server'],
  ['BRL-09', 'Label names are unique per project and status names unique per project, ignoring case. Custom-field names are unique per project, ignoring case; a choice field has at least one choice.', 'Server'],
  ['BRL-10', 'A blocking relation that would create a cycle of any length is refused. A task cannot relate to itself.', 'Server'],
  ['BRL-11', 'Only one sprint per project can be active. A sprint can only receive tasks while planned or active. Completing a sprint requires a destination for unfinished tasks and freezes a snapshot; completed sprints cannot be edited.', 'Server'],
  ['BRL-12', 'Archived projects are read-only: every create, update and delete inside them is refused with an "archived" error.', 'Server'],
  ['BRL-13', 'A workspace always keeps at least one owner. Demoting or removing the last owner is refused. Deleting a workspace or project requires typing its exact name.', 'Server'],
  ['BRL-14', 'Members can delete only tasks they created; administrators can delete any task or comment. Authors can edit their own comments.', 'Server'],
  ['BRL-15', 'Attachments are at most 10 MB each, at most 25 per task, and count against a workspace quota (default 500 MB, set by ATTACHMENT_LIMIT_MB). Only PNG, JPEG, GIF, WebP and PDF may display inline; every other type downloads. Files are served with nosniff and a sandboxing content-security policy.', 'Server'],
  ['BRL-16', 'Rendered text never interprets HTML. Only http, https and mailto links are active.', 'Client'],
  ['BRL-17', 'Writes must come from the same origin as the application and must send JSON, except file upload. A request body larger than 256 KB is refused except for file upload.', 'Server'],
  ['BRL-18', 'An unknown or forbidden resource returns the same 404, so identifiers cannot be probed. A known resource with too little permission returns 403 with a plain-language message.', 'Server'],
  ['BRL-19', 'Editing the same title or description concurrently is detected using the value present when editing began; the editor chooses to keep the other person\'s version or overwrite it. Different fields never conflict.', 'Server and client'],
  ['BRL-20', 'Completing a recurring task creates the next copy exactly once with the same details and a date moved forward by the rule. A month-end date is clamped to the last day of a shorter month.', 'Server'],
  ['BRL-21', 'Bulk actions apply to all selected tasks or none. Members cannot bulk-delete tasks they did not create.', 'Server'],
  ['BRL-22', 'Lists larger than 500 rows are returned in cursor pages ordered by a stable key; the client renders 100 rows at a time.', 'Server and client'],
];

/* ---------- section 7: state machines. [from, event, to, rule] ---------- */
const stateMachines = [
  { name: 'Task', note: 'A task\'s state is its status; statuses belong to a category (To do, In progress, Done) that reports use.',
    rows: [['(new)', 'Create', 'First To do status, or the chosen status', 'Reporter and creation time recorded; reporter and assignee start watching'], ['Any status', 'Change status', 'Any other status of the project', 'Moving to Done records the completion time; moving out of Done clears it; recurrence runs on first completion'],
      ['Done', 'Reopen', 'To do or In progress', 'Blocked badge recalculated for dependants'], ['Any', 'Delete', '(removed)', 'Subtasks, comments, files and relations removed; members only for tasks they created']] },
  { name: 'Sprint', note: 'One active sprint per project.',
    rows: [['(new)', 'Create', 'Planned', 'Name required; end not before start'], ['Planned', 'Start', 'Active', 'Refused if another sprint is active; missing dates default to a two-week sprint from today'],
      ['Active', 'Complete', 'Completed', 'Unfinished tasks move to the backlog or a planned sprint; a snapshot of tasks and points is stored; becomes read-only'], ['Planned', 'Delete', '(removed)', 'Its tasks return to the backlog']] },
  { name: 'Invitation', note: 'Single use and bound to an email address.',
    rows: [['(new)', 'Create', 'Pending', 'Role chosen; link shown once; email sent if configured'], ['Pending', 'Accept', 'Accepted', 'Creates or links the account and membership; may claim a placeholder member'],
      ['Pending', 'Revoke', 'Revoked', 'Link stops working'], ['Pending', '14 days pass', 'Expired', 'Link stops working']] },
  { name: 'Password reset', note: 'Single use.',
    rows: [['(new)', 'Request by email, or created by an administrator', 'Pending', 'Email request answers identically for known and unknown addresses'], ['Pending', 'Submit new password', 'Used', 'Every other session of the person ends'], ['Pending', '1 hour (email) or 24 hours (administrator)', 'Expired', 'Link stops working']] },
  { name: 'Notification', note: 'Created by events; shown in the app at once and emailed in batches.',
    rows: [['(new)', 'Event occurs', 'Unread', 'Not created for the person who caused the event'], ['Unread', 'Open or mark read', 'Read', 'Unread badge updates'], ['Unread', '2 minutes pass and email is on', 'Emailed', 'Grouped into one digest per person; never sent twice']] },
  { name: 'Planned: automation run', note: 'Specified in section 6.',
    rows: [['(new)', 'Trigger fires and conditions pass', 'Queued', 'A unique key per event stops the same event running twice'], ['Queued', 'Worker picks up', 'Running', 'Actions execute in order'], ['Running', 'All actions succeed', 'Succeeded', 'Logged'], ['Running', 'An action fails', 'Failed', 'Retried up to 3 times with delay, then flagged to the rule owner']] },
];

/* ---------- section 7: notification rules. [event, recipients, in-app, email] ---------- */
const notificationRules = [
  ['Task assigned to you', 'The new assignee', 'Yes', 'Digest'],
  ['You are mentioned in a comment or description', 'Each mentioned person (who then also watches)', 'Yes', 'Digest'],
  ['Comment added to a task you watch', 'All watchers except the author', 'Yes', 'Digest'],
  ['Status of a task you watch changes', 'All watchers except the person who changed it', 'Yes', 'Digest'],
  ['Task you watch becomes due today or overdue', 'Assignee and watchers', 'Yes (reminder)', 'Digest'],
  ['Invitation sent', 'The invited address', 'No', 'Immediate email'],
  ['Password reset requested', 'The account email, if the account exists', 'No', 'Immediate email'],
  ['Planned: automation failed', 'Rule owner', 'Yes', 'Digest'],
  ['Planned: report ready or scheduled report', 'Subscribers', 'Yes', 'Email with link'],
  ['Planned: goal or time-sheet deadline', 'Owner', 'Yes', 'Digest'],
];

/* ---------- section 6: detailed specifications of modules not built yet ---------- */
/* each: {code, title, intro, tables:[{title, head, rows, widths}], lists:[{title, items}]} */
const detailSpecs = [
  { code: 'AUTO', title: 'Automation rules', intro: 'A rule is "when a trigger happens, if conditions are true, do actions". Rules belong to a project or, for administrators, the whole workspace.',
    tables: [
      { title: 'Triggers', head: ['Trigger', 'Fires when', 'Data available to conditions and actions'], widths: ['26%', '34%', '40%'], rows: [
        ['Task created', 'A task is created by anyone or by import', 'Every task field, creator'],
        ['Field changed', 'A chosen field changes (status, assignee, priority, dates, labels, custom field)', 'Old value, new value, actor'],
        ['Status category entered', 'A task enters To do, In progress or Done', 'Task, actor'],
        ['Comment added', 'A comment is posted', 'Comment text, author, mentions'],
        ['Due date reached', 'A task becomes due in N days, today, or overdue (checked every 15 minutes)', 'Task, days overdue'],
        ['Sprint started or completed', 'A sprint changes state', 'Sprint, unfinished tasks'],
        ['Schedule', 'Daily, weekly or monthly at a time in the workspace time zone', 'Workspace, project'],
        ['Webhook received', 'An authorised external system calls the rule URL', 'Payload fields mapped by the rule'],
      ] },
      { title: 'Conditions and actions', head: ['Kind', 'Options'], widths: ['22%', '78%'], rows: [
        ['Conditions', 'Field equals, not equals, contains, empty, not empty, greater, less, in list; assignee is or is not; label has; task is overdue; parent exists; combined with AND, OR and nested groups'],
        ['Actions', 'Set a field; add or remove a label; assign or unassign; move to a status; create a subtask or a task from a template; add a comment; notify a person or watchers; set a due date relative to today or to another date; move to a sprint; call a webhook; post a message to a connected chat channel'],
        ['Guards', 'A rule cannot trigger itself in a chain longer than 5 steps; at most 100 runs per rule per minute; at most 50 rules per project; a disabled rule never fires; rules run under their own name, so history shows "Automation: rule name" instead of a person'],
      ] },
    ],
    lists: [{ title: 'Behaviour', items: [
      'Rules are created and edited by administrators and, if allowed by an administrator setting, by members for their own projects.',
      'Each run records trigger, matched conditions, actions taken and outcome in a run log kept 30 days, visible on the rule.',
      'A rule can be tested against a chosen task before being enabled; the test shows what would change without changing it.',
      'Status workflows are expressed as rules plus allowed transitions: a transition may require fields (for example a resolution) before it is accepted.',
    ] }] },
  { code: 'INT', title: 'Public API, tokens and webhooks', intro: 'Everything people can do in the interface must be possible through a documented, versioned API.',
    tables: [
      { title: 'Tokens and scopes', head: ['Item', 'Specification'], widths: ['24%', '76%'], rows: [
        ['Token kinds', 'Personal token (acts as one person with that person\'s permissions) and service token (created by an administrator, named, role-limited)'],
        ['Scopes', 'read, write, admin; each limited to the whole workspace or chosen projects'],
        ['Storage and display', 'Shown once at creation; only a hash is stored; last-used time and address recorded; revocable at once'],
        ['Authentication', 'Authorization: Bearer header; sessions cookies are not accepted for token calls'],
        ['Limits', '600 requests per minute per token; 429 with Retry-After and rate-limit headers'],
        ['Versioning', 'Path prefix /api/v1; breaking changes only in a new version; deprecated endpoints announced 6 months ahead'],
        ['Format', 'JSON; ISO dates; cursor pagination with next cursor; a request-key header on creates so a repeated request is not applied twice; consistent error body {code, message, field}'],
        ['Documentation', 'OpenAPI 3 document served at /api/v1/openapi.json and a rendered reference'],
      ] },
      { title: 'Webhook events', head: ['Event', 'Sent when'], widths: ['34%', '66%'], rows: [
        ['task.created, task.updated, task.deleted', 'A task changes; updates list the changed fields with old and new values'],
        ['comment.created, comment.updated, comment.deleted', 'A comment changes'],
        ['sprint.started, sprint.completed', 'A sprint changes state'],
        ['project.created, project.archived', 'A project changes'],
        ['member.added, member.removed, member.role_changed', 'Membership changes'],
      ] },
    ],
    lists: [{ title: 'Webhook delivery', items: [
      'Each endpoint has a secret; every delivery carries a signature (HMAC-SHA256) and a timestamp, so the receiver can check who sent it and reject copies older than 5 minutes.',
      'Failed deliveries (non-2xx or timeout over 10 seconds) retry after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours, then the endpoint is paused and its owner notified.',
      'A delivery log shows the last 100 attempts per endpoint with request, status and response time, and allows resend.',
      'Events are delivered at least once and in order per task; receivers use the event id to ignore duplicates.',
    ] }, { title: 'Built-in integrations', items: [
      'Chat: post to a channel when chosen events happen; create a task from a message; show a preview when a task link is pasted.',
      'Code hosting: link branches, commits and pull requests to a task by its key; move a task when a pull request merges.',
      'Calendar: a private subscription feed of a person\'s due dates, and optional two-way sync of scheduled tasks.',
      'Email: create tasks by forwarding to a project address; reply to a notification to comment.',
    ] }] },
  { code: 'IMP', title: 'Import and export', intro: 'Moving in and out must be safe, previewed and reversible.',
    tables: [{ title: 'Import steps', head: ['Step', 'Specification'], widths: ['22%', '78%'], rows: [
      ['1. Source', 'CSV upload, or an export file from another work-management tool; up to 20 MB and 50,000 rows'],
      ['2. Mapping', 'Each source column is mapped to a field, a custom field, a label or ignored; status values are mapped to project statuses; people are matched by email, otherwise created as placeholder members'],
      ['3. Dry run', 'A report shows how many tasks will be created, skipped and failed, with the first 50 errors and the reason; nothing is written'],
      ['4. Import', 'Runs in the background in batches with a progress bar; created tasks are tagged with the import id'],
      ['5. Undo', 'Within 7 days the whole import can be removed in one action; tasks edited since are listed first'],
    ] }],
    lists: [{ title: 'Export and portability', items: [
      'Per-project export to Excel and CSV with all fields, custom fields and a summary sheet (Excel today).',
      'Full workspace export as a ZIP of JSON files for projects, tasks, comments, activity and members, with attachments included, for any administrator, logged in the audit log.',
      'Account and workspace deletion removes personal data within 30 days and confirms by email; backups age out within 35 days.',
    ] }] },
  { code: 'RPT', title: 'Dashboards and reports', intro: 'People answer "where are we, and what is stuck?" without exporting.',
    tables: [{ title: 'Widgets and definitions', head: ['Widget', 'Definition'], widths: ['26%', '74%'], rows: [
      ['Status breakdown', 'Count of tasks by status category and by status for a filter'],
      ['Workload', 'Open tasks and estimated minutes per assignee, split into overdue, due this week and later'],
      ['Burndown and burn-up', 'Remaining and completed points or tasks per day of a sprint against an ideal line'],
      ['Velocity', 'Points completed in each of the last N completed sprints against points committed at start'],
      ['Cumulative flow', 'Tasks per status category per day over a period'],
      ['Cycle time', 'Time from first entering In progress to first entering Done; shows median and 85th percentile'],
      ['Lead time', 'Time from creation to first entering Done'],
      ['Throughput', 'Tasks completed per week'],
      ['Overdue and ageing', 'Open tasks past due and open tasks by age bucket (under 7, 7 to 30, over 30 days)'],
      ['Time and estimate', 'Logged time against estimate per project, person or label'],
    ] }],
    lists: [{ title: 'Behaviour', items: [
      'A dashboard is a grid of widgets, each with its own filter; dashboards are private or shared with the workspace; a workspace can have up to 25.',
      'Every widget shows its data as a table for screen readers, exports to CSV, and opens the underlying tasks when clicked.',
      'A report can be emailed on a schedule (daily, weekly, monthly) as a PDF and a link; recipients without access receive nothing.',
    ] }] },
  { code: 'TIM', title: 'Time tracking and capacity', intro: 'Time is recorded against tasks and compared with estimates and capacity.',
    tables: [{ title: 'Rules', head: ['Item', 'Specification'], widths: ['24%', '76%'], rows: [
      ['Entries', 'Start and stop a timer on a task, or add an entry with date, minutes (1 to 1,440 per entry) and note; one running timer per person'],
      ['Editing', 'People edit and delete their own entries; administrators edit anyone\'s; entries in a locked period cannot change'],
      ['Timesheet', 'Week grid per person by task; submit for approval; managers approve or return with a comment; approved weeks lock'],
      ['Capacity', 'Hours per day per person and non-working days set per person with workspace defaults; workload view compares assigned estimates with capacity'],
      ['Reports', 'Time by person, project, task, label and billable flag; export to CSV'],
    ] }], lists: [] },
  { code: 'DOC', title: 'Docs, goals and forms', intro: 'Context, objectives and intake sit beside the work.',
    tables: [
      { title: 'Specification', head: ['Area', 'Specification'], widths: ['16%', '84%'], rows: [
        ['Docs', 'Pages in a tree (up to 5 levels) inside a workspace or project; formatted text with headings, lists, tables, code, images and task mentions; autosave; version history with restore; page-level view and edit access; full-text searchable; page can be attached to a task'],
        ['Goals', 'An objective has a title, owner, period and 1 to 10 measurable results; a result is a number target, a percentage, or tasks linked to it; progress is the average of its results; results can update automatically from linked tasks completed'],
        ['Forms', 'A form belongs to a project, has fields mapped to task fields and custom fields, a default status, assignee and labels; it can be internal or public by link; public forms use a spam check and rate limit; each submission creates a task and records the submitter\'s answers'],
      ] }],
    lists: [] },
  { code: 'ADM', title: 'Security and administration', intro: 'Controls that security and compliance teams require before approving the product.',
    tables: [{ title: 'Audit events (recorded now or required)', head: ['Category', 'Events'], widths: ['22%', '78%'], rows: [
      ['Sign-in', 'Sign-in success and failure, sign-out, password change, reset request and use, session revoked, two-factor enrolled or removed'],
      ['Membership', 'Invitation sent, revoked, accepted; role changed; member removed; reset link created'],
      ['Content', 'Project created, archived, restored, deleted; workspace renamed or deleted; task deleted in bulk; export performed; import performed'],
      ['Security', 'Token created or revoked; webhook added; automation rule created; single sign-on settings changed; audit export downloaded'],
    ] }, { title: 'Administration console', head: ['Setting', 'Specification'], widths: ['26%', '74%'], rows: [
      ['Security policy', 'Require two-factor for all members; allowed email domains; session length; idle timeout; password rules; allowed IP ranges'],
      ['Single sign-on', 'SAML 2.0 and OpenID Connect; just-in-time account creation; role mapping from groups; enforce for a verified domain; a separate owner login that still works if single sign-on fails'],
      ['Provisioning', 'SCIM 2.0 users and groups; deactivate removes access within 5 minutes and reassigns or keeps tasks as the administrator chooses'],
      ['Data', 'Retention for deleted items, audit log retention (minimum 12 months), data export, workspace deletion with a grace period of 14 days'],
      ['Usage', 'Members, storage used against quota, API usage, last sign-in per member'],
    ] }],
    lists: [{ title: 'Audit log rules', items: ['Records actor, action, target, time, address and result; cannot be edited or deleted by any role.', 'Searchable by actor, action, target and date; export to CSV; visible to owners and administrators.'] }] },
  { code: 'AI', title: 'AI-assisted work (opt-in)', intro: 'Assistance reduces typing and triage; it is off until an administrator enables it.',
    tables: [{ title: 'Features and controls', head: ['Feature', 'Behaviour'], widths: ['26%', '74%'], rows: [
      ['Summaries', 'Summarise a long comment thread or a project\'s last week of activity'],
      ['Drafting', 'Draft a task description or acceptance criteria from a title; the person edits before saving'],
      ['Triage', 'Suggest labels, priority and assignee for a new task; suggestions are never applied without a click'],
      ['Search', 'Natural-language questions answered from content the asker can already see'],
      ['Controls', 'Workspace switch; per-feature switches; content is never used to train models; every request is recorded in the audit log without storing the content; permissions are respected so a person never receives text they could not open'],
    ] }], lists: [] },
  { code: 'MOB', title: 'Mobile experience', intro: 'Daily work must be possible from a phone.',
    tables: [], lists: [{ title: 'Requirements', items: [
      'The web app is installable (manifest, icons, offline shell) and every main screen works at 360 px width.',
      'My Tasks, Inbox, task panel, comments and quick add work without horizontal scrolling and with touch targets of at least 44 px.',
      'Push notifications for assignments, mentions and due reminders with a per-type setting.',
      'Read access to the last viewed projects while offline, with queued comments and status changes that sync when back online.',
      'A native application is decided after the installable app is evaluated with users.',
    ] }] },
];

/* ---------- section 9: planned data model additions. [table, purpose, key columns] ---------- */
const plannedTables = [
  ['audit_log', 'Immutable administrative and security events', 'id, workspace_id, actor_id, action, target_type, target_id, detail (text), ip, created_at; append-only, no update or delete rights'],
  ['api_tokens', 'Personal and service tokens', 'id, workspace_id, user_id, name, token_hash, scope, project_ids, last_used_at, expires_at, revoked_at'],
  ['webhook_endpoints and webhook_deliveries', 'Outbound events and their log', 'url, secret_hash, events, active, paused_at; delivery: endpoint_id, event_id, status, attempt, response_ms, created_at'],
  ['automation_rules and automation_runs', 'Rules and run log', 'rule: project_id, name, trigger, conditions, actions, enabled, created_by; run: rule_id, task_id, outcome, detail, started_at'],
  ['task_assignees', 'Multiple assignees', 'task_id, user_id; replaces the single assignee column in the interface'],
  ['task_types and workflows', 'Types and allowed transitions', 'type: project_id, name, icon, fields; transition: project_id, from_status_id, to_status_id, required_fields'],
  ['time_entries and timesheets', 'Time tracking', 'task_id, user_id, started_at, minutes, note, billable; timesheet: user_id, week, state, approved_by'],
  ['docs and doc_versions', 'Pages and history', 'doc: parent_id, title, body, owner_id; version: doc_id, body, created_by, created_at'],
  ['goals and goal_results', 'Objectives and measurable results', 'goal: title, owner_id, period; result: goal_id, kind, target, current, linked task filter'],
  ['forms and form_submissions', 'Intake', 'form: project_id, fields, default status, public flag; submission: form_id, answers, task_id'],
  ['dashboards and widgets', 'Custom reporting', 'dashboard: workspace_id, name, shared; widget: dashboard_id, kind, filter, position'],
  ['task_trash', 'Soft delete with restore', 'deleted_at and deleted_by on tasks, with a 30-day purge job'],
  ['project_members and guest_access', 'Private projects and guests', 'project_id, user_id, role; guest flag on members'],
  ['two_factor and recovery_codes', 'Two-factor sign-in', 'user_id, secret (encrypted), enrolled_at; hashed recovery codes'],
  ['sso_connections and scim_tokens', 'Identity providers', 'workspace_id, protocol, metadata, domain, role_map'],
  ['notification_preferences', 'Per-type delivery settings', 'user_id, event_type, in_app, email, push'],
];

/* ---------- section 10: screens ---------- */
/* [screen, route, purpose and main elements, states to design] */
const screens = [
  ['Sign in', '/login', 'Email and password, link to forgot password, link to invite acceptance', 'Wrong credentials, too many attempts, loading'],
  ['First-run setup', '/setup', 'Create the owner and workspace on an empty system', 'Validation errors; unavailable once an owner exists'],
  ['Forgot and reset password', '/forgot, /reset/:token', 'Request a link; set a new password', 'Same confirmation for any address; expired or used link'],
  ['Accept invitation', '/invite/:token', 'Show workspace and role; create or join with an account', 'Invalid, expired, wrong account'],
  ['Home', '/w/:ws', 'My work, project progress, team workload, recent activity', 'Empty workspace with first-project prompt'],
  ['My tasks', '/w/:ws/my-tasks', 'Tasks across projects grouped Overdue, Today, Upcoming, No date, Done this week', 'Nothing assigned'],
  ['Inbox', '/w/:ws/inbox', 'Notifications with unread filter, mark all read, reminders', 'Empty, loading, error'],
  ['Project views', '/w/:ws/p/:key/{list|board|backlog|timeline|calendar|daily}', 'Toolbar (search, filters, group, sort, saved views, new task) above the chosen view; task panel opens from the right', 'Empty project, no matches, loading page, error with retry, archived banner'],
  ['Task panel', '?task=n', 'All task fields, subtasks, relations, files, comments, activity, watch, copy link, delete', 'Conflict dialog, permission-limited read-only, unsaved edit'],
  ['Project settings', '/w/:ws/p/:key/settings', 'Details, statuses, labels, custom fields, archive, delete', 'Confirmation dialogs; last open or done status protected'],
  ['Workspace settings', '/w/:ws/settings', 'General, members and roles, invitations, reset links, delete workspace', 'Last owner protected'],
  ['Account', '/account', 'Profile, theme, email notifications, password change, sign out', 'Wrong current password'],
  ['Command palette', 'Ctrl or Cmd + K', 'Search tasks across projects; navigation and actions', 'No results, loading'],
  ['Planned screens', 'various', 'Table view, workload, roadmap, dashboards, reports, automation builder, API tokens and webhooks, docs, goals, forms, time sheets, audit log, administration console, import wizard', 'Each needs empty, loading, error and permission-denied states'],
];

const uiStandards = [
  'Every list, board, calendar and panel has an empty state that explains what belongs there and offers the next action.',
  'Loading shows grey placeholders in the shape of the final screen; operations over 1 second show progress; nothing blocks the whole screen except confirmation dialogs.',
  'Errors say what happened and what to do, never show codes alone, and keep the person\'s unsaved input.',
  'Destructive actions use a confirmation that names the item; irreversible ones require typing the name.',
  'A change shows on screen at once; if the server refuses it, the screen goes back and says why.',
  'Every pointer interaction (drag, resize, menus) has a keyboard equivalent and a spoken announcement of the result.',
  'Colour is never the only signal; text and controls meet 4.5:1 contrast in light and dark themes; focus is always visible; motion respects the reduced-motion setting.',
  'Layouts work from 360 px; tables scroll inside their container; dialogs become full-screen sheets on phones.',
  'Dates show in the person\'s locale; relative times ("2 hours ago") carry the exact time in a tooltip and accessible label.',
];

/* ---------- section 11: acceptance test scenarios ---------- */
/* [id, scenario, expected] */
const testScenarios = [
  ['T-01', 'A visitor opens an empty system, creates the owner and workspace, then a second visitor tries to register without an invitation', 'First succeeds; second is refused'],
  ['T-02', 'Wrong password for a real and for an unknown email', 'Identical message and similar timing; the eleventh attempt in 15 minutes returns 429'],
  ['T-03', 'Administrator invites a viewer by email; the invitee signs up; the viewer opens a task and tries to edit it', 'Read access works; every write returns 403'],
  ['T-04', 'Two members edit the same task title at once, then different fields at once', 'First case offers keep or overwrite; second saves both without conflict'],
  ['T-05', 'Create a blocking chain A blocks B blocks C, then make C block A', 'Refused with a clear message; no relation is stored'],
  ['T-06', 'Complete a monthly recurring task dated 31 January twice quickly', 'Exactly one new task dated the last day of February'],
  ['T-07', 'Start a sprint while another is active; complete a sprint choosing a planned sprint for unfinished tasks', 'First refused; second moves the tasks and freezes the snapshot'],
  ['T-08', 'Upload an SVG and an HTML file, then open them', 'Both download; neither renders or runs'],
  ['T-09', 'Delete a status used by tasks, then the last Done status', 'First asks for a replacement; second refused'],
  ['T-10', 'Archive a project, then try every write inside it', 'All refused with an archived message'],
  ['T-11', 'Seed 10,000 tasks; open the list and board; scroll', 'Usable within 1 second; no frame stalls; the page only draws the rows on screen'],
  ['T-12', 'Complete a main flow using only the keyboard and a screen reader', 'All actions reachable and announced; no serious accessibility findings in light or dark'],
  ['T-13', 'Remove the last owner, delete a workspace without typing its name', 'Both refused'],
  ['T-14', 'Planned: automation rule that sets a due date when status changes, run twice on the same event', 'Applies once; run log shows one success and one duplicate skipped'],
  ['T-15', 'Planned: webhook endpoint returns errors for a day', 'Retried on schedule, then paused; owner notified; resend works after fixing'],
  ['T-16', 'Planned: import 1,000 rows with 20 invalid, then undo', 'Dry run lists the 20 errors; import creates 980; undo removes them'],
];

module.exports = { capabilities, businessRules, stateMachines, notificationRules, detailSpecs, plannedTables, screens, uiStandards, testScenarios };

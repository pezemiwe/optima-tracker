# Cortex Tracker

A project and task tracker for teams: planning, boards, sprints, timelines, collaboration and reporting.
One Node server, one Postgres database, and a React frontend styled with Tailwind CSS. Deploys to Render from this folder.

## What it does

| Area | Features |
|---|---|
| **Accounts** | Email and password sign-in, cookie sessions, profile, light/dark/auto theme. **Forgot password** by email, or an admin-generated one-time reset link when email is not set up. |
| **Workspaces and roles** | Several workspaces per user. Owner, Admin, Member and Viewer roles. Invite-only sign-up with single-use, email-bound links (emailed automatically when email is configured). |
| **Projects** | Keys like `WEB-12`, colours, descriptions, leads, archive and restore, custom statuses and labels, **custom fields** (text, number, date, choice list, checkbox). |
| **Tasks** | Status, priority, assignee, labels, start and due date, due time, estimate, **story points**, subtasks, links, **file attachments**, watchers, **markdown descriptions with clickable checklists**, **recurring tasks** (daily, weekdays, weekly, monthly). |
| **Dependencies** | Blocks / blocked by, related, duplicates, with loop detection and a Blocked badge in the list, board and backlog. |
| **Collaboration** | Comments with `@mentions` and markdown, edit and delete, a history of every change, **edit-conflict detection** when two people change the same title or description. |
| **Notifications** | In-app bell and Inbox (assigned, mentioned, comments and status changes on tasks you watch, overdue reminders), a live unread badge, and **batched email digests** with a per-person opt-out. |
| **Views** | **List** (grouped, sortable, quick add), **Board** (drag and drop, and Alt+Arrow keyboard moves), **Backlog** (sprints, story points, drag tasks between sprints, start and complete, **burndown chart**), **Timeline** (Gantt bars you drag or resize, dependency arrows, day/week/month zoom), **Calendar** (drag to reschedule), **Daily** (the original close-out checklist). |
| **Finding things** | Search, multi-field filters including sprint, grouping, sorting, saved views (private or shared), a `Ctrl K` palette that searches every project. |
| **Bulk work** | Multi-select tasks to change status, priority, assignee, due date or sprint, or delete. |
| **Reporting** | Home dashboard (my work, project progress, team workload, activity), sprint burndown, Excel export per project including custom fields. |
| **Quality** | Responsive down to phone width, WCAG A/AA scans of every main screen in light and dark, keyboard shortcuts (`N`, `/`, `[`, `?`), 10,000-task projects open in under a second. |

### Roles

| Role | Can |
|---|---|
| Viewer | Read everything in the workspace, download files. |
| Member | Create and edit tasks, comment, attach files, plan sprints, create projects and labels. Can delete tasks they created. |
| Admin | Everything a member can, plus members and invites, reset links, project settings, statuses, labels, custom fields, and delete any task or comment. |
| Owner | Everything, including managing owners and deleting the workspace. A workspace always keeps at least one owner. |

## Upgrading from the original close-out checklist

The first account created on a fresh database becomes the workspace **owner**, and the original data is imported automatically into a **Daily Close-out** project (key `CLO`): tasks and numbers, notes, priorities, dates and times, creation and completion times, workstreams (as labels), subtasks, and owners and watchers (as placeholder members).

On an existing Render deployment the old `docs` table is read and left untouched. On a brand-new database the four starter tasks in `seed/seed.json` are used (set `SEED=off` to skip them). When a teammate joins, pick **"Is Samuel Kolajo"** in the invite form so their imported tasks move to the real account.

## Local development

You need Node 20+ and a Postgres database.

```bash
npm ci
export DATABASE_URL=postgres://localhost/optima
npm run build
npm start            # http://localhost:3000
```

For hot reload, keep `npm start` running and in a second terminal run `npm run dev` (Vite proxies `/api` to port 3000).

### Tests

Both suites need a **throwaway Postgres database**; they drop and recreate its `public` schema.

```bash
export TEST_DATABASE_URL=postgres://localhost/optima_test
npm test                 # API and logic: auth, roles, tasks, sprints, files, email, scale, markdown (75+ tests)
npm run build && npm run e2e   # real browser: Playwright + axe accessibility scans (17 scenarios)
```

`npm run e2e` uses Playwright's Chromium. Install it once with `npx playwright install chromium` (set `E2E_CHROMIUM=/path/to/chrome` to use a different browser). GitHub Actions (`.github/workflows/ci.yml`) runs both suites with a Postgres service on every push.

`npm run bench` seeds 20,000 tasks and times the API (first page ~30 ms, whole project ~1 s on a laptop).

## Deploy on Render

1. Push this folder to a **private** GitHub repository.
2. In Render choose **New > Blueprint**, connect GitHub, and pick the repository. Render reads `render.yaml` and proposes a web service `optima-tracker` (kept so existing deployments are not recreated) and a Postgres database `optima-db`.
3. Click **Apply**. When the service is live, open its URL. You are asked to **set up the workspace**: create the owner account there.
4. Open **Workspace settings > Members** to invite the team.

Updating an existing deployment is just a push: new tables are created automatically on start, and your existing data is imported the first time the owner account is created. Take a `pg_dump` backup first.

If Render says you cannot have more than one active free-tier database, reuse your existing database (below) or upgrade this one.

### Email (optional)

Without email everything still works: invite links and password-reset links are shown to admins to share by hand. To turn email on, set these in the service's environment:

| Variable | Meaning |
|---|---|
| `SMTP_URL` | e.g. `smtps://user:password@smtp.example.com:465`. Any SMTP provider works (Resend, Postmark, SES, Microsoft 365, Gmail app password). |
| `MAIL_FROM` | The sender, e.g. `Cortex Tracker <no-reply@yourcompany.com>`. |
| `APP_URL` | The public address, used for links in emails. Defaults to Render's `RENDER_EXTERNAL_URL`. |

### Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | Set automatically from the Render database. |
| `NODE_ENV` | recommended | `production` (set by `render.yaml`) marks cookies `Secure` and sends HSTS. |
| `SMTP_URL`, `MAIL_FROM`, `APP_URL` | no | Email, see above. |
| `ATTACHMENT_LIMIT_MB` | no | Total file storage per workspace. Default 500. Files are stored in Postgres, so this is also database size. |
| `SEED` | no | `off` skips the four starter tasks on a brand-new database. |
| `PGSSL` | no | `off` only if your database refuses TLS on an external URL. |

To use an existing database instead of creating one, delete the `databases:` block in `render.yaml` and replace the `DATABASE_URL` entry with `sync: false`, then paste your database's **Internal Database URL** into the service's environment settings.

### Plans and costs (verify on Render's pricing page)

- A **free web service** sleeps when idle and takes about a minute to wake.
- A **free database** expires after 30 days and Render allows one per account. Use a paid plan to keep data. Back up with `pg_dump "<external database url>" > optima.sql`.

## Security notes

- Passwords are hashed with scrypt; sessions are random 256-bit tokens stored only as SHA-256 hashes, in `HttpOnly`, `SameSite=Lax` cookies (`Secure` in production). Password reset links are single-use, expire (1 hour by email, 24 hours from an admin) and sign out every other session.
- Every write must come from the same origin. Logins, sign-ups and reset requests are rate limited. Responses never reveal whether an email has an account.
- Access is checked on every request against the caller's workspace role; resources in other workspaces answer `404`.
- Task text is rendered as plain text or through a markdown renderer that builds React elements (no HTML injection) and only allows `http`, `https` and `mailto` links. Uploaded files are never run: they download by default, only PNG/JPEG/GIF/WebP/PDF can display inline, SVG and HTML never do, and every file is served with `nosniff` and a sandboxing CSP.
- The rate limiter and live-update polling are per process, which is right for one Render instance.

## How it fits together

| Path | What it is |
|---|---|
| `server.js` | Entry point: connects to Postgres, applies migrations, starts Express and the email worker. |
| `server/migrations/` | Versioned SQL. New files run once, in order. |
| `server/routes/` | `auth`, `workspaces`, `projects`, `tasks`, `collab` (comments, notifications, views), `files` (attachments, relations), `agile` (sprints, custom fields). |
| `server/recurrence.js` | Next-date maths and spawning the next copy of a recurring task. |
| `server/mailer.js`, `emails.js`, `emailWorker.js` | Optional SMTP, message templates, batched notification digests. |
| `src/state/` | Auth/theme, and the workspace provider that polls for changes every 5 seconds and pages in large projects. |
| `src/views/` | Project page and the List, Board, Backlog, Timeline, Calendar and Daily views. |
| `src/components/` | Shell, task panel, command palette, markdown, burndown chart, pickers and dialogs. |
| `src/lib/` | Pure, unit-tested logic: dates, filters, markdown, colours, activity text. |
| `e2e/` | Browser tests and the harness that boots the real server. |

## Known limits

- Attachments live in Postgres (up to 10 MB each, 25 per task), which keeps deployment simple but is not meant for very large file libraries.
- Updates from other people arrive within about 5 seconds, by polling rather than a live socket.
- Not built: epics, time tracking, goals and docs, automation rules, integrations (Slack, GitHub), API tokens and webhooks, SSO and two-factor sign-in, per-project permissions and guests, import from other tools or CSV.
- Burndown for a sprint is computed from each task's completion time and does not track tasks that were moved in or out after the sprint started.

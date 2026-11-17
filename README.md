# Optima Close-out Tracker

Daily close-out checklist and Kanban board for the Zenith Optima engagement (close-out 13 Nov 2026).
One Node server, one Postgres database, and a React frontend styled with Tailwind CSS. Deploys to Render from this folder.

## 1. What you are deploying

| Part | What it does |
|---|---|
| `src/` | React application, reusable UI components, API client, and Tailwind CSS styles. |
| `index.html` / `vite.config.js` | Vite entry point and React/Tailwind build configuration. |
| `server.js` | Serves the built app from `dist/` and exposes a JSON API. |
| Postgres | Stores tasks, subtasks and an audit trail (who changed what). |
| `render.yaml` | Tells Render to create the web service and the database together. |
| `app_settings` | Shared workstream and task-owner lists. A new database starts with both lists empty. |
| `test/` | API tests, including anonymous access checks. |

Everyone sees changes within about 4 seconds. The browser remembers the theme, view and selected date; checklist data is stored in Postgres.

## 2. Before you deploy

**There is no sign-in or access control. Anyone who can reach the app can view, create, edit, and delete tasks.** The Render URL is accessible to anyone who has it. Do not use this deployment for confidential or restricted data; use an approved private network or add authentication before hosting sensitive information.

## 3. Deploy on Render

1. Create a **private** GitHub repository and push this folder to it (do not commit `node_modules`; `.gitignore` already skips it).
2. In Render choose **New > Blueprint**, connect GitHub, and pick the repository. Render reads `render.yaml`, builds the React app, and proposes a web service called `optima-tracker` and a database called `optima-db`.
3. Click **Apply**. The first build takes a few minutes. The web service URL appears at the top of its page (`https://optima-tracker-xxxx.onrender.com`).
4. Open the URL to use the tracker. No account is required.

## 4. Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Set automatically from the database. |
| `PGSSL` | no | Set to `off` only if your database refuses TLS on an external URL. |

## 5. How it behaves

- **Shared editing:** everyone who can reach the app can create, change, and delete tasks.
- **Fresh start:** no demo tasks are seeded; startup removes the four known placeholder tasks from existing databases.
- **Task numbers** (T-001, T-002 and so on) are assigned by the server, so two people adding at once never collide.
- **Configurable lists:** manage workstreams and task owners from the sidebar. Lists are shared and saved in PostgreSQL; an option cannot be removed while a task uses it.
- **Deleting a task** also deletes its subtasks.
- **Live updates:** the page checks for changes every 4 seconds while the tab is visible. The footer shows Live, Reconnecting or Disconnected.
- **Capacity:** tested with 100 tasks and 300 subtasks loading in a single request. The practical ceiling is far higher.
- **Excel export:** built in the browser and downloaded directly. Sheets: Tasks, Summary, Subtasks.
- **Fonts and spreadsheet library** are served from this app, so nothing depends on a public CDN or Google Fonts (useful on locked-down networks).

## 6. Audit trail and backups

Every create, update and delete is recorded in the `audit` table as an anonymous action with its time.

```sql
SELECT at, who, action, coll, doc, detail FROM audit ORDER BY id DESC LIMIT 50;
```

Run it from the database page in Render (Connect > External connection) with `psql`.

Backups: the Excel export is the simplest copy. For a full copy use `pg_dump "<external database url>" > optima.sql`. Take one on the 13th before the database is removed.

## 7. Plans and costs (verify on Render's pricing page)

- **Free web service** sleeps after a period of no traffic and takes about a minute to wake. The first person in the morning will wait.
- **Free database** expires after 30 days. That covers the close-out, but export the data before it lapses.
- A paid web service (Starter) removes the sleep. A paid database keeps data beyond 30 days.

## 8. Run locally

```bash
createdb optima
export DATABASE_URL=postgres://localhost/optima
npm ci
npm run build
npm start          # http://localhost:3000
```

For frontend development with hot reload, keep the configured server running on port 3000 and run `npm run dev` in a second terminal. Vite proxies `/api` requests to the Node server.

Tests (needs a throwaway database; it recreates the tables):

```bash
TEST_DATABASE_URL=postgres://localhost/optima_test npm test
```

## 9. Limits and access

- Anyone who can reach the deployment can view, change, and delete all tracker data. Use only in a trusted network, or add authentication and access controls before using sensitive data.
- There is no email sending. Overdue and escalation alerts appear in the bell inside the app. Email can be added later with a mail service and its key as another environment variable.
- Realtime is polling, not push. A change can take up to 4 seconds to appear on another screen.

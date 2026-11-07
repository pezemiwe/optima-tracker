-- Optima Work Tracker: relational schema (v1)

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text,
  name          text NOT NULL,
  password_hash text,
  color         text NOT NULL DEFAULT '#4a7a0a',
  theme         text NOT NULL DEFAULT 'system' CHECK (theme IN ('system','light','dark')),
  is_placeholder boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  rev         bigint NOT NULL DEFAULT 1
);

CREATE TABLE members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX members_user_idx ON members (user_id);

CREATE TABLE invites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email               text NOT NULL,
  role                text NOT NULL CHECK (role IN ('admin','member','viewer')),
  token_hash          text NOT NULL UNIQUE,
  placeholder_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  invited_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  accepted_at         timestamptz
);
CREATE INDEX invites_workspace_idx ON invites (workspace_id);

CREATE TABLE projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key          text NOT NULL CHECK (key ~ '^[A-Z][A-Z0-9]{1,7}$'),
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  color        text NOT NULL DEFAULT '#4a7a0a',
  lead_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  archived     boolean NOT NULL DEFAULT false,
  task_seq     integer NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);

CREATE TABLE statuses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  category    text NOT NULL CHECK (category IN ('todo','active','done')),
  color       text NOT NULL DEFAULT '#94a3b8',
  position    integer NOT NULL DEFAULT 0
);
CREATE INDEX statuses_project_idx ON statuses (project_id, position);

CREATE TABLE labels (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#64748b'
);
CREATE UNIQUE INDEX labels_name_unique ON labels (project_id, lower(name));

CREATE TABLE tasks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number           integer NOT NULL,
  title            text NOT NULL,
  description      text NOT NULL DEFAULT '',
  status_id        uuid NOT NULL REFERENCES statuses(id),
  priority         text NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent','high','medium','low','none')),
  assignee_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  reporter_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  parent_id        uuid REFERENCES tasks(id) ON DELETE CASCADE,
  start_date       date,
  due_date         date,
  due_time         time,
  estimate_minutes integer CHECK (estimate_minutes IS NULL OR estimate_minutes >= 0),
  position         double precision NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  UNIQUE (project_id, number),
  CHECK (start_date IS NULL OR due_date IS NULL OR start_date <= due_date)
);
CREATE INDEX tasks_project_status_idx ON tasks (project_id, status_id, position);
CREATE INDEX tasks_assignee_idx ON tasks (assignee_id);
CREATE INDEX tasks_due_idx ON tasks (due_date);
CREATE INDEX tasks_parent_idx ON tasks (parent_id);

CREATE TABLE task_labels (
  task_id  uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

CREATE TABLE task_watchers (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at  timestamptz
);
CREATE INDEX comments_task_idx ON comments (task_id, created_at);

CREATE TABLE links (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name       text NOT NULL,
  url        text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX links_task_idx ON links (task_id);

CREATE TABLE activity (
  id           bigserial PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  task_id      uuid REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action       text NOT NULL,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_project_idx ON activity (project_id, id DESC);
CREATE INDEX activity_task_idx ON activity (task_id, id DESC);
CREATE INDEX activity_workspace_idx ON activity (workspace_id, id DESC);

CREATE TABLE notifications (
  id           bigserial PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id      uuid REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  type         text NOT NULL CHECK (type IN ('assigned','mentioned','comment','status','invite')),
  body         text NOT NULL DEFAULT '',
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, workspace_id, id DESC);

CREATE TABLE saved_views (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  view         text NOT NULL CHECK (view IN ('list','board','calendar','daily')),
  config       jsonb NOT NULL DEFAULT '{}'::jsonb,
  shared       boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saved_views_project_idx ON saved_views (project_id);

CREATE TABLE legacy_import (
  done_at timestamptz NOT NULL DEFAULT now(),
  tasks   integer NOT NULL DEFAULT 0
);

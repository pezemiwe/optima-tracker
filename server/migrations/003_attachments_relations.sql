-- File attachments (stored in Postgres so no extra storage service is needed) and task relations.
CREATE TABLE attachments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  filename   text NOT NULL,
  mime       text NOT NULL,
  size       integer NOT NULL CHECK (size > 0),
  data       bytea NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachments_task_idx ON attachments (task_id);

CREATE TABLE task_relations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_task  uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  to_task    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('blocks','relates','duplicates')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_task, to_task, type),
  CHECK (from_task <> to_task)
);
CREATE INDEX task_relations_to_idx ON task_relations (to_task);

-- Sprints, story points, custom fields and recurring tasks.
CREATE TABLE sprints (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         text NOT NULL,
  goal         text NOT NULL DEFAULT '',
  start_date   date,
  end_date     date,
  state        text NOT NULL DEFAULT 'planned' CHECK (state IN ('planned','active','completed')),
  summary      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);
CREATE INDEX sprints_project_idx ON sprints (project_id);
-- A project can only have one running sprint at a time.
CREATE UNIQUE INDEX sprints_one_active ON sprints (project_id) WHERE state = 'active';

ALTER TABLE tasks ADD COLUMN sprint_id uuid REFERENCES sprints(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN points integer CHECK (points IS NULL OR (points >= 0 AND points <= 1000));
ALTER TABLE tasks ADD COLUMN recurrence jsonb;
ALTER TABLE tasks ADD COLUMN recurrence_spawned boolean NOT NULL DEFAULT false;
CREATE INDEX tasks_sprint_idx ON tasks (sprint_id);

CREATE TABLE custom_fields (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       text NOT NULL,
  type       text NOT NULL CHECK (type IN ('text','number','date','select','checkbox')),
  options    jsonb NOT NULL DEFAULT '[]'::jsonb,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX custom_fields_name_unique ON custom_fields (project_id, lower(name));

CREATE TABLE task_field_values (
  task_id  uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  value    jsonb NOT NULL,
  PRIMARY KEY (task_id, field_id)
);
CREATE INDEX task_field_values_field_idx ON task_field_values (field_id);

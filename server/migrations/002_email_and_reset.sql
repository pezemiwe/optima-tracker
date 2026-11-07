-- Email notifications and password reset.
ALTER TABLE users ADD COLUMN email_notifications boolean NOT NULL DEFAULT true;

CREATE TABLE password_resets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX password_resets_user_idx ON password_resets (user_id);

-- Which notifications have been sent by email. Existing ones count as sent so nobody is flooded on upgrade.
ALTER TABLE notifications ADD COLUMN emailed_at timestamptz;
UPDATE notifications SET emailed_at = now();
CREATE INDEX notifications_unsent_idx ON notifications (created_at) WHERE emailed_at IS NULL;

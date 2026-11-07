-- Saved views can now be made on the Backlog and Timeline tabs too.
ALTER TABLE saved_views DROP CONSTRAINT saved_views_view_check;
ALTER TABLE saved_views ADD CONSTRAINT saved_views_view_check CHECK (view IN ('list','board','backlog','timeline','calendar','daily'));

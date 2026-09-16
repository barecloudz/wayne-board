-- Security improvement: enforce per-org username uniqueness at the DB level.
-- PostgreSQL does not enforce uniqueness for NULL values, so multiple drivers
-- per org with no username set (NULL) are still permitted.
CREATE UNIQUE INDEX IF NOT EXISTS drivers_org_username_unique
  ON drivers (organization_id, username)
  WHERE username IS NOT NULL;

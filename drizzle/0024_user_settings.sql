-- Per-user key/value store for credentials and personal preferences
-- driver_id references drivers.driver_id (the FedEx ID string, same as session.driverId)
CREATE TABLE IF NOT EXISTS user_settings (
  id         SERIAL PRIMARY KEY,
  driver_id  TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  CONSTRAINT user_settings_driver_key_unique UNIQUE (driver_id, key)
);

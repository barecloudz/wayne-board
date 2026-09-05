-- Add missing UNIQUE constraint on driver_schedules.driver_id
-- Required for upsertSchedule's ON CONFLICT DO UPDATE to work
ALTER TABLE driver_schedules ADD CONSTRAINT driver_schedules_driver_id_unique UNIQUE (driver_id);

-- Performance indexes for org-scoped query patterns
-- Migration: 0029_add_performance_indexes.sql

CREATE INDEX IF NOT EXISTS inspections_org_vehicle_idx
  ON inspections (organization_id, vehicle_id);

CREATE INDEX IF NOT EXISTS ryde_scores_org_week_idx
  ON ryde_scores (organization_id, week);

CREATE INDEX IF NOT EXISTS dsw_route_days_org_date_idx
  ON dsw_route_days (organization_id, date);

CREATE INDEX IF NOT EXISTS driver_locations_org_driver_idx
  ON driver_locations (organization_id, driver_id);

CREATE INDEX IF NOT EXISTS attendance_log_org_driver_date_idx
  ON attendance_log (organization_id, driver_id, date);

CREATE INDEX IF NOT EXISTS vehicle_conditions_org_vehicle_idx
  ON vehicle_conditions (vehicle_id);

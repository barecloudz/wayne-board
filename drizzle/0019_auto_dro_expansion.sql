-- Enhanced dro_stops with full waypoint fields
ALTER TABLE dro_stops
  ADD COLUMN IF NOT EXISTS wid                   bigint,
  ADD COLUMN IF NOT EXISTS optimal_route         text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS optimal_sequence      integer,
  ADD COLUMN IF NOT EXISTS window_open           text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS window_close          text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_small_stop         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_cdo_stop           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hazardous          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_heavyweight        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tracking_ids          jsonb,
  ADD COLUMN IF NOT EXISTS actual_assignment_type text   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pickup_type           text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reason_code           text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS overflowed_route      text    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS num_lp_packages       integer NOT NULL DEFAULT 0;

-- Enhanced dro_routes with LP/SM/bulk/reg breakdown
ALTER TABLE dro_routes
  ADD COLUMN IF NOT EXISTS lp_stops                  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lp_packages               integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sm_stops                  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sm_packages               integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bulk_stops                integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bulk_packages             integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reg_stops                 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reg_packages              integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exceeded_target_duration  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS time_critical_stops       integer NOT NULL DEFAULT 0;

-- All DRO route plans (active plan flagged)
CREATE TABLE IF NOT EXISTS dro_route_plans (
  id             serial  PRIMARY KEY,
  plan_id        integer NOT NULL UNIQUE,
  name           text    NOT NULL DEFAULT '',
  total_routes   integer NOT NULL DEFAULT 0,
  lp_routes      integer NOT NULL DEFAULT 0,
  bulk_routes    integer NOT NULL DEFAULT 0,
  reg_routes     integer NOT NULL DEFAULT 0,
  small_routes   integer NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT false,
  last_used_date text    NOT NULL DEFAULT '',
  synced_at      timestamp DEFAULT NOW()
);

-- Permanent stop overrides (stops pinned to specific routes)
CREATE TABLE IF NOT EXISTS dro_stop_overrides (
  id             serial PRIMARY KEY,
  override_id    text   NOT NULL UNIQUE,
  stop_id        text   NOT NULL DEFAULT '',
  recipient_name text   NOT NULL DEFAULT '',
  address        text   NOT NULL DEFAULT '',
  postal_code    text   NOT NULL DEFAULT '',
  type           text   NOT NULL DEFAULT '',
  value          text   NOT NULL DEFAULT '',
  window_open    text   NOT NULL DEFAULT '',
  window_close   text   NOT NULL DEFAULT '',
  work_area_num  text   NOT NULL DEFAULT '',
  route_plan_ids jsonb,
  synced_at      timestamp DEFAULT NOW()
);

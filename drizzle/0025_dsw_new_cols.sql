-- Add DNA (Code 27), Code 85, and ILS Impact Pkgs columns to dsw_route_days
ALTER TABLE "dsw_route_days"
  ADD COLUMN IF NOT EXISTS "dna"             INTEGER,
  ADD COLUMN IF NOT EXISTS "code_85"         INTEGER,
  ADD COLUMN IF NOT EXISTS "ils_impact_pkgs" INTEGER;

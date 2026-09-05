-- Add organization_id to work_areas (missed during multi-tenancy refactor)
ALTER TABLE work_areas ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE;

-- Assign existing work areas to the first org (single-org setups)
UPDATE work_areas SET organization_id = (SELECT id FROM organizations ORDER BY id LIMIT 1) WHERE organization_id IS NULL;

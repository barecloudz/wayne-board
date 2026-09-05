-- Rename legacy "management" role to "bc" (Business Contact)
UPDATE drivers SET role = 'bc' WHERE role = 'management';

-- Add avatar_url column to drivers
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS avatar_url TEXT;

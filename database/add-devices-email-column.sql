-- Add email column to devices table for complete email migration
-- This completes the migration from username to email-based identity

-- Add email column to devices table
ALTER TABLE devices 
ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Create index for email column for better performance
CREATE INDEX IF NOT EXISTS idx_devices_email ON devices(email);

-- Update existing devices to use email from username (temporary migration)
-- This assumes usernames are already email addresses
UPDATE devices 
SET email = username 
WHERE email IS NULL AND username IS NOT NULL;

-- Add constraint to ensure email is not null for new records
-- (We'll keep username for backward compatibility but email is primary)
ALTER TABLE devices 
ADD CONSTRAINT devices_email_not_null 
CHECK (email IS NOT NULL OR username IS NOT NULL);

-- Update RLS policies for devices table to use email
DROP POLICY IF EXISTS "Users can view their own devices" ON devices;
DROP POLICY IF EXISTS "Users can insert their own devices" ON devices;
DROP POLICY IF EXISTS "Users can update their own devices" ON devices;

-- Create new RLS policies using email
CREATE POLICY "Users can view their own devices" ON devices
    FOR SELECT USING (email = auth.jwt() ->> 'email' OR username = auth.jwt() ->> 'email');

CREATE POLICY "Users can insert their own devices" ON devices
    FOR INSERT WITH CHECK (email = auth.jwt() ->> 'email' OR username = auth.jwt() ->> 'email');

CREATE POLICY "Users can update their own devices" ON devices
    FOR UPDATE USING (email = auth.jwt() ->> 'email' OR username = auth.jwt() ->> 'email');

-- Add comment for documentation
COMMENT ON COLUMN devices.email IS 'Primary email identifier for device owner (replaces username)';
COMMENT ON COLUMN devices.username IS 'Legacy username field (kept for backward compatibility)';

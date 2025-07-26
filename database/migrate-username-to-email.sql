-- Migration Script: Convert username to email in devices and device_requests tables
-- Run this in your Supabase SQL Editor

-- Step 1: Add email column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Step 2: Update users table to populate email from username (assuming usernames are emails or convert them)
UPDATE users 
SET email = CASE 
    WHEN username LIKE '%@%' THEN username 
    ELSE username || '@example.com' 
END
WHERE email IS NULL;

-- Step 3: Make email unique and not null in users table
UPDATE users SET email = username || '@temp.com' WHERE email IS NULL;
ALTER TABLE users ALTER COLUMN email SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email);

-- Step 4: Add email column to devices table
ALTER TABLE devices ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Step 5: Populate email in devices table from users table
UPDATE devices 
SET email = u.email
FROM users u 
WHERE devices.username = u.username AND devices.email IS NULL;

-- Step 6: Make email not null in devices table
ALTER TABLE devices ALTER COLUMN email SET NOT NULL;

-- Step 7: Drop RLS policies that depend on username column
DROP POLICY IF EXISTS "Users can view their own devices" ON devices;
DROP POLICY IF EXISTS "Users can insert their own devices" ON devices;
DROP POLICY IF EXISTS "Users can update their own devices" ON devices;
DROP POLICY IF EXISTS "Service role can access devices" ON devices;

-- Step 8: Drop the old username column from devices table and update foreign key
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_username_fkey;
ALTER TABLE devices DROP COLUMN IF EXISTS username CASCADE;

-- Step 9: Add foreign key constraint for email
ALTER TABLE devices ADD CONSTRAINT devices_email_fkey 
    FOREIGN KEY (email) REFERENCES users(email) ON DELETE CASCADE;

-- Step 10: Update indexes for devices table
DROP INDEX IF EXISTS idx_devices_username;
CREATE INDEX IF NOT EXISTS idx_devices_email ON devices(email);

-- Step 11: Recreate RLS policies using email instead of username
CREATE POLICY "Users can view their own devices" ON devices 
    FOR SELECT USING (email = auth.jwt() ->> 'email');

CREATE POLICY "Users can insert their own devices" ON devices 
    FOR INSERT WITH CHECK (email = auth.jwt() ->> 'email');

CREATE POLICY "Users can update their own devices" ON devices 
    FOR UPDATE USING (email = auth.jwt() ->> 'email');

CREATE POLICY "Service role can access devices" ON devices 
    FOR ALL USING (auth.role() = 'service_role');

-- Step 12: Update device_requests table if it exists
-- First check if device_requests table exists and has the structure we expect
DO $$
BEGIN
    -- Add email column to device_requests if table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'device_requests') THEN
        -- Add email column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'device_requests' AND column_name = 'email') THEN
            ALTER TABLE device_requests ADD COLUMN email VARCHAR(255);
        END IF;
        
        -- Populate email from devices table
        UPDATE device_requests 
        SET email = d.email
        FROM devices d 
        WHERE device_requests.device_id = d.id AND device_requests.email IS NULL;
        
        -- Make email not null
        ALTER TABLE device_requests ALTER COLUMN email SET NOT NULL;
        
        -- Create index
        CREATE INDEX IF NOT EXISTS idx_device_requests_email ON device_requests(email);
    END IF;
END $$;

-- Step 13: Update payment_schema.sql references
-- Update payments table to use email instead of username
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments') THEN
        -- Add email column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'payments' AND column_name = 'email') THEN
            ALTER TABLE payments ADD COLUMN email VARCHAR(255);
        END IF;
        
        -- If payments table has username column, copy data to email
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'payments' AND column_name = 'username') THEN
            UPDATE payments 
            SET email = CASE 
                WHEN username LIKE '%@%' THEN username 
                ELSE username || '@example.com' 
            END
            WHERE email IS NULL;
            
            -- Drop username column
            ALTER TABLE payments DROP COLUMN username;
        END IF;
        
        -- Update indexes
        DROP INDEX IF EXISTS idx_payments_username;
        CREATE INDEX IF NOT EXISTS idx_payments_email ON payments(email);
    END IF;
END $$;

-- Step 14: Update admin_settings for admin usernames to admin emails
UPDATE admin_settings 
SET setting_value = REPLACE(REPLACE(setting_value, 'admin,ADMIN', 'admin@example.com,ADMIN@example.com'), 'admin', 'admin@example.com')
WHERE setting_key = 'admin_usernames' AND setting_value NOT LIKE '%@%';

-- Step 15: Clean up old username column from users table (optional - keep for reference)
-- ALTER TABLE users DROP COLUMN username;

-- Verification queries (run these to check the migration)
-- SELECT 'users' as table_name, count(*) as count FROM users;
-- SELECT 'devices' as table_name, count(*) as count FROM devices;
-- SELECT 'payments' as table_name, count(*) as count FROM payments WHERE email IS NOT NULL;

COMMIT;

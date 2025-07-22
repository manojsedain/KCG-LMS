-- LMS AI Assistant Database Schema
-- Run this in your Supabase SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

-- Devices table for hardware/browser fingerprinting
CREATE TABLE IF NOT EXISTS devices (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(50) NOT NULL,
    hwid VARCHAR(255) NOT NULL,
    fingerprint TEXT NOT NULL,
    device_name VARCHAR(100),
    browser_info TEXT,
    os_info VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'blocked', 'expired')),
    aes_key TEXT NOT NULL, -- Base64 encoded AES key for this device
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by VARCHAR(50),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
    last_used TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    usage_count INTEGER DEFAULT 0,
    UNIQUE(hwid, fingerprint)
);

-- Admin settings table
CREATE TABLE IF NOT EXISTS admin_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    setting_key VARCHAR(50) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    setting_type VARCHAR(20) DEFAULT 'string' CHECK (setting_type IN ('string', 'boolean', 'number', 'json')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Script updates and version management
CREATE TABLE IF NOT EXISTS script_updates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    version VARCHAR(20) NOT NULL,
    encrypted_script TEXT NOT NULL, -- Base64 encoded encrypted script
    update_notes TEXT,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(50),
    file_size INTEGER,
    checksum VARCHAR(64)
);

-- System logs
CREATE TABLE IF NOT EXISTS logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    log_type VARCHAR(30) NOT NULL CHECK (log_type IN ('security', 'admin', 'device', 'script', 'error', 'info')),
    level VARCHAR(10) DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error', 'critical')),
    message TEXT NOT NULL,
    details JSONB,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Device approval requests (for admin notifications)
CREATE TABLE IF NOT EXISTS device_requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    username VARCHAR(50) NOT NULL,
    request_type VARCHAR(20) DEFAULT 'new' CHECK (request_type IN ('new', 'replacement', 'reactivation')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
    admin_notes TEXT,
    processed_by VARCHAR(50),
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default admin settings
INSERT INTO admin_settings (setting_key, setting_value, setting_type, description) VALUES
('site_password', 'wrongnumber', 'string', 'Password required to download loader script'),
('admin_password', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBdXfs2Yk4S9Em', 'string', 'Hashed admin password (default: manakamana12)'),
('secret_keyword', 'admin', 'string', 'Secret keyword to access admin panel'),
('2fa_enabled', 'false', 'boolean', 'Enable two-factor authentication'),
('backup_codes', '[]', 'json', 'Admin backup codes for 2FA'),
('max_devices_per_user', '3', 'number', 'Maximum devices allowed per user'),
('device_expiry_days', '30', 'number', 'Days before device expires'),
('auto_approve_devices', 'false', 'boolean', 'Automatically approve new devices'),
('maintenance_mode', 'false', 'boolean', 'Enable maintenance mode'),
('email_notifications', 'true', 'boolean', 'Send email notifications for new device requests')
ON CONFLICT (setting_key) DO NOTHING;

-- Insert initial script version
INSERT INTO script_updates (version, encrypted_script, update_notes, is_active, created_by) VALUES
('1.0.0', '', 'Initial release - LMS AI Assistant with basic functionality', true, 'system')
ON CONFLICT DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_devices_username ON devices(username);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_hwid ON devices(hwid);
CREATE INDEX IF NOT EXISTS idx_logs_type_created ON logs(log_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id);
CREATE INDEX IF NOT EXISTS idx_device_requests_status ON device_requests(status);

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_requests ENABLE ROW LEVEL SECURITY;

-- Create policies (these will be managed by service role key in production)
-- For now, allow service role to access everything
CREATE POLICY "Service role can manage all data" ON users FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can manage all devices" ON devices FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can manage all settings" ON admin_settings FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can manage all scripts" ON script_updates FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can manage all logs" ON logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can manage all requests" ON device_requests FOR ALL USING (auth.role() = 'service_role');

-- Functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_admin_settings_updated_at BEFORE UPDATE ON admin_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate AES key
CREATE OR REPLACE FUNCTION generate_aes_key()
RETURNS TEXT AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'base64');
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired devices
CREATE OR REPLACE FUNCTION cleanup_expired_devices()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE devices 
    SET status = 'expired' 
    WHERE status = 'active' 
    AND expires_at < NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    INSERT INTO logs (log_type, level, message, details)
    VALUES ('device', 'info', 'Cleaned up expired devices', jsonb_build_object('count', expired_count));
    
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to clean up expired devices (run daily)
-- Note: This requires pg_cron extension which may not be available on all Supabase plans
-- SELECT cron.schedule('cleanup-expired-devices', '0 2 * * *', 'SELECT cleanup_expired_devices();');

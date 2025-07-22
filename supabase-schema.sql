-- LMS AI Assistant Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

-- Devices table
CREATE TABLE IF NOT EXISTS devices (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    username VARCHAR(255) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    hwid VARCHAR(255) NOT NULL,
    fingerprint VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    browser_info JSONB,
    os_info JSONB,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'blocked', 'expired')),
    approved_by VARCHAR(255),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used TIMESTAMP WITH TIME ZONE,
    usage_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(hwid, fingerprint)
);

-- Admin settings table
CREATE TABLE IF NOT EXISTS admin_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    setting_key VARCHAR(255) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'string' CHECK (setting_type IN ('string', 'number', 'boolean', 'json')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Logs table
CREATE TABLE IF NOT EXISTS logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    log_type VARCHAR(50) NOT NULL CHECK (log_type IN ('admin', 'device', 'script', 'security', 'error', 'info')),
    level VARCHAR(20) DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
    message TEXT NOT NULL,
    details JSONB,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Script updates table
CREATE TABLE IF NOT EXISTS script_updates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    version VARCHAR(50) NOT NULL,
    script_content TEXT NOT NULL,
    update_notes TEXT,
    is_active BOOLEAN DEFAULT false,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    file_size INTEGER,
    checksum VARCHAR(255)
);

-- Device requests table
CREATE TABLE IF NOT EXISTS device_requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    request_type VARCHAR(50) DEFAULT 'approval' CHECK (request_type IN ('approval', 'reactivation', 'extension')),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    message TEXT,
    processed_by VARCHAR(255),
    processed_at TIMESTAMP WITH TIME ZONE,
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active);

CREATE INDEX IF NOT EXISTS idx_devices_username ON devices(username);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_devices_hwid_fingerprint ON devices(hwid, fingerprint);
CREATE INDEX IF NOT EXISTS idx_devices_created_at ON devices(created_at);

CREATE INDEX IF NOT EXISTS idx_admin_settings_key ON admin_settings(setting_key);

CREATE INDEX IF NOT EXISTS idx_logs_type ON logs(log_type);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON logs(user_id);

CREATE INDEX IF NOT EXISTS idx_script_updates_active ON script_updates(is_active);
CREATE INDEX IF NOT EXISTS idx_script_updates_created_at ON script_updates(created_at);

CREATE INDEX IF NOT EXISTS idx_device_requests_status ON device_requests(status);
CREATE INDEX IF NOT EXISTS idx_device_requests_device_id ON device_requests(device_id);

-- Create function to increment usage count
CREATE OR REPLACE FUNCTION increment_usage_count(device_id UUID)
RETURNS INTEGER AS $$
DECLARE
    new_count INTEGER;
BEGIN
    UPDATE devices 
    SET usage_count = usage_count + 1 
    WHERE id = device_id 
    RETURNING usage_count INTO new_count;
    
    RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Create function to cleanup expired devices
CREATE OR REPLACE FUNCTION cleanup_expired_devices()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE devices 
    SET status = 'expired' 
    WHERE status = 'active' 
    AND expires_at < NOW()
    AND expires_at IS NOT NULL;
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Insert default admin settings
INSERT INTO admin_settings (setting_key, setting_value, setting_type, description) VALUES
('admin_password', 'manakamana12', 'string', 'Admin login password'),
('maintenance_mode', 'false', 'boolean', 'Enable maintenance mode'),
('auto_approve_devices', 'false', 'boolean', 'Automatically approve new devices'),
('max_devices_per_user', '3', 'number', 'Maximum devices per user'),
('device_expiry_days', '30', 'number', 'Device expiration in days'),
('email_notifications', 'true', 'boolean', 'Enable email notifications'),
('site_password', 'wrongnumber', 'string', 'Site access password')
ON CONFLICT (setting_key) DO NOTHING;

-- Insert initial script version
INSERT INTO script_updates (version, script_content, update_notes, is_active, created_by) VALUES
('1.0.0', '// Initial LMS AI Assistant Script\nconsole.log("LMS AI Assistant v1.0.0 loaded");', 'Initial release', true, 'system')
ON CONFLICT DO NOTHING;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_settings_updated_at BEFORE UPDATE ON admin_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) for better security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_requests ENABLE ROW LEVEL SECURITY;

-- Create policies (allow service role to access everything)
CREATE POLICY "Service role can access users" ON users FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access devices" ON devices FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access admin_settings" ON admin_settings FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access logs" ON logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access script_updates" ON script_updates FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access device_requests" ON device_requests FOR ALL USING (auth.role() = 'service_role');

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

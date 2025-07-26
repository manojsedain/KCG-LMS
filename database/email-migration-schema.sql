-- LMS AI Assistant Database Schema - Email Migration
-- Run this in your Supabase SQL Editor to migrate from username to email

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Updated Users table (email instead of username)
CREATE TABLE IF NOT EXISTS users_new (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

-- Updated Devices table (email instead of username)
CREATE TABLE IF NOT EXISTS devices_new (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) NOT NULL REFERENCES users_new(email) ON DELETE CASCADE,
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
    payment_id UUID,
    payment_status VARCHAR(50) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
    UNIQUE(hwid, fingerprint)
);

-- Payments table (updated with email)
CREATE TABLE IF NOT EXISTS payments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    paypal_payment_id VARCHAR(255),
    paypal_transaction_id VARCHAR(255),
    payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
    subscription_type VARCHAR(50) DEFAULT 'discount' CHECK (subscription_type IN ('discount', 'lifetime')),
    device_hwid VARCHAR(255),
    payment_proof_image TEXT, -- Base64 encoded image for manual payments
    payment_method VARCHAR(50) DEFAULT 'paypal' CHECK (payment_method IN ('paypal', 'manual')),
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment settings table
CREATE TABLE IF NOT EXISTS payment_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    setting_key VARCHAR(255) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'string' CHECK (setting_type IN ('string', 'number', 'boolean', 'json')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notification logs table
CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    notification_type VARCHAR(50) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    message TEXT,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    device_id UUID REFERENCES devices_new(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notification logs table (new version for email-based functions)
CREATE TABLE IF NOT EXISTS notification_logs_new (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    notification_type VARCHAR(50) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    message TEXT,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    device_id UUID REFERENCES devices_new(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payments table (new version for email-based functions)
CREATE TABLE IF NOT EXISTS payments_new (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    paypal_payment_id VARCHAR(255),
    paypal_transaction_id VARCHAR(255),
    payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
    subscription_type VARCHAR(50) DEFAULT 'discount' CHECK (subscription_type IN ('discount', 'lifetime')),
    device_hwid VARCHAR(255),
    payment_proof_image TEXT, -- Base64 encoded image for manual payments
    payment_method VARCHAR(50) DEFAULT 'paypal' CHECK (payment_method IN ('paypal', 'manual')),
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Payment settings table (for payment configuration)
CREATE TABLE IF NOT EXISTS payment_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    setting_key VARCHAR(255) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'string' CHECK (setting_type IN ('string', 'number', 'boolean', 'json')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contact messages table (for index page chat)
CREATE TABLE IF NOT EXISTS contact_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sender_email VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255),
    message TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'replied')),
    admin_reply TEXT,
    replied_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contact messages table (new version for email-based functions)
CREATE TABLE IF NOT EXISTS contact_messages_new (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sender_email VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255),
    subject VARCHAR(255),
    message TEXT NOT NULL,
    newsletter_signup BOOLEAN DEFAULT false,
    status VARCHAR(50) DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'replied')),
    admin_reply TEXT,
    replied_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add email column to existing devices table for backward compatibility
ALTER TABLE devices ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS payment_id UUID;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded'));

-- Token usage tracking table
CREATE TABLE IF NOT EXISTS token_usage (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    device_hwid VARCHAR(255) NOT NULL,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    session_id VARCHAR(255),
    script_version VARCHAR(50),
    usage_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(email, device_hwid, usage_date)
);

-- Updated Logs table (email instead of username)
CREATE TABLE IF NOT EXISTS logs_new (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    log_type VARCHAR(50) NOT NULL CHECK (log_type IN ('admin', 'device', 'script', 'security', 'error', 'info', 'payment')),
    level VARCHAR(20) DEFAULT 'info' CHECK (level IN ('debug', 'info', 'warn', 'error')),
    message TEXT NOT NULL,
    details JSONB,
    user_email VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Script updates table (unchanged)
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

-- Device requests table (updated with email)
CREATE TABLE IF NOT EXISTS device_requests_new (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    device_id UUID REFERENCES devices_new(id) ON DELETE CASCADE,
    request_type VARCHAR(50) DEFAULT 'approval' CHECK (request_type IN ('approval', 'reactivation', 'extension')),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    message TEXT,
    processed_by VARCHAR(255),
    processed_at TIMESTAMP WITH TIME ZONE,
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_new_email ON users_new(email);
CREATE INDEX IF NOT EXISTS idx_users_new_last_active ON users_new(last_active);

CREATE INDEX IF NOT EXISTS idx_devices_new_email ON devices_new(email);
CREATE INDEX IF NOT EXISTS idx_devices_new_status ON devices_new(status);
CREATE INDEX IF NOT EXISTS idx_devices_new_hwid_fingerprint ON devices_new(hwid, fingerprint);
CREATE INDEX IF NOT EXISTS idx_devices_new_created_at ON devices_new(created_at);
CREATE INDEX IF NOT EXISTS idx_devices_new_payment_status ON devices_new(payment_status);

CREATE INDEX IF NOT EXISTS idx_payments_email ON payments(email);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_paypal_id ON payments(paypal_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

CREATE INDEX IF NOT EXISTS idx_payment_settings_key ON payment_settings(setting_key);

CREATE INDEX IF NOT EXISTS idx_notification_logs_email ON notification_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_notification_logs_created_at ON notification_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON contact_messages(status);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON contact_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_token_usage_email ON token_usage(email);
CREATE INDEX IF NOT EXISTS idx_token_usage_date ON token_usage(usage_date);
CREATE INDEX IF NOT EXISTS idx_token_usage_email_date ON token_usage(email, usage_date);

CREATE INDEX IF NOT EXISTS idx_logs_new_type ON logs_new(log_type);
CREATE INDEX IF NOT EXISTS idx_logs_new_level ON logs_new(level);
CREATE INDEX IF NOT EXISTS idx_logs_new_created_at ON logs_new(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_new_user_email ON logs_new(user_email);

CREATE INDEX IF NOT EXISTS idx_script_updates_active ON script_updates(is_active);
CREATE INDEX IF NOT EXISTS idx_script_updates_created_at ON script_updates(created_at);

CREATE INDEX IF NOT EXISTS idx_device_requests_new_status ON device_requests_new(status);
CREATE INDEX IF NOT EXISTS idx_device_requests_new_device_id ON device_requests_new(device_id);

-- Create function to increment usage count
CREATE OR REPLACE FUNCTION increment_usage_count_new(device_id UUID)
RETURNS INTEGER AS $$
DECLARE
    new_count INTEGER;
BEGIN
    UPDATE devices_new 
    SET usage_count = usage_count + 1 
    WHERE id = device_id 
    RETURNING usage_count INTO new_count;
    
    RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Create function to track token usage
CREATE OR REPLACE FUNCTION track_token_usage(
    user_email VARCHAR(255),
    device_hwid VARCHAR(255),
    tokens_used INTEGER,
    session_id VARCHAR(255) DEFAULT NULL,
    script_version VARCHAR(50) DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO token_usage (email, device_hwid, tokens_used, session_id, script_version)
    VALUES (user_email, device_hwid, tokens_used, session_id, script_version)
    ON CONFLICT (email, device_hwid, usage_date)
    DO UPDATE SET 
        tokens_used = token_usage.tokens_used + EXCLUDED.tokens_used,
        session_id = COALESCE(EXCLUDED.session_id, token_usage.session_id),
        script_version = COALESCE(EXCLUDED.script_version, token_usage.script_version);
END;
$$ LANGUAGE plpgsql;

-- Create function to cleanup expired devices
CREATE OR REPLACE FUNCTION cleanup_expired_devices_new()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE devices_new 
    SET status = 'expired' 
    WHERE status = 'active' 
    AND expires_at < NOW()
    AND expires_at IS NOT NULL;
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Insert default payment settings
INSERT INTO payment_settings (setting_key, setting_value, setting_type, description) VALUES
('paypal_client_id', '', 'string', 'PayPal Client ID'),
('paypal_client_secret', '', 'string', 'PayPal Client Secret'),
('paypal_environment', 'sandbox', 'string', 'PayPal Environment (sandbox/live)'),
('discount_price', '36.00', 'number', 'Discount price in USD'),
('lifetime_price', '68.00', 'number', 'Lifetime price in USD'),
('discount_end_date', '2025-08-31', 'string', 'Discount period end date'),
('admin_emails', 'manojsedain40@gmail.com', 'string', 'Admin email addresses (comma separated)'),
('developer_email', 'manojsedain40@gmail.com', 'string', 'Developer email for notifications'),
('contact_email', 'manojsedain40@gmail.com', 'string', 'Email for contact form messages'),
('site_password', 'wrongnumber', 'string', 'Site access password'),
('email_service', 'emailjs', 'string', 'Email service provider (emailjs/gmail)'),
('smtp_host', '', 'string', 'SMTP host for Gmail'),
('smtp_port', '587', 'number', 'SMTP port'),
('smtp_username', '', 'string', 'SMTP username'),
('smtp_password', '', 'string', 'SMTP password')
ON CONFLICT (setting_key) DO NOTHING;

-- Insert default admin settings (migrated to payment_settings)
INSERT INTO payment_settings (setting_key, setting_value, setting_type, description) VALUES
('admin_password', 'manakamana12', 'string', 'Admin login password'),
('maintenance_mode', 'false', 'boolean', 'Enable maintenance mode'),
('auto_approve_devices', 'false', 'boolean', 'Automatically approve new devices'),
('max_devices_per_user', '3', 'number', 'Maximum devices per user'),
('device_expiry_days', '30', 'number', 'Device expiration in days'),
('email_notifications', 'true', 'boolean', 'Enable email notifications')
ON CONFLICT (setting_key) DO NOTHING;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_devices_new_updated_at BEFORE UPDATE ON devices_new
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_settings_updated_at BEFORE UPDATE ON payment_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) for better security
ALTER TABLE users_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE script_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_requests_new ENABLE ROW LEVEL SECURITY;

-- Create policies (allow service role to access everything)
CREATE POLICY "Service role can access users_new" ON users_new FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access devices_new" ON devices_new FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access payments" ON payments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access payment_settings" ON payment_settings FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access notification_logs" ON notification_logs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access contact_messages" ON contact_messages FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access token_usage" ON token_usage FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access logs_new" ON logs_new FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access script_updates" ON script_updates FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role can access device_requests_new" ON device_requests_new FOR ALL USING (auth.role() = 'service_role');

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Migration script to copy existing data (run after creating new tables)
-- Note: This assumes you want to convert existing usernames to email format
/*
-- Copy users (you may need to manually update usernames to emails)
INSERT INTO users_new (email, created_at, last_active, is_active)
SELECT 
    CASE 
        WHEN username LIKE '%@%' THEN username 
        ELSE username || '@example.com' 
    END as email,
    created_at, 
    last_active, 
    is_active 
FROM users;

-- Copy devices (update username references to email)
INSERT INTO devices_new (email, hwid, fingerprint, device_name, browser_info, os_info, status, approved_by, approved_at, created_at, updated_at, last_used, usage_count, expires_at)
SELECT 
    CASE 
        WHEN d.username LIKE '%@%' THEN d.username 
        ELSE d.username || '@example.com' 
    END as email,
    d.hwid, d.fingerprint, d.device_name, d.browser_info, d.os_info, d.status, d.approved_by, d.approved_at, d.created_at, d.updated_at, d.last_used, d.usage_count, d.expires_at
FROM devices d;

-- Copy logs
INSERT INTO logs_new (log_type, level, message, details, user_email, ip_address, user_agent, created_at)
SELECT 
    l.log_type, l.level, l.message, l.details,
    CASE 
        WHEN u.username LIKE '%@%' THEN u.username 
        ELSE u.username || '@example.com' 
    END as user_email,
    l.ip_address, l.user_agent, l.created_at
FROM logs l
LEFT JOIN users u ON l.user_id = u.id;

-- Copy device requests
INSERT INTO device_requests_new (device_id, request_type, status, message, processed_by, processed_at, admin_notes, created_at)
SELECT 
    dn.id as device_id, dr.request_type, dr.status, dr.message, dr.processed_by, dr.processed_at, dr.admin_notes, dr.created_at
FROM device_requests dr
JOIN devices d ON dr.device_id = d.id
JOIN devices_new dn ON dn.hwid = d.hwid AND dn.fingerprint = d.fingerprint;
*/

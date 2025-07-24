-- Payment system database schema for LMS AI Assistant

-- Payments table to track all payment transactions
CREATE TABLE IF NOT EXISTS payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100),
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_method VARCHAR(20) DEFAULT 'paypal',
    paypal_transaction_id VARCHAR(100),
    paypal_payment_id VARCHAR(100),
    payment_status VARCHAR(20) DEFAULT 'pending', -- pending, completed, failed, refunded
    payment_date TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP, -- for subscription expiry
    subscription_type VARCHAR(20), -- discount, lifetime
    payment_proof_url TEXT, -- URL to uploaded payment screenshot
    device_hwid VARCHAR(1000), -- Link to device that made payment
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Payment settings table for admin configuration
CREATE TABLE IF NOT EXISTS payment_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    setting_key VARCHAR(50) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default payment settings
INSERT INTO payment_settings (setting_key, setting_value, description) VALUES
('paypal_client_id', '', 'PayPal Client ID for payment processing'),
('paypal_client_secret', '', 'PayPal Client Secret for payment processing'),
('paypal_environment', 'sandbox', 'PayPal environment: sandbox or live'),
('discount_price', '36.00', 'Discount price until 8th month (USD)'),
('lifetime_price', '68.00', 'Lifetime subscription price from 9th month (USD)'),
('discount_end_date', '2025-08-31', 'End date for discount pricing'),
('payment_enabled', 'true', 'Enable/disable payment system'),
('admin_usernames', 'admin,ADMIN', 'Comma-separated list of admin usernames who get free access'),
('notification_email', '', 'Email to receive payment notifications'),
('developer_email', '', 'Developer email for device approval receipts')
ON CONFLICT (setting_key) DO NOTHING;

-- Notification logs table
CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    notification_type VARCHAR(50) NOT NULL, -- payment_success, device_approval_request, etc.
    recipient_email VARCHAR(100),
    subject VARCHAR(200),
    message TEXT,
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, failed
    payment_id UUID REFERENCES payments(id),
    device_id UUID REFERENCES devices(id),
    created_at TIMESTAMP DEFAULT NOW(),
    sent_at TIMESTAMP
);

-- Add payment_id to devices table to link devices with payments
ALTER TABLE devices ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(id);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid'; -- unpaid, paid, admin_free

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payments_username ON payments(username);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_hwid ON payments(device_hwid);
CREATE INDEX IF NOT EXISTS idx_devices_payment ON devices(payment_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON notification_logs(notification_type);

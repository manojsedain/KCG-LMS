-- Fix payment_settings table schema issue
-- Run this in your Supabase SQL Editor to fix the missing setting_type column

-- Step 1: Drop existing payment_settings table if needed
DROP TABLE IF EXISTS payment_settings;

-- Step 2: Recreate payment_settings table with all required columns
CREATE TABLE IF NOT EXISTS payment_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    setting_key VARCHAR(255) UNIQUE NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'string' CHECK (setting_type IN ('string', 'number', 'boolean', 'json')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 4: Insert default payment settings with the correct columns
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
('emailjs_service_id', '', 'string', 'EmailJS Service ID'),
('emailjs_template_id', '', 'string', 'EmailJS Template ID'),
('emailjs_public_key', '', 'string', 'EmailJS Public Key'),
('gmail_user', '', 'string', 'Gmail SMTP username'),
('gmail_password', '', 'string', 'Gmail SMTP app password'),
('smtp_host', 'smtp.gmail.com', 'string', 'SMTP server host'),
('smtp_port', '587', 'number', 'SMTP server port')
ON CONFLICT (setting_key) DO UPDATE SET
    setting_value = EXCLUDED.setting_value,
    setting_type = EXCLUDED.setting_type,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Step 5: Create index for better performance
CREATE INDEX IF NOT EXISTS idx_payment_settings_key ON payment_settings(setting_key);

-- Step 6: Enable Row Level Security
ALTER TABLE payment_settings ENABLE ROW LEVEL SECURITY;

-- Step 7: Create policy for service role access
CREATE POLICY "Service role can access payment_settings" ON payment_settings 
FOR ALL USING (auth.role() = 'service_role');

-- Step 8: Grant permissions
GRANT ALL ON payment_settings TO service_role;

-- Step 9: Create updated_at trigger
CREATE TRIGGER update_payment_settings_updated_at 
BEFORE UPDATE ON payment_settings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 10: Verify the data was inserted correctly
SELECT setting_key, setting_value, setting_type, description FROM payment_settings ORDER BY setting_key;

-- Success message
SELECT 'payment_settings table has been successfully created and populated!' as status;

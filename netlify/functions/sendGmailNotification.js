// netlify/functions/sendGmailNotification.js - Send Gmail notifications for transactions

const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

// Configuration
const CONFIG = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
};

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ success: false, message: 'Method not allowed' })
        };
    }

    try {
        const { email, paymentId, transactionType = 'payment_success' } = JSON.parse(event.body);
        
        // Validate required fields
        if (!email || !paymentId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Email and payment ID are required' 
                })
            };
        }

        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        // Get payment details
        const { data: payment, error: paymentError } = await supabase
            .from('payments_new')
            .select('*')
            .eq('id', paymentId)
            .single();

        if (paymentError || !payment) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Payment not found' 
                })
            };
        }

        // Get Gmail SMTP settings from database
        const { data: smtpSettings } = await supabase
            .from('payment_settings')
            .select('setting_key, setting_value')
            .in('setting_key', ['gmail_smtp_user', 'gmail_smtp_pass', 'gmail_smtp_host', 'gmail_smtp_port', 'site_password'])
            .then(result => result);

        const settingsMap = {};
        smtpSettings?.forEach(setting => {
            settingsMap[setting.setting_key] = setting.setting_value;
        });

        // Default SMTP settings
        const smtpConfig = {
            host: settingsMap.gmail_smtp_host || 'smtp.gmail.com',
            port: parseInt(settingsMap.gmail_smtp_port) || 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: settingsMap.gmail_smtp_user || process.env.GMAIL_USER,
                pass: settingsMap.gmail_smtp_pass || process.env.GMAIL_APP_PASSWORD
            }
        };

        // Create transporter
        const transporter = nodemailer.createTransporter(smtpConfig);

        // Generate email content based on transaction type
        let subject, htmlContent, textContent;

        if (transactionType === 'payment_success') {
            subject = '🎉 Payment Successful - LMS AI Assistant Access Granted';
            
            htmlContent = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px; text-align: center;">
                        <h1 style="margin: 0; font-size: 28px;">🎉 Payment Successful!</h1>
                        <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Welcome to LMS AI Assistant</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <h2 style="color: #333; margin-top: 0;">Transaction Details</h2>
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Email:</strong> ${payment.email}</p>
                            <p style="margin: 5px 0;"><strong>Amount:</strong> $${payment.amount} ${payment.currency}</p>
                            <p style="margin: 5px 0;"><strong>Payment Method:</strong> ${payment.payment_method}</p>
                            <p style="margin: 5px 0;"><strong>Transaction ID:</strong> ${payment.paypal_transaction_id || payment.id}</p>
                            <p style="margin: 5px 0;"><strong>Date:</strong> ${new Date(payment.created_at).toLocaleDateString()}</p>
                        </div>
                        
                        <h3 style="color: #333;">🔐 Access Information</h3>
                        <div style="background: #e8f5e8; border: 1px solid #4caf50; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Site Password:</strong> <code style="background: #fff; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${settingsMap.site_password || 'Contact admin for password'}</code></p>
                            <p style="margin: 5px 0; font-size: 14px; color: #666;">Use this password to download your LMS AI Assistant script.</p>
                        </div>
                        
                        <h3 style="color: #333;">📥 Next Steps</h3>
                        <ol style="color: #555; line-height: 1.6;">
                            <li>Visit our download page: <a href="${process.env.URL || 'https://your-site.netlify.app'}" style="color: #667eea;">LMS AI Assistant</a></li>
                            <li>Enter your email address: <strong>${payment.email}</strong></li>
                            <li>Enter the site password provided above</li>
                            <li>Download and install the script following the instructions</li>
                            <li>Your device will be automatically approved after payment verification</li>
                        </ol>
                        
                        <div style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 0; color: #856404;"><strong>⚠️ Important:</strong> Keep this email safe as it contains your access credentials. If you lose your password, contact our support team.</p>
                        </div>
                        
                        <h3 style="color: #333;">🚀 What You Get</h3>
                        <ul style="color: #555; line-height: 1.6;">
                            <li>🤖 AI-powered chat assistant for your LMS</li>
                            <li>📄 Intelligent content summarization</li>
                            <li>✨ Smart content analysis and highlighting</li>
                            <li>📝 Automatic note-taking and study guides</li>
                            <li>📅 Schedule and deadline integration</li>
                            <li>🌐 Multi-language translation support</li>
                            <li>📊 Learning analytics and insights</li>
                        </ul>
                    </div>
                    
                    <div style="text-align: center; margin-top: 30px; color: #666; font-size: 14px;">
                        <p>Thank you for choosing LMS AI Assistant!</p>
                        <p>Need help? Contact us at <a href="mailto:${smtpConfig.auth.user}" style="color: #667eea;">${smtpConfig.auth.user}</a></p>
                    </div>
                </div>
            `;
            
            textContent = `
🎉 Payment Successful - LMS AI Assistant Access Granted

Transaction Details:
- Email: ${payment.email}
- Amount: $${payment.amount} ${payment.currency}
- Payment Method: ${payment.payment_method}
- Transaction ID: ${payment.paypal_transaction_id || payment.id}
- Date: ${new Date(payment.created_at).toLocaleDateString()}

🔐 Access Information:
Site Password: ${settingsMap.site_password || 'Contact admin for password'}

📥 Next Steps:
1. Visit our download page: ${process.env.URL || 'https://your-site.netlify.app'}
2. Enter your email address: ${payment.email}
3. Enter the site password provided above
4. Download and install the script following the instructions
5. Your device will be automatically approved after payment verification

Thank you for choosing LMS AI Assistant!
Need help? Contact us at ${smtpConfig.auth.user}
            `;
        }

        // Send email
        const mailOptions = {
            from: `"LMS AI Assistant" <${smtpConfig.auth.user}>`,
            to: email,
            subject: subject,
            text: textContent,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);

        // Log the email notification
        await supabase.from('notification_logs_new').insert({
            notification_type: 'gmail_payment_success',
            recipient_email: email,
            subject: subject,
            message: textContent,
            payment_id: paymentId,
            status: 'sent',
            email_message_id: info.messageId
        });

        // Log the notification
        await supabase.from('logs_new').insert({
            log_type: 'notification',
            level: 'info',
            message: 'Gmail notification sent for payment success',
            details: { 
                email,
                payment_id: paymentId,
                transaction_type: transactionType,
                message_id: info.messageId
            },
            user_email: email,
            ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
            user_agent: event.headers['user-agent']
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Gmail notification sent successfully',
                messageId: info.messageId
            })
        };

    } catch (error) {
        console.error('Gmail notification error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Failed to send Gmail notification: ' + error.message 
            })
        };
    }
};

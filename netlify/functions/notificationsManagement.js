// netlify/functions/notificationsManagement.js - Notifications management with Supabase integration

const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const CONFIG = {
    JWT_SECRET: process.env.JWT_SECRET || 'V+3stApVGE9zLpJFf79RA4SAc/w2vqJygx5wQ2hW/OlGLN/rhEPFHV1tRR+zcO2APsrvMwy+IO6IgN7+jSghTw==',
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    EMAILJS_SERVICE_ID: process.env.EMAILJS_SERVICE_ID,
    EMAILJS_TEMPLATE_ID: process.env.EMAILJS_TEMPLATE_ID,
    EMAILJS_USER_ID: process.env.EMAILJS_USER_ID
};

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
        const { action, token, ...params } = JSON.parse(event.body);

        // Verify admin token
        const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
        if (!decoded || decoded.role !== 'admin') {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, message: 'Unauthorized' })
            };
        }

        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        switch (action) {
            case 'getNotificationSettings':
                return await getNotificationSettings(supabase);
            
            case 'updateNotificationSettings':
                return await updateNotificationSettings(supabase, params);
            
            case 'sendTestNotification':
                return await sendTestNotification(supabase, params);
            
            case 'getNotificationHistory':
                return await getNotificationHistory(supabase, params);
            
            case 'sendBulkNotification':
                return await sendBulkNotification(supabase, params);
            
            default:
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, message: 'Invalid action' })
                };
        }

    } catch (error) {
        console.error('Notifications management error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Server error: ' + error.message 
            })
        };
    }
};

// Get notification settings from database
async function getNotificationSettings(supabase) {
    try {
        const { data: settings, error } = await supabase
            .from('admin_settings')
            .select('setting_key, setting_value')
            .in('setting_key', [
                'email_notifications_enabled',
                'notification_email',
                'emailjs_service_id',
                'emailjs_template_id',
                'emailjs_user_id',
                'device_approval_notifications',
                'security_alert_notifications',
                'system_maintenance_notifications'
            ]);

        if (error) {
            console.error('Error fetching notification settings:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Failed to fetch notification settings' 
                })
            };
        }

        // Convert array to object for easier frontend consumption
        const settingsObj = {};
        settings.forEach(setting => {
            settingsObj[setting.setting_key] = setting.setting_value;
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                settings: settingsObj
            })
        };

    } catch (error) {
        console.error('Error getting notification settings:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Failed to get notification settings' 
            })
        };
    }
}

// Update notification settings in database
async function updateNotificationSettings(supabase, params) {
    try {
        const { settings } = params;

        if (!settings || typeof settings !== 'object') {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Invalid settings data' 
                })
            };
        }

        // Update each setting in the database
        const updatePromises = Object.entries(settings).map(([key, value]) => {
            return supabase
                .from('admin_settings')
                .upsert({
                    setting_key: key,
                    setting_value: value,
                    setting_type: typeof value,
                    description: getSettingDescription(key),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'setting_key' });
        });

        const results = await Promise.all(updatePromises);
        
        // Check for errors
        const errors = results.filter(result => result.error);
        if (errors.length > 0) {
            console.error('Error updating notification settings:', errors);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Failed to update some notification settings' 
                })
            };
        }

        // Log the settings update
        await supabase.from('logs').insert({
            log_type: 'admin',
            level: 'info',
            message: 'Notification settings updated',
            details: { 
                action: 'notification_settings_updated',
                updatedSettings: Object.keys(settings)
            }
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                message: 'Notification settings updated successfully' 
            })
        };

    } catch (error) {
        console.error('Error updating notification settings:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Failed to update notification settings' 
            })
        };
    }
}

// Send test notification
async function sendTestNotification(supabase, params) {
    try {
        const { email, message = 'This is a test notification from KCG-LMS Admin Panel.' } = params;

        if (!email) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Email address is required' 
                })
            };
        }

        // Get EmailJS settings from database
        const { data: emailSettings } = await supabase
            .from('admin_settings')
            .select('setting_key, setting_value')
            .in('setting_key', ['emailjs_service_id', 'emailjs_template_id', 'emailjs_user_id']);

        const emailConfig = {};
        emailSettings.forEach(setting => {
            emailConfig[setting.setting_key] = setting.setting_value;
        });

        // Simulate sending email (in production, integrate with actual email service)
        const emailSent = await simulateEmailSend({
            to: email,
            subject: 'KCG-LMS Test Notification',
            message: message,
            config: emailConfig
        });

        if (!emailSent.success) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Failed to send test notification: ' + emailSent.error 
                })
            };
        }

        // Log the test notification
        await supabase.from('logs').insert({
            log_type: 'admin',
            level: 'info',
            message: 'Test notification sent',
            details: { 
                action: 'test_notification_sent',
                recipient: email,
                message: message
            }
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                message: 'Test notification sent successfully' 
            })
        };

    } catch (error) {
        console.error('Error sending test notification:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Failed to send test notification' 
            })
        };
    }
}

// Get notification history
async function getNotificationHistory(supabase, params) {
    try {
        const { limit = 50, offset = 0 } = params;

        const { data: notifications, error } = await supabase
            .from('logs')
            .select('*')
            .eq('log_type', 'notification')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            console.error('Error fetching notification history:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Failed to fetch notification history' 
                })
            };
        }

        // Get total count
        const { count: totalCount } = await supabase
            .from('logs')
            .select('*', { count: 'exact', head: true })
            .eq('log_type', 'notification');

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                notifications: notifications || [],
                pagination: {
                    total: totalCount || 0,
                    limit,
                    offset,
                    hasMore: (offset + limit) < (totalCount || 0)
                }
            })
        };

    } catch (error) {
        console.error('Error getting notification history:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Failed to get notification history' 
            })
        };
    }
}

// Send bulk notification to multiple recipients
async function sendBulkNotification(supabase, params) {
    try {
        const { recipients, subject, message, notificationType = 'bulk' } = params;

        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Recipients array is required' 
                })
            };
        }

        if (!subject || !message) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Subject and message are required' 
                })
            };
        }

        // Get EmailJS settings
        const { data: emailSettings } = await supabase
            .from('admin_settings')
            .select('setting_key, setting_value')
            .in('setting_key', ['emailjs_service_id', 'emailjs_template_id', 'emailjs_user_id']);

        const emailConfig = {};
        emailSettings.forEach(setting => {
            emailConfig[setting.setting_key] = setting.setting_value;
        });

        // Send notifications to all recipients
        const sendPromises = recipients.map(async (recipient) => {
            return await simulateEmailSend({
                to: recipient,
                subject: subject,
                message: message,
                config: emailConfig
            });
        });

        const results = await Promise.all(sendPromises);
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.length - successCount;

        // Log the bulk notification
        await supabase.from('logs').insert({
            log_type: 'notification',
            level: 'info',
            message: `Bulk notification sent to ${recipients.length} recipients`,
            details: { 
                action: 'bulk_notification_sent',
                notificationType,
                recipientCount: recipients.length,
                successCount,
                failureCount,
                subject,
                message
            }
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                message: `Bulk notification sent. ${successCount} successful, ${failureCount} failed.`,
                results: {
                    total: recipients.length,
                    successful: successCount,
                    failed: failureCount
                }
            })
        };

    } catch (error) {
        console.error('Error sending bulk notification:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Failed to send bulk notification' 
            })
        };
    }
}

// Helper function to get setting description
function getSettingDescription(key) {
    const descriptions = {
        'email_notifications_enabled': 'Enable/disable email notifications',
        'notification_email': 'Default email address for notifications',
        'emailjs_service_id': 'EmailJS service ID for sending emails',
        'emailjs_template_id': 'EmailJS template ID for email formatting',
        'emailjs_user_id': 'EmailJS user ID for authentication',
        'device_approval_notifications': 'Send notifications when devices need approval',
        'security_alert_notifications': 'Send notifications for security alerts',
        'system_maintenance_notifications': 'Send notifications for system maintenance'
    };
    return descriptions[key] || 'Notification setting';
}

// Simulate email sending (replace with actual email service integration)
async function simulateEmailSend({ to, subject, message, config }) {
    try {
        // In production, integrate with actual email service like EmailJS, SendGrid, etc.
        console.log('Simulating email send:', { to, subject, message, config });
        
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Simulate success/failure based on email format
        if (!to.includes('@')) {
            return { success: false, error: 'Invalid email format' };
        }
        
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// netlify/functions/managePaymentSettings.js - Manage payment and notification settings

const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

// Configuration
const CONFIG = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    JWT_SECRET: process.env.JWT_SECRET || 'V+3stApVGE9zLpJFf79RA4SAc/w2vqJygx5wQ2hW/OlGLN/rhEPFHV1tRR+zcO2APsrvMwy+IO6IgN7+jSghTw=='
};

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

// Verify admin session
async function verifyAdminSession(token) {
    if (!token) {
        return { valid: false, error: 'No token provided' };
    }

    try {
        const payload = jwt.verify(token, CONFIG.JWT_SECRET);
        
        if (!payload || payload.role !== 'admin') {
            return { valid: false, error: 'Invalid or expired session' };
        }

        return { valid: true, payload };
    } catch (error) {
        console.error('JWT verification error:', error.message);
        return { valid: false, error: 'Invalid or expired session' };
    }
}

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
        const { action, token, ...actionData } = JSON.parse(event.body);

        // Verify admin session
        const sessionCheck = await verifyAdminSession(token);
        if (!sessionCheck.valid) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: sessionCheck.error 
                })
            };
        }

        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        switch (action) {
            case 'getSettings':
                const { data: settings, error: settingsError } = await supabase
                    .from('payment_settings')
                    .select('setting_key, setting_value');

                if (settingsError) {
                    console.error('Error fetching settings:', settingsError);
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Error fetching settings: ' + settingsError.message
                        })
                    };
                }

                // Convert array to object
                const settingsMap = {};
                settings?.forEach(setting => {
                    settingsMap[setting.setting_key] = setting.setting_value;
                });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        settings: settingsMap
                    })
                };

            case 'updateSettings':
                const { settings: newSettings } = actionData;
                
                // Update each setting
                const updatePromises = Object.entries(newSettings).map(([key, value]) => {
                    return supabase
                        .from('payment_settings')
                        .upsert({
                            setting_key: key,
                            setting_value: value,
                            updated_at: new Date().toISOString()
                        }, {
                            onConflict: 'setting_key'
                        });
                });

                const results = await Promise.all(updatePromises);
                
                // Check for errors
                const errors = results.filter(result => result.error);
                if (errors.length > 0) {
                    console.error('Error updating settings:', errors);
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Error updating some settings'
                        })
                    };
                }

                // Log the settings update
                await supabase.from('logs').insert({
                    log_type: 'admin',
                    level: 'info',
                    message: 'Payment settings updated',
                    details: { 
                        updated_settings: Object.keys(newSettings),
                        admin_user: sessionCheck.payload.username
                    },
                    ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
                    user_agent: event.headers['user-agent']
                });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Settings updated successfully'
                    })
                };

            case 'getPayments':
                const { data: payments, error: paymentsError } = await supabase
                    .from('payments')
                    .select(`
                        id,
                        username,
                        email,
                        amount,
                        currency,
                        payment_method,
                        payment_status,
                        subscription_type,
                        payment_proof_url,
                        created_at,
                        updated_at
                    `)
                    .order('created_at', { ascending: false })
                    .limit(100);

                if (paymentsError) {
                    console.error('Error fetching payments:', paymentsError);
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Error fetching payments: ' + paymentsError.message
                        })
                    };
                }

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        payments: payments || []
                    })
                };

            case 'getNotifications':
                const { data: notifications, error: notificationsError } = await supabase
                    .from('notification_logs')
                    .select(`
                        id,
                        notification_type,
                        recipient_email,
                        subject,
                        status,
                        created_at,
                        sent_at
                    `)
                    .order('created_at', { ascending: false })
                    .limit(100);

                if (notificationsError) {
                    console.error('Error fetching notifications:', notificationsError);
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Error fetching notifications: ' + notificationsError.message
                        })
                    };
                }

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        notifications: notifications || []
                    })
                };

            case 'approvePayment':
                const { paymentId } = actionData;
                
                // Update payment status
                const { data: approvedPayment, error: approveError } = await supabase
                    .from('payments')
                    .update({
                        payment_status: 'completed',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', paymentId)
                    .select()
                    .single();

                if (approveError || !approvedPayment) {
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Error approving payment: ' + (approveError?.message || 'Payment not found')
                        })
                    };
                }

                // Update associated device
                await supabase
                    .from('devices')
                    .update({
                        payment_status: 'paid',
                        status: 'active'
                    })
                    .eq('hwid', approvedPayment.device_hwid);

                // Log the approval
                await supabase.from('logs').insert({
                    log_type: 'admin',
                    level: 'info',
                    message: 'Payment manually approved',
                    details: { 
                        payment_id: paymentId,
                        username: approvedPayment.username,
                        amount: approvedPayment.amount,
                        admin_user: sessionCheck.payload.username
                    },
                    ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
                    user_agent: event.headers['user-agent']
                });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Payment approved successfully'
                    })
                };

            case 'updateAlternativePayments':
                const { altPayments } = actionData;
                
                // Save alternative payment methods as settings
                const altPaymentPromises = Object.entries(altPayments).map(([key, value]) => {
                    return supabase
                        .from('payment_settings')
                        .upsert({
                            setting_key: `alt_payment_${key}`,
                            setting_value: value,
                            updated_at: new Date().toISOString()
                        }, {
                            onConflict: 'setting_key'
                        });
                });

                const altPaymentResults = await Promise.all(altPaymentPromises);
                const altPaymentErrors = altPaymentResults.filter(result => result.error);

                if (altPaymentErrors.length > 0) {
                    console.error('Error updating alternative payments:', altPaymentErrors);
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Error updating alternative payment methods'
                        })
                    };
                }

                // Log the update
                await supabase.from('logs').insert({
                    log_type: 'admin',
                    level: 'info',
                    message: 'Alternative payment methods updated',
                    details: { 
                        updated_methods: Object.keys(altPayments).filter(key => altPayments[key]),
                        admin_user: sessionCheck.payload.username
                    },
                    ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
                    user_agent: event.headers['user-agent']
                });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Alternative payment methods saved successfully'
                    })
                };

            case 'testNotification':
                const { email, type } = actionData;
                
                // Create test notification log
                await supabase.from('notification_logs').insert({
                    notification_type: 'test',
                    recipient_email: email,
                    subject: 'Test Notification from LMS AI Assistant',
                    message: `This is a test notification sent at ${new Date().toISOString()}`,
                    status: 'sent'
                });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Test notification logged successfully'
                    })
                };

            default:
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        message: 'Invalid action'
                    })
                };
        }

    } catch (error) {
        console.error('Error in managePaymentSettings:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                message: 'Internal server error: ' + error.message
            })
        };
    }
};

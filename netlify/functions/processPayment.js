// netlify/functions/processPayment.js - PayPal payment processing and validation

const { createClient } = require('@supabase/supabase-js');

// Configuration
const CONFIG = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
    PAYPAL_ENVIRONMENT: process.env.PAYPAL_ENVIRONMENT || 'sandbox' // sandbox or live
};

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

// Get PayPal access token with custom credentials
async function getPayPalAccessToken(clientId = null, clientSecret = null, environment = null, supabase = null) {
    let paypalClientId = clientId;
    let paypalClientSecret = clientSecret;
    let paypalEnvironment = environment;
    
    // If credentials not provided, get from database
    if (!paypalClientId || !paypalClientSecret) {
        if (!supabase) {
            throw new Error('Supabase client required to fetch PayPal credentials');
        }
        
        try {
            const { data: settings, error: settingsError } = await supabase
                .from('payment_settings')
                .select('setting_key, setting_value')
                .in('setting_key', ['paypal_client_id', 'paypal_client_secret', 'paypal_environment']);
            
            if (settingsError) {
                console.error('Error fetching PayPal settings:', settingsError);
                // Fallback to environment variables if database fails
                paypalClientId = paypalClientId || process.env.PAYPAL_CLIENT_ID;
                paypalClientSecret = paypalClientSecret || process.env.PAYPAL_CLIENT_SECRET;
                paypalEnvironment = paypalEnvironment || process.env.PAYPAL_ENVIRONMENT || 'sandbox';
            } else {
                const settingsMap = {};
                settings?.forEach(setting => {
                    settingsMap[setting.setting_key] = setting.setting_value;
                });
                
                paypalClientId = paypalClientId || settingsMap.paypal_client_id || process.env.PAYPAL_CLIENT_ID;
                paypalClientSecret = paypalClientSecret || settingsMap.paypal_client_secret || process.env.PAYPAL_CLIENT_SECRET;
                paypalEnvironment = paypalEnvironment || settingsMap.paypal_environment || process.env.PAYPAL_ENVIRONMENT || 'sandbox';
            }
        } catch (dbError) {
            console.error('Database error fetching PayPal settings:', dbError);
            // Fallback to environment variables
            paypalClientId = paypalClientId || process.env.PAYPAL_CLIENT_ID;
            paypalClientSecret = paypalClientSecret || process.env.PAYPAL_CLIENT_SECRET;
            paypalEnvironment = paypalEnvironment || process.env.PAYPAL_ENVIRONMENT || 'sandbox';
        }
    }
    
    if (!paypalClientId || !paypalClientSecret) {
        throw new Error('PayPal credentials not configured. Please set up PayPal in admin panel.');
    }
    
    const baseURL = paypalEnvironment === 'live' 
        ? 'https://api.paypal.com' 
        : 'https://api.sandbox.paypal.com';
    
    const response = await fetch(`${baseURL}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Accept-Language': 'en_US',
            'Authorization': `Basic ${Buffer.from(`${paypalClientId}:${paypalClientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });
    
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error_description || data.error || 'Failed to get access token');
    }
    
    return data.access_token;
}

// Verify PayPal payment
async function verifyPayPalPayment(paymentId, accessToken, environment = 'sandbox') {
    const baseURL = environment === 'live' 
        ? 'https://api.paypal.com' 
        : 'https://api.sandbox.paypal.com';
    
    const response = await fetch(`${baseURL}/v2/checkout/orders/${paymentId}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });
    
    return await response.json();
}

// Get current pricing based on date
async function getCurrentPricing(supabase) {
    const { data: settings } = await supabase
        .from('payment_settings')
        .select('setting_key, setting_value')
        .in('setting_key', ['discount_price', 'lifetime_price', 'discount_end_date']);
    
    const settingsMap = {};
    settings?.forEach(setting => {
        settingsMap[setting.setting_key] = setting.setting_value;
    });
    
    const discountEndDate = new Date(settingsMap.discount_end_date || '2025-08-31');
    const currentDate = new Date();
    
    const isDiscountPeriod = currentDate <= discountEndDate;
    const price = isDiscountPeriod 
        ? parseFloat(settingsMap.discount_price || '36.00')
        : parseFloat(settingsMap.lifetime_price || '68.00');
    
    return {
        price,
        isDiscountPeriod,
        subscriptionType: isDiscountPeriod ? 'discount' : 'lifetime'
    };
}

// Send notification email
async function sendNotificationEmail(supabase, type, data) {
    // Log notification for admin to see
    await supabase.from('notification_logs').insert({
        notification_type: type,
        recipient_email: data.email,
        subject: data.subject,
        message: data.message,
        payment_id: data.payment_id,
        device_id: data.device_id,
        status: 'pending'
    });
    
    // In a real implementation, you would integrate with an email service like SendGrid, Mailgun, etc.
    console.log(`Notification logged: ${type} for ${data.email}`);
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
        const { action, ...actionData } = JSON.parse(event.body);
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        switch (action) {
            case 'getPricing':
                const pricing = await getCurrentPricing(supabase);
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        ...pricing
                    })
                };

            case 'createPayment':
                const { email, deviceHwid } = actionData;
                
                // Check if user is admin (free access)
                let adminEmails = ['manojsedain40@gmail.com']; // Default admin email
                
                try {
                    const { data: adminSettings, error: adminError } = await supabase
                        .from('payment_settings')
                        .select('setting_value')
                        .eq('setting_key', 'admin_emails')
                        .single();
                    
                    if (!adminError && adminSettings?.setting_value) {
                        adminEmails = adminSettings.setting_value.split(',').map(e => e.trim());
                    }
                } catch (error) {
                    console.error('Error fetching admin emails, using default:', error);
                }
                
                if (adminEmails.includes(email)) {
                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({
                            success: true,
                            isAdmin: true,
                            message: 'Admin user - free access granted'
                        })
                    };
                }
                
                // Get current pricing
                const currentPricing = await getCurrentPricing(supabase);
                
                // Create PayPal payment
                const accessToken = await getPayPalAccessToken(null, null, null, supabase);
                
                // Get PayPal environment from database
                let paypalEnvironment = 'sandbox'; // Default to sandbox
                
                try {
                    const { data: envSetting, error: envError } = await supabase
                        .from('payment_settings')
                        .select('setting_value')
                        .eq('setting_key', 'paypal_environment')
                        .single();
                    
                    if (!envError && envSetting?.setting_value) {
                        paypalEnvironment = envSetting.setting_value;
                    }
                } catch (error) {
                    console.error('Error fetching PayPal environment, using sandbox:', error);
                }
                const baseURL = paypalEnvironment === 'live' 
                    ? 'https://api.paypal.com' 
                    : 'https://api.sandbox.paypal.com';
                
                const paymentData = {
                    intent: 'CAPTURE',
                    purchase_units: [{
                        amount: {
                            currency_code: 'USD',
                            value: currentPricing.price.toFixed(2)
                        },
                        description: `LMS AI Assistant - ${currentPricing.subscriptionType === 'discount' ? 'Discount' : 'Lifetime'} License`,
                        custom_id: `${email}_${deviceHwid}_${Date.now()}`
                    }],
                    application_context: {
                        return_url: `${event.headers.origin || 'https://wrongnumber.netlify.app'}/payment-success`,
                        cancel_url: `${event.headers.origin || 'https://wrongnumber.netlify.app'}/payment-cancel`
                    }
                };
                
                const paymentResponse = await fetch(`${baseURL}/v2/checkout/orders`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(paymentData)
                });
                
                const paymentResult = await paymentResponse.json();
                
                if (paymentResult.id) {
                    // Store payment record
                    await supabase.from('payments').insert({
                        email,
                        amount: currentPricing.price,
                        paypal_payment_id: paymentResult.id,
                        payment_status: 'pending',
                        subscription_type: currentPricing.subscriptionType,
                        device_hwid: deviceHwid
                    });
                    
                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({
                            success: true,
                            paymentId: paymentResult.id,
                            approvalUrl: paymentResult.links.find(link => link.rel === 'approve')?.href,
                            amount: currentPricing.price,
                            subscriptionType: currentPricing.subscriptionType
                        })
                    };
                } else {
                    throw new Error('Failed to create PayPal payment: ' + JSON.stringify(paymentResult));
                }

            case 'verifyPayment':
                const { paymentId, payerId } = actionData;
                
                // Get access token and verify payment
                const verifyAccessToken = await getPayPalAccessToken(null, null, null, supabase);
                
                // Get PayPal environment for verification
                const { data: verifyEnvSetting } = await supabase
                    .from('payment_settings')
                    .select('setting_value')
                    .eq('setting_key', 'paypal_environment')
                    .single();
                
                const verifyEnvironment = verifyEnvSetting?.setting_value || 'sandbox';
                const paymentDetails = await verifyPayPalPayment(paymentId, verifyAccessToken, verifyEnvironment);
                
                if (paymentDetails.status === 'APPROVED' || paymentDetails.status === 'COMPLETED') {
                    // Update payment record
                    const { data: payment, error: paymentError } = await supabase
                        .from('payments')
                        .update({
                            payment_status: 'completed',
                            paypal_transaction_id: paymentDetails.purchase_units?.[0]?.payments?.captures?.[0]?.id,
                            updated_at: new Date().toISOString()
                        })
                        .eq('paypal_payment_id', paymentId)
                        .select()
                        .single();
                    
                    if (payment) {
                        // Update device payment status
                        await supabase
                            .from('devices_new')
                            .update({
                                payment_id: payment.id,
                                payment_status: 'paid',
                                status: 'active' // Auto-approve paid devices
                            })
                            .eq('hwid', payment.device_hwid);
                        
                        // Send Gmail notification to buyer
                        try {
                            await fetch(`${process.env.URL || 'https://your-site.netlify.app'}/.netlify/functions/sendGmailNotification`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    email: payment.email,
                                    paymentId: payment.id,
                                    transactionType: 'payment_success'
                                })
                            });
                        } catch (gmailError) {
                            console.error('Failed to send Gmail notification:', gmailError);
                        }
                        
                        // Send notification to developer
                        const { data: devEmail } = await supabase
                            .from('payment_settings')
                            .select('setting_value')
                            .eq('setting_key', 'developer_email')
                            .single();
                        
                        if (devEmail?.setting_value) {
                            await sendNotificationEmail(supabase, 'payment_success', {
                                email: devEmail.setting_value,
                                subject: 'New Payment Received - Device Approved',
                                message: `Payment received from ${payment.email} for $${payment.amount}. Device has been automatically approved for access.`,
                                payment_id: payment.id
                            });
                        }
                        
                        return {
                            statusCode: 200,
                            headers,
                            body: JSON.stringify({
                                success: true,
                                message: 'Payment verified and device approved',
                                paymentStatus: 'completed'
                            })
                        };
                    }
                }
                
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        message: 'Payment verification failed'
                    })
                };

            case 'testConnection':
                const { clientId, clientSecret, environment } = actionData;
                
                if (!clientId || !clientSecret) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Client ID and Client Secret are required'
                        })
                    };
                }
                
                try {
                    // Test the PayPal connection
                    const testAccessToken = await getPayPalAccessToken(clientId, clientSecret, environment);
                    
                    if (testAccessToken) {
                        return {
                            statusCode: 200,
                            headers,
                            body: JSON.stringify({
                                success: true,
                                message: `PayPal connection successful (${environment} environment)`,
                                environment: environment,
                                connected: true
                            })
                        };
                    } else {
                        return {
                            statusCode: 400,
                            headers,
                            body: JSON.stringify({
                                success: false,
                                message: 'Failed to obtain access token',
                                connected: false
                            })
                        };
                    }
                } catch (error) {
                    console.error('PayPal connection test error:', error);
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'PayPal connection failed: ' + error.message,
                            connected: false
                        })
                    };
                }

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
        console.error('Payment processing error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                message: 'Payment processing error: ' + error.message
            })
        };
    }
};

// netlify/functions/registerDevice.js - Register new device and create approval request

const { createClient } = require('@supabase/supabase-js');

// Configuration
const CONFIG = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
};

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'false',
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
        // Log request details for debugging
        console.log('Register device request:', {
            method: event.httpMethod,
            contentLength: event.body ? event.body.length : 0,
            headers: event.headers,
            bodyPreview: event.body ? event.body.substring(0, 200) + '...' : 'No body'
        });
        
        // Validate request body exists and is not too large
        if (!event.body) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Request body is required' 
                })
            };
        }
        
        if (event.body.length > 10000) { // 10KB limit
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Request body too large' 
                })
            };
        }
        
        let requestData;
        try {
            requestData = JSON.parse(event.body);
        } catch (parseError) {
            console.error('JSON parse error:', parseError);
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Invalid JSON in request body' 
                })
            };
        }
        
        const { username, hwid, fingerprint, deviceName, browserInfo, osInfo } = requestData;
        
        console.log('Parsed request data:', {
            username: username ? username.substring(0, 20) + '...' : 'missing',
            hwid: hwid ? hwid.substring(0, 20) + '...' : 'missing',
            fingerprint: fingerprint ? fingerprint.substring(0, 20) + '...' : 'missing',
            deviceName: deviceName || 'not provided',
            browserInfo: browserInfo ? browserInfo.substring(0, 50) + '...' : 'not provided',
            osInfo: osInfo || 'not provided'
        });

        // Validate required fields
        if (!username || !hwid || !fingerprint) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Username, HWID, and fingerprint are required' 
                })
            };
        }
        
        // Validate field lengths to prevent database errors
        if (username.length > 50) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Username too long (max 50 characters)' 
                })
            };
        }
        
        if (hwid.length > 255) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'HWID too long (max 255 characters)' 
                })
            };
        }

        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        // Check if device already exists
        const { data: existingDevice, error: checkError } = await supabase
            .from('devices')
            .select('*')
            .eq('hwid', hwid)
            .eq('fingerprint', fingerprint)
            .single();

        if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
            console.error('Error checking existing device:', checkError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Database error checking device' 
                })
            };
        }

        // If device exists, return its current status
        if (existingDevice) {
            // Update last_used timestamp
            await supabase
                .from('devices')
                .update({ 
                    last_used: new Date().toISOString(),
                    usage_count: existingDevice.usage_count + 1
                })
                .eq('id', existingDevice.id);

            // Log device access attempt
            await supabase.from('logs').insert({
                log_type: 'device',
                level: 'info',
                message: 'Existing device access attempt',
                details: { 
                    username,
                    deviceName,
                    status: existingDevice.status,
                    device_id: existingDevice.id
                },
                user_id: existingDevice.user_id,
                device_id: existingDevice.id,
                ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
                user_agent: event.headers['user-agent']
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true, 
                    message: 'Device already registered',
                    status: existingDevice.status,
                    deviceId: existingDevice.id
                })
            };
        }

        // Create or get user
        let userId = null;
        const { data: existingUser, error: userCheckError } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .single();

        if (userCheckError && userCheckError.code !== 'PGRST116') {
            console.error('Error checking user:', userCheckError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Database error checking user' 
                })
            };
        }

        if (existingUser) {
            userId = existingUser.id;
        } else {
            // Create new user
            const { data: newUser, error: userCreateError } = await supabase
                .from('users')
                .insert({ username })
                .select('id')
                .single();

            if (userCreateError) {
                console.error('Error creating user:', userCreateError);
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        message: 'Failed to create user' 
                    })
                };
            }

            userId = newUser.id;
        }

        // Generate AES key for device
        let aesKeyData;
        try {
            const { data, error: aesError } = await supabase
                .rpc('generate_aes_key');
            
            if (aesError) {
                console.error('Error generating AES key:', aesError);
                // Fallback to generating key in Node.js
                const crypto = require('crypto');
                aesKeyData = crypto.randomBytes(32).toString('base64');
            } else {
                aesKeyData = data;
            }
        } catch (error) {
            console.error('AES key generation failed:', error);
            // Fallback to generating key in Node.js
            const crypto = require('crypto');
            aesKeyData = crypto.randomBytes(32).toString('base64');
        }

        // Check auto-approval setting
        const { data: autoApproveData, error: settingError } = await supabase
            .from('admin_settings')
            .select('setting_value')
            .eq('setting_key', 'auto_approve_devices')
            .single();

        const autoApprove = settingError ? false : autoApproveData.setting_value === 'true';
        const deviceStatus = autoApprove ? 'active' : 'pending';

        // Create new device
        const { data: newDevice, error: deviceError } = await supabase
            .from('devices')
            .insert({
                user_id: userId,
                username,
                hwid,
                fingerprint,
                device_name: deviceName || 'Unknown Device',
                browser_info: browserInfo || event.headers['user-agent'] || 'Unknown Browser',
                os_info: osInfo || 'Unknown OS',
                status: deviceStatus,
                aes_key: aesKeyData,
                approved_at: autoApprove ? new Date().toISOString() : null,
                approved_by: autoApprove ? 'system' : null
            })
            .select('id')
            .single();

        if (deviceError) {
            console.error('Error creating device:', deviceError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Failed to register device' 
                })
            };
        }

        // Create device approval request if not auto-approved
        if (!autoApprove) {
            await supabase.from('device_requests').insert({
                device_id: newDevice.id,
                username,
                request_type: 'new',
                status: 'pending'
            });
        }

        // Log device registration
        await supabase.from('logs').insert({
            log_type: 'device',
            level: 'info',
            message: autoApprove ? 'New device auto-approved' : 'New device registered - pending approval',
            details: { 
                username,
                deviceName,
                hwid: hwid.substring(0, 10) + '...',
                auto_approved: autoApprove
            },
            user_id: userId,
            device_id: newDevice.id,
            ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
            user_agent: event.headers['user-agent']
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                message: autoApprove ? 'Device registered and approved' : 'Device registered - pending approval',
                status: deviceStatus,
                deviceId: newDevice.id,
                autoApproved: autoApprove
            })
        };

    } catch (error) {
        console.error('Register device error:', error);
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

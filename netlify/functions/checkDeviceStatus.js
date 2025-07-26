// netlify/functions/checkDeviceStatus.js - Check device approval status

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
        const { email, hwid, fingerprint } = JSON.parse(event.body);

        // Validate required fields
        if (!email || !hwid || !fingerprint) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Username, HWID, and fingerprint are required' 
                })
            };
        }

        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        // Process HWID and fingerprint to match registration logic
        let processedFingerprint = fingerprint;
        if (fingerprint.length > 800) {
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256');
            hash.update(fingerprint);
            processedFingerprint = hash.digest('hex');
            console.log(`Fingerprint too long (${fingerprint.length} chars), using hash for lookup`);
        }
        
        let processedHwid = hwid;
        if (hwid.length > 400) {
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256');
            hash.update(hwid);
            processedHwid = hash.digest('hex');
            console.log(`HWID too long (${hwid.length} chars), using hash for lookup`);
        }

        // Find device by processed HWID and fingerprint
        const { data: device, error: deviceError } = await supabase
            .from('devices')
            .select('*')
            .eq('hwid', processedHwid)
            .eq('fingerprint', processedFingerprint)
            .single();

        if (deviceError) {
            if (deviceError.code === 'PGRST116') { // No rows returned
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ 
                        success: true, 
                        status: 'not_found',
                        message: 'Device not registered' 
                    })
                };
            }
            
            console.error('Error checking device status:', deviceError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Database error checking device status' 
                })
            };
        }

        // Check if device is expired
        if (device.expires_at && new Date(device.expires_at) < new Date()) {
            // Update device status to expired
            await supabase
                .from('devices')
                .update({ status: 'expired' })
                .eq('id', device.id);

            // Log expiration
            await supabase.from('logs').insert({
                log_type: 'device',
                level: 'warn',
                message: 'Device expired',
                details: { 
                    email: device.email,
                    device_name: device.device_name,
                    expired_at: device.expires_at
                },
                user_id: device.user_id,
                device_id: device.id,
                ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
                user_agent: event.headers['user-agent']
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true, 
                    status: 'expired',
                    message: 'Device has expired and needs reactivation',
                    deviceId: device.id,
                    expiredAt: device.expires_at
                })
            };
        }

        // Update last_used timestamp for active devices
        if (device.status === 'active') {
            await supabase
                .from('devices')
                .update({ 
                    last_used: new Date().toISOString(),
                    usage_count: device.usage_count + 1
                })
                .eq('id', device.id);
        }

        // Return device status
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                status: device.status,
                message: getStatusMessage(device.status),
                deviceId: device.id,
                deviceName: device.device_name,
                approvedAt: device.approved_at,
                approvedBy: device.approved_by,
                expiresAt: device.expires_at,
                lastUsed: device.last_used,
                usageCount: device.usage_count
            })
        };

    } catch (error) {
        console.error('Check device status error:', error);
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

function getStatusMessage(status) {
    switch (status) {
        case 'active':
            return 'Device is approved and active';
        case 'pending':
            return 'Device is pending administrator approval';
        case 'blocked':
            return 'Device has been blocked by administrator';
        case 'expired':
            return 'Device has expired and needs reactivation';
        default:
            return 'Unknown device status';
    }
}

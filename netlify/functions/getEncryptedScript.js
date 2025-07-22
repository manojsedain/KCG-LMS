// netlify/functions/getEncryptedScript.js - Deliver encrypted LMS AI script
const { db } = require('../../utils/supabase');

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
        // Parse request body
        const { username, hwid, fingerprint, deviceId } = JSON.parse(event.body);

        // Validate required fields
        if (!username || !hwid || !fingerprint) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Missing required fields' 
                })
            };
        }

        // Get device from database
        const device = await db.getDevice(hwid, fingerprint);
        
        if (!device) {
            await db.createLog({
                log_type: 'security',
                level: 'warn',
                message: 'Script request for unknown device',
                details: { username, hwid: hwid.substring(0, 8) + '...' },
                ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
            });

            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Device not found' 
                })
            };
        }

        // Verify device belongs to the requesting user
        if (device.username !== username) {
            await db.createLog({
                log_type: 'security',
                level: 'error',
                message: 'Script request with mismatched username',
                details: { 
                    device_id: device.id,
                    requested_username: username,
                    actual_username: device.username 
                },
                device_id: device.id,
                ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
            });

            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Access denied' 
                })
            };
        }

        // Check device status
        if (device.status !== 'active') {
            await db.createLog({
                log_type: 'security',
                level: 'warn',
                message: 'Script request from inactive device',
                details: { 
                    device_id: device.id, 
                    username,
                    status: device.status 
                },
                device_id: device.id,
                ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
            });

            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Device not authorized' 
                })
            };
        }

        // Check if device is expired
        if (new Date(device.expires_at) < new Date()) {
            await db.updateDeviceStatus(device.id, 'expired');
            
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Device registration expired' 
                })
            };
        }

        // Get active script
        const activeScript = await db.getActiveScript();
        if (!activeScript) {
            await db.createLog({
                log_type: 'error',
                level: 'error',
                message: 'No active script available',
                details: { device_id: device.id, username },
                device_id: device.id
            });

            return {
                statusCode: 503,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'No active script available' 
                })
            };
        }

        // Update device usage
        await db.updateDeviceUsage(device.id);

        // Log successful script delivery
        await db.createLog({
            log_type: 'script',
            level: 'info',
            message: 'Encrypted script delivered',
            details: { 
                device_id: device.id, 
                username,
                script_version: activeScript.version 
            },
            device_id: device.id,
            ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                encryptedScript: activeScript.encrypted_script,
                version: activeScript.version,
                checksum: activeScript.checksum
            })
        };

    } catch (error) {
        console.error('Encrypted script delivery error:', error);

        await db.createLog({
            log_type: 'error',
            level: 'error',
            message: 'Encrypted script delivery error',
            details: { 
                error: error.message,
                stack: error.stack 
            },
            ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
        });

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Server error' 
            })
        };
    }
};

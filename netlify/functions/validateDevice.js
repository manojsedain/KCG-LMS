// netlify/functions/validateDevice.js - Core device validation
const { db } = require('../../utils/supabase');
const EncryptionUtils = require('../../utils/encryption');

// Configuration
const CONFIG = {
    JWT_SECRET: process.env.JWT_SECRET || 'your-jwt-secret-key',
    SITE_PASSWORD: process.env.SITE_PASSWORD || 'wrongnumber',
    MAX_DEVICES_PER_USER: 3,
    DEVICE_EXPIRY_DAYS: 30
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
        // Parse request body
        const { username, hwid, fingerprint, deviceInfo, sitePassword } = JSON.parse(event.body);

        // Validate required fields
        if (!username || !hwid || !fingerprint || !sitePassword) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Missing required fields' 
                })
            };
        }

        // Validate site password
        const storedSitePassword = await db.getSetting('site_password') || CONFIG.SITE_PASSWORD;
        if (sitePassword !== storedSitePassword) {
            await db.createLog({
                log_type: 'security',
                level: 'warn',
                message: 'Invalid site password attempt',
                details: {
                    username,
                    ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
                    user_agent: event.headers['user-agent']
                }
            });

            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Invalid site password' 
                })
            };
        }

        // Check if user exists, create if not
        let user = await db.getUser(username);
        if (!user) {
            user = await db.createUser(username);
        }

        // Check if device already exists
        let device = await db.getDevice(hwid, fingerprint);
        
        if (device) {
            // Device exists - check status
            switch (device.status) {
                case 'active':
                    // Check if device is expired
                    if (new Date(device.expires_at) < new Date()) {
                        await db.updateDeviceStatus(device.id, 'expired');
                        
                        await db.createLog({
                            log_type: 'device',
                            level: 'info',
                            message: 'Device expired',
                            details: { device_id: device.id, username },
                            user_id: user.id,
                            device_id: device.id
                        });

                        return {
                            statusCode: 200,
                            headers,
                            body: JSON.stringify({
                                success: false,
                                status: 'expired',
                                message: 'Device registration has expired. Please contact admin.'
                            })
                        };
                    }

                    // Device is active - update usage
                    await db.updateDeviceUsage(device.id);
                    await db.updateUserActivity(username);

                    await db.createLog({
                        log_type: 'device',
                        level: 'info',
                        message: 'Device access granted',
                        details: { device_id: device.id, username },
                        user_id: user.id,
                        device_id: device.id,
                        ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
                    });

                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({
                            success: true,
                            status: 'approved',
                            device_id: device.id,
                            expires_at: device.expires_at,
                            message: 'Device validated successfully'
                        })
                    };

                case 'pending':
                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            status: 'pending',
                            message: 'Device registration is pending admin approval'
                        })
                    };

                case 'blocked':
                    await db.createLog({
                        log_type: 'security',
                        level: 'warn',
                        message: 'Blocked device access attempt',
                        details: { device_id: device.id, username },
                        user_id: user.id,
                        device_id: device.id,
                        ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
                    });

                    return {
                        statusCode: 403,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            status: 'blocked',
                            message: 'Device has been blocked. Contact admin.'
                        })
                    };

                case 'expired':
                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            status: 'expired',
                            message: 'Device registration has expired. Please contact admin.'
                        })
                    };
            }
        } else {
            // New device - check if user has reached device limit
            const userDevices = await db.getDevicesByUsername(username);
            const activeDevices = userDevices.filter(d => d.status === 'active' || d.status === 'pending');
            
            const maxDevices = await db.getSetting('max_devices_per_user') || CONFIG.MAX_DEVICES_PER_USER;
            
            if (activeDevices.length >= maxDevices) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        status: 'limit_exceeded',
                        message: `Maximum ${maxDevices} devices allowed per user. Please contact admin to replace a device.`
                    })
                };
            }

            // Generate AES key for this device
            const aesKey = EncryptionUtils.generateKey();
            
            // Create new device with pending status
            const expiryDays = await db.getSetting('device_expiry_days') || CONFIG.DEVICE_EXPIRY_DAYS;
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + expiryDays);

            const newDevice = await db.createDevice({
                user_id: user.id,
                username,
                hwid,
                fingerprint,
                device_name: deviceInfo?.deviceName || 'Unknown Device',
                browser_info: JSON.stringify(deviceInfo?.browserInfo || {}),
                os_info: deviceInfo?.osInfo || 'Unknown OS',
                status: 'pending',
                aes_key: aesKey,
                expires_at: expiresAt.toISOString()
            });

            // Create device request for admin approval
            await db.createDeviceRequest({
                device_id: newDevice.id,
                username,
                request_type: 'new'
            });

            // Log new device registration
            await db.createLog({
                log_type: 'device',
                level: 'info',
                message: 'New device registered',
                details: { 
                    device_id: newDevice.id, 
                    username,
                    device_info: deviceInfo 
                },
                user_id: user.id,
                device_id: newDevice.id,
                ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
                user_agent: event.headers['user-agent']
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: false,
                    status: 'pending',
                    device_id: newDevice.id,
                    message: 'Device registered successfully. Waiting for admin approval.'
                })
            };
        }

    } catch (error) {
        console.error('Device validation error:', error);

        await db.createLog({
            log_type: 'error',
            level: 'error',
            message: 'Device validation function error',
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
                message: 'Server error during device validation' 
            })
        };
    }
};

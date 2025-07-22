// netlify/functions/manageDevices.js - Admin device management
const { db } = require('../../utils/supabase');
const EncryptionUtils = require('../../utils/encryption');

// Configuration
const CONFIG = {
    JWT_SECRET: process.env.JWT_SECRET || 'your-jwt-secret-key'
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

    const payload = EncryptionUtils.verifyToken(token, CONFIG.JWT_SECRET);
    
    if (!payload || payload.type !== 'admin_session') {
        return { valid: false, error: 'Invalid or expired session' };
    }

    return { valid: true, payload };
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
        // Parse request body
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

        const clientIP = event.headers['x-forwarded-for'] || event.headers['x-real-ip'];

        switch (action) {
            case 'getPendingRequests':
                const pendingRequests = await db.getPendingRequests();
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        requests: pendingRequests
                    })
                };

            case 'approveDevice':
                const { requestId, deviceId, adminNotes, replaceExisting } = actionData;
                
                if (!requestId || !deviceId) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Missing requestId or deviceId' 
                        })
                    };
                }

                // Get device info
                const deviceToApprove = await db.getDevice(null, null, deviceId);
                if (!deviceToApprove) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Device not found' 
                        })
                    };
                }

                // If replaceExisting is true, deactivate other devices for this user
                if (replaceExisting) {
                    const userDevices = await db.getDevicesByUsername(deviceToApprove.username);
                    const activeDevices = userDevices.filter(d => 
                        d.status === 'active' && d.id !== deviceId
                    );
                    
                    for (const device of activeDevices) {
                        await db.updateDeviceStatus(device.id, 'blocked', 'admin');
                        await db.createLog({
                            log_type: 'admin',
                            level: 'info',
                            message: 'Device replaced by admin',
                            details: { 
                                old_device_id: device.id,
                                new_device_id: deviceId,
                                username: deviceToApprove.username 
                            },
                            device_id: device.id,
                            ip_address: clientIP
                        });
                    }
                }

                // Approve the device
                await db.updateDeviceStatus(deviceId, 'active', 'admin');
                
                // Update the request
                await db.updateRequestStatus(requestId, 'approved', 'admin', adminNotes);

                // Log approval
                await db.createLog({
                    log_type: 'admin',
                    level: 'info',
                    message: 'Device approved by admin',
                    details: { 
                        device_id: deviceId,
                        username: deviceToApprove.username,
                        replaced_existing: replaceExisting,
                        admin_notes: adminNotes 
                    },
                    device_id: deviceId,
                    ip_address: clientIP
                });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Device approved successfully'
                    })
                };

            case 'denyDevice':
                const { requestId: denyRequestId, deviceId: denyDeviceId, adminNotes: denyNotes } = actionData;
                
                if (!denyRequestId || !denyDeviceId) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Missing requestId or deviceId' 
                        })
                    };
                }

                // Get device info
                const deviceToDeny = await db.getDevice(null, null, denyDeviceId);
                if (!deviceToDeny) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Device not found' 
                        })
                    };
                }

                // Block the device
                await db.updateDeviceStatus(denyDeviceId, 'blocked', 'admin');
                
                // Update the request
                await db.updateRequestStatus(denyRequestId, 'denied', 'admin', denyNotes);

                // Log denial
                await db.createLog({
                    log_type: 'admin',
                    level: 'info',
                    message: 'Device denied by admin',
                    details: { 
                        device_id: denyDeviceId,
                        username: deviceToDeny.username,
                        admin_notes: denyNotes 
                    },
                    device_id: denyDeviceId,
                    ip_address: clientIP
                });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Device denied successfully'
                    })
                };

            case 'blockDevice':
                const { deviceId: blockDeviceId, reason } = actionData;
                
                if (!blockDeviceId) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Missing deviceId' 
                        })
                    };
                }

                // Get device info
                const deviceToBlock = await db.getDevice(null, null, blockDeviceId);
                if (!deviceToBlock) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Device not found' 
                        })
                    };
                }

                // Block the device
                await db.updateDeviceStatus(blockDeviceId, 'blocked', 'admin');

                // Log blocking
                await db.createLog({
                    log_type: 'admin',
                    level: 'warn',
                    message: 'Device blocked by admin',
                    details: { 
                        device_id: blockDeviceId,
                        username: deviceToBlock.username,
                        reason: reason || 'No reason provided'
                    },
                    device_id: blockDeviceId,
                    ip_address: clientIP
                });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Device blocked successfully'
                    })
                };

            case 'unblockDevice':
                const { deviceId: unblockDeviceId } = actionData;
                
                if (!unblockDeviceId) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Missing deviceId' 
                        })
                    };
                }

                // Get device info
                const deviceToUnblock = await db.getDevice(null, null, unblockDeviceId);
                if (!deviceToUnblock) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Device not found' 
                        })
                    };
                }

                // Unblock the device (set to active)
                await db.updateDeviceStatus(unblockDeviceId, 'active', 'admin');

                // Log unblocking
                await db.createLog({
                    log_type: 'admin',
                    level: 'info',
                    message: 'Device unblocked by admin',
                    details: { 
                        device_id: unblockDeviceId,
                        username: deviceToUnblock.username
                    },
                    device_id: unblockDeviceId,
                    ip_address: clientIP
                });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Device unblocked successfully'
                    })
                };

            case 'deleteDevice':
                const { deviceId: deleteDeviceId } = actionData;
                
                if (!deleteDeviceId) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Missing deviceId' 
                        })
                    };
                }

                // Get device info before deletion
                const deviceToDelete = await db.getDevice(null, null, deleteDeviceId);
                if (!deviceToDelete) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Device not found' 
                        })
                    };
                }

                // Delete the device
                await db.deleteDevice(deleteDeviceId);

                // Log deletion
                await db.createLog({
                    log_type: 'admin',
                    level: 'warn',
                    message: 'Device deleted by admin',
                    details: { 
                        device_id: deleteDeviceId,
                        username: deviceToDelete.username,
                        hwid: deviceToDelete.hwid.substring(0, 8) + '...'
                    },
                    ip_address: clientIP
                });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Device deleted successfully'
                    })
                };

            case 'getAllDevices':
                const { status: filterStatus, username: filterUsername } = actionData;
                
                let allDevices;
                if (filterUsername) {
                    allDevices = await db.getDevicesByUsername(filterUsername);
                } else {
                    // Get all devices (this would need to be implemented in the db utility)
                    const { data, error } = await db.supabase
                        .from('devices')
                        .select('*')
                        .order('created_at', { ascending: false });
                    
                    if (error) throw error;
                    allDevices = data || [];
                }

                // Filter by status if provided
                if (filterStatus) {
                    allDevices = allDevices.filter(device => device.status === filterStatus);
                }

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        devices: allDevices
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
        console.error('Device management error:', error);

        await db.createLog({
            log_type: 'error',
            level: 'error',
            message: 'Device management function error',
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

// netlify/functions/deviceManagement.js - Device management for admin panel

// Simple token verification
function verifyToken(token, secret) {
    try {
        if (!token) return null;
        const [headerEncoded, payloadEncoded, signature] = token.split('.');
        if (!headerEncoded || !payloadEncoded || !signature) return null;
        const payload = JSON.parse(Buffer.from(payloadEncoded, 'base64').toString());
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch (error) {
        return null;
    }
}

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

// In-memory storage for demo devices (replace with Supabase later)
let devices = [
    {
        id: 1,
        username: 'student1',
        device_id: 'DEV001',
        status: 'approved',
        ip_address: '192.168.1.100',
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        created_at: new Date().toISOString(),
        last_active: new Date().toISOString(),
        location: 'Computer Lab A'
    },
    {
        id: 2,
        username: 'student2',
        device_id: 'DEV002',
        status: 'pending',
        ip_address: '192.168.1.101',
        user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        created_at: new Date(Date.now() - 3600000).toISOString(),
        last_active: new Date(Date.now() - 1800000).toISOString(),
        location: 'Library'
    },
    {
        id: 3,
        username: 'student3',
        device_id: 'DEV003',
        status: 'blocked',
        ip_address: '192.168.1.102',
        user_agent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        created_at: new Date(Date.now() - 7200000).toISOString(),
        last_active: new Date(Date.now() - 3600000).toISOString(),
        location: 'Dormitory'
    }
];

// Verify admin session
async function verifyAdminSession(token) {
    if (!token) {
        return { valid: false, error: 'No token provided' };
    }

    const payload = verifyToken(token, CONFIG.JWT_SECRET);
    
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

        switch (action) {
            case 'listDevices':
                const { filter, search, sort } = actionData;
                
                let filteredDevices = [...devices];
                
                // Apply filter
                if (filter && filter !== 'all') {
                    filteredDevices = filteredDevices.filter(device => device.status === filter);
                }
                
                // Apply search
                if (search) {
                    const searchLower = search.toLowerCase();
                    filteredDevices = filteredDevices.filter(device => 
                        device.username.toLowerCase().includes(searchLower) ||
                        device.device_id.toLowerCase().includes(searchLower) ||
                        device.ip_address.includes(searchLower)
                    );
                }
                
                // Apply sort
                if (sort) {
                    switch (sort) {
                        case 'created_desc':
                            filteredDevices.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                            break;
                        case 'created_asc':
                            filteredDevices.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                            break;
                        case 'username_asc':
                            filteredDevices.sort((a, b) => a.username.localeCompare(b.username));
                            break;
                        case 'username_desc':
                            filteredDevices.sort((a, b) => b.username.localeCompare(a.username));
                            break;
                        case 'last_active_desc':
                            filteredDevices.sort((a, b) => new Date(b.last_active) - new Date(a.last_active));
                            break;
                    }
                }

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        devices: filteredDevices,
                        stats: {
                            total: devices.length,
                            approved: devices.filter(d => d.status === 'approved').length,
                            pending: devices.filter(d => d.status === 'pending').length,
                            blocked: devices.filter(d => d.status === 'blocked').length
                        }
                    })
                };

            case 'approveDevice':
                const { deviceId } = actionData;
                const deviceToApprove = devices.find(d => d.id === parseInt(deviceId));
                
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

                deviceToApprove.status = 'approved';
                deviceToApprove.approved_at = new Date().toISOString();

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Device approved successfully',
                        device: deviceToApprove
                    })
                };

            case 'blockDevice':
                const { deviceId: blockId } = actionData;
                const deviceToBlock = devices.find(d => d.id === parseInt(blockId));
                
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

                deviceToBlock.status = 'blocked';
                deviceToBlock.blocked_at = new Date().toISOString();

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Device blocked successfully',
                        device: deviceToBlock
                    })
                };

            case 'deleteDevice':
                const { deviceId: deleteId } = actionData;
                const deleteIndex = devices.findIndex(d => d.id === parseInt(deleteId));
                
                if (deleteIndex === -1) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Device not found' 
                        })
                    };
                }

                devices.splice(deleteIndex, 1);

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Device deleted successfully'
                    })
                };

            case 'bulkApprove':
                const pendingDevices = devices.filter(d => d.status === 'pending');
                const approvedCount = pendingDevices.length;
                
                pendingDevices.forEach(device => {
                    device.status = 'approved';
                    device.approved_at = new Date().toISOString();
                });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: `${approvedCount} devices approved successfully`
                    })
                };

            case 'getDeviceDetails':
                const { deviceId: detailsId } = actionData;
                const device = devices.find(d => d.id === parseInt(detailsId));
                
                if (!device) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Device not found' 
                        })
                    };
                }

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        device: {
                            ...device,
                            // Add additional details
                            browser: device.user_agent.includes('Chrome') ? 'Chrome' : 
                                    device.user_agent.includes('Firefox') ? 'Firefox' : 
                                    device.user_agent.includes('Safari') ? 'Safari' : 'Unknown',
                            os: device.user_agent.includes('Windows') ? 'Windows' :
                                device.user_agent.includes('Mac') ? 'macOS' :
                                device.user_agent.includes('Linux') ? 'Linux' : 'Unknown',
                            sessions: Math.floor(Math.random() * 50) + 1,
                            data_usage: Math.floor(Math.random() * 1000) + 100 + ' MB'
                        }
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

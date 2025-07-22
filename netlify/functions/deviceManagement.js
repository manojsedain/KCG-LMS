// netlify/functions/deviceManagement.js - Device management for admin panel
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
        const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
        if (!decoded || decoded.role !== 'admin') {
            return { valid: false, error: 'Invalid or expired session' };
        }
        return { valid: true, payload: decoded };
    } catch (error) {
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
            case 'listDevices':
                const { filter, search, sort } = actionData;
                
                try {
                    let query = supabase
                        .from('devices')
                        .select(`
                            id,
                            username,
                            hwid,
                            fingerprint,
                            device_name,
                            browser_info,
                            os_info,
                            status,
                            ip_address,
                            user_agent,
                            created_at,
                            last_used,
                            usage_count,
                            approved_at,
                            approved_by
                        `);
                    
                    // Apply filter
                    if (filter && filter !== 'all') {
                        query = query.eq('status', filter);
                    }
                    
                    // Apply search
                    if (search) {
                        query = query.or(`username.ilike.%${search}%,device_name.ilike.%${search}%,ip_address.ilike.%${search}%`);
                    }
                    
                    // Apply sort
                    if (sort) {
                        const [field, direction] = sort.split('-');
                        const ascending = direction !== 'desc';
                        query = query.order(field, { ascending });
                    } else {
                        query = query.order('created_at', { ascending: false });
                    }
                    
                    const { data: devices, error } = await query;
                    
                    if (error) {
                        console.error('Error fetching devices:', error);
                        return {
                            statusCode: 500,
                            headers,
                            body: JSON.stringify({
                                success: false,
                                message: 'Error fetching devices: ' + error.message
                            })
                        };
                    }
                    
                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({
                            success: true,
                            devices: devices || [],
                            stats: {
                                total: devices ? devices.length : 0,
                                approved: devices.filter(d => d.status === 'approved').length,
                                pending: devices.filter(d => d.status === 'pending').length,
                                blocked: devices.filter(d => d.status === 'blocked').length
                            }
                        })
                    };
                } catch (error) {
                    console.error('List devices error:', error);
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Error listing devices: ' + error.message
                        })
                    };
                }

            case 'approveDevice':
                const { deviceId } = actionData;
                
                try {
                    const { data: updatedDevice, error } = await supabase
                        .from('devices')
                        .update({
                            status: 'approved',
                            approved_at: new Date().toISOString(),
                            approved_by: 'admin'
                        })
                        .eq('id', deviceId)
                        .select()
                        .single();
                    
                    if (error) {
                        console.error('Error approving device:', error);
                        return {
                            statusCode: 500,
                            headers,
                            body: JSON.stringify({
                                success: false,
                                message: 'Error approving device: ' + error.message
                            })
                        };
                    }
                    
                    if (!updatedDevice) {
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
                            message: 'Device approved successfully',
                            device: updatedDevice
                        })
                    };
                } catch (error) {
                    console.error('Approve device error:', error);
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Error approving device: ' + error.message
                        })
                    };
                }

            case 'blockDevice':
                const { deviceId: blockId } = actionData;
                
                try {
                    const { data: updatedDevice, error } = await supabase
                        .from('devices')
                        .update({
                            status: 'blocked'
                        })
                        .eq('id', blockId)
                        .select()
                        .single();
                    
                    if (error) {
                        console.error('Error blocking device:', error);
                        return {
                            statusCode: 500,
                            headers,
                            body: JSON.stringify({
                                success: false,
                                message: 'Error blocking device: ' + error.message
                            })
                        };
                    }
                    
                    if (!updatedDevice) {
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
                            message: 'Device blocked successfully',
                            device: updatedDevice
                        })
                    };
                } catch (error) {
                    console.error('Block device error:', error);
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Error blocking device: ' + error.message
                        })
                    };
                }

            case 'deleteDevice':
                const { deviceId: deleteId } = actionData;
                
                try {
                    const { data: deletedDevice, error } = await supabase
                        .from('devices')
                        .delete()
                        .eq('id', deleteId)
                        .select()
                        .single();
                    
                    if (error) {
                        console.error('Error deleting device:', error);
                        return {
                            statusCode: 500,
                            headers,
                            body: JSON.stringify({
                                success: false,
                                message: 'Error deleting device: ' + error.message
                            })
                        };
                    }
                    
                    if (!deletedDevice) {
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
                            message: 'Device deleted successfully'
                        })
                    };
                } catch (error) {
                    console.error('Delete device error:', error);
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Error deleting device: ' + error.message
                        })
                    };
                }

            case 'bulkApprove':
                try {
                    const { data: updatedDevices, error } = await supabase
                        .from('devices')
                        .update({
                            status: 'approved',
                            approved_at: new Date().toISOString(),
                            approved_by: 'admin'
                        })
                        .eq('status', 'pending')
                        .select();
                    
                    if (error) {
                        console.error('Error bulk approving devices:', error);
                        return {
                            statusCode: 500,
                            headers,
                            body: JSON.stringify({
                                success: false,
                                message: 'Error bulk approving devices: ' + error.message
                            })
                        };
                    }
                    
                    const approvedCount = updatedDevices ? updatedDevices.length : 0;

                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({
                            success: true,
                            message: `${approvedCount} devices approved successfully`
                        })
                    };
                } catch (error) {
                    console.error('Bulk approve error:', error);
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Error bulk approving devices: ' + error.message
                        })
                    };
                }

            case 'getDeviceDetails':
                const { deviceId: detailsId } = actionData;
                
                try {
                    const { data: device, error } = await supabase
                        .from('devices')
                        .select('*')
                        .eq('id', detailsId)
                        .single();
                    
                    if (error) {
                        console.error('Error fetching device details:', error);
                        return {
                            statusCode: 500,
                            headers,
                            body: JSON.stringify({
                                success: false,
                                message: 'Error fetching device details: ' + error.message
                            })
                        };
                    }
                    
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
                                browser: device.browser_info && device.browser_info.includes('Chrome') ? 'Chrome' : 
                                        device.browser_info && device.browser_info.includes('Firefox') ? 'Firefox' : 
                                        device.browser_info && device.browser_info.includes('Safari') ? 'Safari' : 'Unknown',
                                os: device.os_info || 'Unknown',
                                sessions: device.usage_count || 0,
                                data_usage: 'N/A'
                            }
                        })
                    };
                } catch (error) {
                    console.error('Get device details error:', error);
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Error fetching device details: ' + error.message
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

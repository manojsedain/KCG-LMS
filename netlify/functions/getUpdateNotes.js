// netlify/functions/getUpdateNotes.js - Deliver update notes for About menu
const { db } = require('../../utils/supabase');

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Handle GET requests for basic version info
    if (event.httpMethod === 'GET') {
        try {
            // Get active script for version info
            const activeScript = await db.getActiveScript();
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    version: activeScript?.version || '1.0.0',
                    lastUpdate: activeScript?.created_at || new Date().toISOString(),
                    updateNotes: activeScript?.update_notes || 'Welcome to LMS AI Assistant'
                })
            };
        } catch (error) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    version: '1.0.0',
                    lastUpdate: new Date().toISOString(),
                    updateNotes: 'Welcome to LMS AI Assistant'
                })
            };
        }
    }
    
    // Only allow POST requests for detailed device info
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
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Access denied' 
                })
            };
        }

        // Check device status (allow pending devices to see update notes)
        if (device.status === 'blocked') {
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Device blocked' 
                })
            };
        }

        // Get active script and update notes
        const activeScript = await db.getActiveScript();
        
        let updateNotes = 'No update notes available';
        let version = '1.0.0';
        
        if (activeScript) {
            updateNotes = activeScript.update_notes || 'No update notes available';
            version = activeScript.version;
        }

        // Get device status info
        let statusText = device.status;
        switch (device.status) {
            case 'active':
                statusText = 'Active';
                break;
            case 'pending':
                statusText = 'Pending Approval';
                break;
            case 'blocked':
                statusText = 'Blocked';
                break;
            case 'expired':
                statusText = 'Expired';
                break;
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                updateNotes,
                version,
                deviceInfo: {
                    username: device.username,
                    deviceId: device.id,
                    status: statusText,
                    expiryDate: device.expires_at,
                    lastUsed: device.last_used,
                    usageCount: device.usage_count,
                    createdAt: device.created_at
                }
            })
        };

    } catch (error) {
        console.error('Update notes delivery error:', error);

        await db.createLog({
            log_type: 'error',
            level: 'error',
            message: 'Update notes delivery error',
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

// netlify/functions/getDashboardData_minimal.js - Minimal test version

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

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
        // Simple demo data - no dependencies, no token verification for now
        const demoData = {
            success: true,
            dashboard: {
                stats: {
                    totalDevices: 15,
                    activeDevices: 12,
                    pendingRequests: 3,
                    blockedDevices: 2,
                    totalUsers: 8
                },
                recentLogs: [
                    { id: 1, log_type: 'admin', level: 'info', message: 'Admin login successful', created_at: new Date().toISOString() },
                    { id: 2, log_type: 'device', level: 'info', message: 'Device registered', created_at: new Date(Date.now() - 3600000).toISOString() }
                ],
                pendingRequests: [
                    { id: 1, username: 'user1', device_name: 'Chrome Browser', created_at: new Date().toISOString() }
                ],
                activeScript: {
                    id: 1,
                    version: '1.0.0',
                    update_notes: 'Initial release',
                    created_at: new Date().toISOString()
                },
                recentDevices: [],
                settings: {
                    maintenance_mode: false,
                    auto_approve_devices: false,
                    max_devices_per_user: 3,
                    device_expiry_days: 30,
                    email_notifications: true
                },
                analytics: {
                    usageByDay: {},
                    statusDistribution: { active: 10, blocked: 2 },
                    topUsers: []
                },
                systemHealth: {
                    status: 'healthy',
                    uptime: process.uptime(),
                    memoryUsage: process.memoryUsage(),
                    lastScriptUpdate: new Date().toISOString(),
                    maintenanceMode: false
                }
            }
        };

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(demoData)
        };

    } catch (error) {
        console.error('Dashboard data error:', error);
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

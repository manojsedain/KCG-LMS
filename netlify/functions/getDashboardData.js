// netlify/functions/getDashboardData.js - Real dashboard data with database integration
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';

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
        // Verify JWT token
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, message: 'Missing or invalid authorization header' })
            };
        }

        const token = authHeader.substring(7);
        try {
            jwt.verify(token, JWT_SECRET);
        } catch (jwtError) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, message: 'Invalid token' })
            };
        }

        // Get device statistics
        const { data: devices, error: devicesError } = await supabase
            .from('devices')
            .select('id, status, created_at, username');

        if (devicesError) {
            throw new Error('Failed to fetch devices: ' + devicesError.message);
        }

        // Calculate device statistics
        const totalDevices = devices.length;
        const activeDevices = devices.filter(d => d.status === 'active').length;
        const pendingRequests = devices.filter(d => d.status === 'pending').length;
        const blockedDevices = devices.filter(d => d.status === 'blocked').length;
        const expiredDevices = devices.filter(d => d.status === 'expired').length;

        // Get unique users count
        const uniqueUsers = [...new Set(devices.map(d => d.username))].length;

        // Get recent logs
        const { data: recentLogs, error: logsError } = await supabase
            .from('logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);

        // Get pending device requests with details
        const { data: pendingDevices, error: pendingError } = await supabase
            .from('devices')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(5);

        // Get active script info
        const { data: activeScript, error: scriptError } = await supabase
            .from('script_updates')
            .select('*')
            .eq('is_active', true)
            .single();

        // Get system settings
        const { data: settingsData, error: settingsError } = await supabase
            .from('settings')
            .select('*');

        const settings = {};
        if (settingsData) {
            settingsData.forEach(setting => {
                settings[setting.key] = setting.value;
            });
        }

        const dashboardData = {
            success: true,
            dashboard: {
                stats: {
                    totalDevices,
                    activeDevices,
                    pendingRequests,
                    blockedDevices,
                    expiredDevices,
                    totalUsers: uniqueUsers
                },
                recentLogs: recentLogs || [],
                pendingRequests: pendingDevices || [],
                activeScript: activeScript || null,
                recentDevices: devices.slice(-5).reverse(),
                settings: {
                    maintenance_mode: settings.maintenance_mode === 'true',
                    auto_approve_devices: settings.auto_approve_devices === 'true',
                    max_devices_per_user: parseInt(settings.max_devices_per_user) || 3,
                    device_expiry_days: parseInt(settings.device_expiry_days) || 30,
                    email_notifications: settings.email_notifications === 'true'
                },
                analytics: {
                    usageByDay: {},
                    statusDistribution: {
                        active: activeDevices,
                        pending: pendingRequests,
                        blocked: blockedDevices,
                        expired: expiredDevices
                    },
                    topUsers: []
                },
                systemHealth: {
                    status: 'healthy',
                    uptime: process.uptime(),
                    memoryUsage: process.memoryUsage(),
                    lastScriptUpdate: activeScript?.created_at || new Date().toISOString(),
                    maintenanceMode: settings.maintenance_mode === 'true'
                }
            }
        };

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(dashboardData)
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

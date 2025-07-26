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
        // Parse request body to get token (consistent with other admin functions)
        const requestBody = JSON.parse(event.body || '{}');
        const { token } = requestBody;
        
        if (!token) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, message: 'Missing token in request body' })
            };
        }

        // Verify JWT token
        try {
            jwt.verify(token, JWT_SECRET);
        } catch (jwtError) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, message: 'Invalid or expired token' })
            };
        }

        // Get device statistics using email column (with username fallback)
        const { data: devices, error: devicesError } = await supabase
            .from('devices')
            .select('id, email, username, status, created_at, last_used')
            .order('created_at', { ascending: false });
        
        if (devicesError) {
            console.error('Error fetching devices:', devicesError);
        }
        
        // Calculate device stats with error handling
        const totalDevices = devices ? devices.length : 0;
        const activeDevices = devices ? devices.filter(d => d.status === 'active' || d.status === 'approved').length : 0;
        const pendingDeviceCount = devices ? devices.filter(d => d.status === 'pending').length : 0;
        const expiredDevices = devices ? devices.filter(d => d.status === 'expired' || d.status === 'blocked').length : 0;
        
        // Get unique users count (prefer email, fallback to username)
        const uniqueUsers = devices ? new Set(devices.map(d => d.email || d.username).filter(Boolean)).size : 0;

        // Get recent logs
        const { data: recentLogs, error: logsError } = await supabase
            .from('logs_new')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
        
        if (logsError) {
            console.error('Logs query error:', logsError);
        }

        // Get pending device requests with details
        const { data: pendingDevices, error: pendingError } = await supabase
            .from('devices')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(5);
        
        if (pendingError) {
            console.error('Pending devices query error:', pendingError);
        }

        // Get active script info
        const { data: activeScript, error: scriptError } = await supabase
            .from('script_updates')
            .select('*')
            .eq('is_active', true)
            .single();
        
        if (scriptError) {
            console.error('Script query error:', scriptError);
        }

        // Get system settings
        const { data: settingsData, error: settingsError } = await supabase
            .from('payment_settings')
            .select('setting_key, setting_value');

        if (settingsError) {
            console.error('Settings query error:', settingsError);
        }

        const settings = {};
        if (settingsData) {
            settingsData.forEach(setting => {
                settings[setting.setting_key] = setting.setting_value;
            });
        }

        const dashboardData = {
            success: true,
            dashboard: {
                stats: {
                    totalDevices,
                    activeDevices,
                    pendingDevices: pendingDeviceCount,
                    expiredDevices,
                    totalUsers: uniqueUsers
                },
                recentLogs: recentLogs || [],
                pendingRequests: devices ? devices.filter(d => d.status === 'pending') : [],
                activeScript: activeScript || null,
                recentDevices: devices ? devices.slice(-5).reverse() : [],
                settings: {
                    maintenance_mode: settings.maintenance_mode === 'true',
                    auto_approve_devices: settings.auto_approve_devices === 'true',
                    max_devices_per_user: parseInt(settings.max_devices_per_user) || 3,
                    device_expiry_days: parseInt(settings.device_expiry_days) || 30,
                    email_notifications: settings.email_notifications === 'true'
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

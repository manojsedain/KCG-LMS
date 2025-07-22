// netlify/functions/getDashboardData.js - Admin dashboard data
const EncryptionUtils = require('../../utils/encryption');

// Try to load Supabase, but provide fallback if not configured
let db = null;
try {
    const supabaseModule = require('../../utils/supabase');
    db = supabaseModule.db;
} catch (error) {
    console.log('Supabase not configured, using fallback mode for dashboard');
    // Fallback database functions with demo data
    db = {
        async getDashboardStats() {
            return {
                totalDevices: 15,
                activeDevices: 12,
                pendingRequests: 3,
                blockedDevices: 2,
                totalUsers: 8
            };
        },
        async getLogs(filters = {}) {
            return [
                { id: 1, log_type: 'admin', level: 'info', message: 'Admin login successful', created_at: new Date().toISOString() },
                { id: 2, log_type: 'device', level: 'info', message: 'Device registered', created_at: new Date(Date.now() - 3600000).toISOString() },
                { id: 3, log_type: 'script', level: 'info', message: 'Script downloaded', created_at: new Date(Date.now() - 7200000).toISOString() }
            ];
        },
        async getPendingRequests() {
            return [
                { id: 1, username: 'user1', device_name: 'Chrome Browser', created_at: new Date().toISOString() },
                { id: 2, username: 'user2', device_name: 'Firefox Browser', created_at: new Date(Date.now() - 1800000).toISOString() }
            ];
        },
        async getActiveScript() {
            return {
                id: 1,
                version: '1.0.0',
                update_notes: 'Initial release',
                created_at: new Date().toISOString()
            };
        },
        async getAllSettings() {
            return {
                maintenance_mode: false,
                auto_approve_devices: false,
                max_devices_per_user: 3,
                device_expiry_days: 30,
                email_notifications: true
            };
        },
        async createLog(logData) {
            console.log('Log:', logData);
        },
        supabase: {
            from: () => ({
                select: () => ({
                    gte: () => ({
                        order: () => ({ data: [], error: null })
                    }),
                    eq: () => ({
                        single: () => ({ data: [], error: null })
                    }),
                    neq: () => ({ data: [{ status: 'active' }, { status: 'blocked' }], error: null }),
                    in: () => ({
                        order: () => ({ data: [], error: null })
                    })
                })
            })
        }
    };
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
        const { token } = JSON.parse(event.body);

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

        // Get dashboard statistics
        const stats = await db.getDashboardStats();

        // Get recent activity logs
        const recentLogs = await db.getLogs({ limit: 20 });

        // Get pending requests
        const pendingRequests = await db.getPendingRequests();

        // Get active script info
        const activeScript = await db.getActiveScript();

        // Get recent devices (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const { data: recentDevices, error: recentDevicesError } = await db.supabase
            .from('devices')
            .select('*')
            .gte('created_at', sevenDaysAgo.toISOString())
            .order('created_at', { ascending: false });

        if (recentDevicesError) throw recentDevicesError;

        // Get system settings
        const settings = await db.getAllSettings();

        // Get usage statistics for the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: usageLogs, error: usageError } = await db.supabase
            .from('logs')
            .select('created_at, log_type')
            .gte('created_at', thirtyDaysAgo.toISOString())
            .in('log_type', ['device', 'script'])
            .order('created_at', { ascending: true });

        if (usageError) throw usageError;

        // Process usage data for charts
        const usageByDay = {};
        usageLogs.forEach(log => {
            const date = new Date(log.created_at).toISOString().split('T')[0];
            if (!usageByDay[date]) {
                usageByDay[date] = { device: 0, script: 0 };
            }
            usageByDay[date][log.log_type]++;
        });

        // Get device status distribution
        const { data: deviceStatusData, error: statusError } = await db.supabase
            .from('devices')
            .select('status')
            .neq('status', null);

        if (statusError) throw statusError;

        const statusDistribution = deviceStatusData.reduce((acc, device) => {
            acc[device.status] = (acc[device.status] || 0) + 1;
            return acc;
        }, {});

        // Get top users by device count
        const { data: userDeviceData, error: userError } = await db.supabase
            .from('devices')
            .select('username')
            .eq('status', 'active');

        if (userError) throw userError;

        const userDeviceCounts = userDeviceData.reduce((acc, device) => {
            acc[device.username] = (acc[device.username] || 0) + 1;
            return acc;
        }, {});

        const topUsers = Object.entries(userDeviceCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([username, count]) => ({ username, deviceCount: count }));

        // Calculate uptime and system health
        const systemHealth = {
            status: 'healthy',
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            lastScriptUpdate: activeScript?.created_at || null,
            maintenanceMode: settings.maintenance_mode || false
        };

        // Determine system status based on various factors
        if (stats.pendingRequests > 10) {
            systemHealth.status = 'warning';
        }
        if (!activeScript) {
            systemHealth.status = 'error';
        }
        if (settings.maintenance_mode) {
            systemHealth.status = 'maintenance';
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                dashboard: {
                    stats,
                    recentLogs: recentLogs.slice(0, 10), // Limit to 10 most recent
                    pendingRequests: pendingRequests.slice(0, 5), // Limit to 5 most recent
                    activeScript: activeScript ? {
                        id: activeScript.id,
                        version: activeScript.version,
                        update_notes: activeScript.update_notes,
                        created_at: activeScript.created_at
                    } : null,
                    recentDevices: recentDevices?.slice(0, 10) || [],
                    settings: {
                        maintenance_mode: settings.maintenance_mode,
                        auto_approve_devices: settings.auto_approve_devices,
                        max_devices_per_user: settings.max_devices_per_user,
                        device_expiry_days: settings.device_expiry_days,
                        email_notifications: settings.email_notifications
                    },
                    analytics: {
                        usageByDay,
                        statusDistribution,
                        topUsers
                    },
                    systemHealth
                }
            })
        };

    } catch (error) {
        console.error('Dashboard data error:', error);

        await db.createLog({
            log_type: 'error',
            level: 'error',
            message: 'Dashboard data function error',
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

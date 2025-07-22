// netlify/functions/logsManagement.js - Logs management with Supabase integration

const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const CONFIG = {
    JWT_SECRET: process.env.JWT_SECRET || 'V+3stApVGE9zLpJFf79RA4SAc/w2vqJygx5wQ2hW/OlGLN/rhEPFHV1tRR+zcO2APsrvMwy+IO6IgN7+jSghTw==',
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
};

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
        const { action, token, ...params } = JSON.parse(event.body);

        // Verify admin token
        const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
        if (!decoded || decoded.role !== 'admin') {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, message: 'Unauthorized' })
            };
        }

        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        switch (action) {
            case 'getLogs':
                return await getLogs(supabase, params);
            
            case 'clearLogs':
                return await clearLogs(supabase, params);
            
            case 'exportLogs':
                return await exportLogs(supabase, params);
            
            default:
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, message: 'Invalid action' })
                };
        }

    } catch (error) {
        console.error('Logs management error:', error);
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

// Get logs with filtering and pagination
async function getLogs(supabase, params) {
    try {
        const { 
            logType = 'all', 
            level = 'all', 
            startDate, 
            endDate, 
            limit = 50, 
            offset = 0,
            search = ''
        } = params;

        let query = supabase
            .from('logs')
            .select('*')
            .order('created_at', { ascending: false });

        // Apply filters
        if (logType !== 'all') {
            query = query.eq('log_type', logType);
        }

        if (level !== 'all') {
            query = query.eq('level', level);
        }

        if (startDate) {
            query = query.gte('created_at', startDate);
        }

        if (endDate) {
            query = query.lte('created_at', endDate);
        }

        if (search) {
            query = query.ilike('message', `%${search}%`);
        }

        // Apply pagination
        query = query.range(offset, offset + limit - 1);

        const { data: logs, error, count } = await query;

        if (error) {
            console.error('Error fetching logs:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Failed to fetch logs' 
                })
            };
        }

        // Get total count for pagination
        const { count: totalCount } = await supabase
            .from('logs')
            .select('*', { count: 'exact', head: true });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                logs: logs || [],
                pagination: {
                    total: totalCount || 0,
                    limit,
                    offset,
                    hasMore: (offset + limit) < (totalCount || 0)
                }
            })
        };

    } catch (error) {
        console.error('Error getting logs:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Failed to get logs' 
            })
        };
    }
}

// Clear logs based on criteria
async function clearLogs(supabase, params) {
    try {
        const { 
            logType = 'all', 
            level = 'all', 
            olderThan 
        } = params;

        let query = supabase.from('logs');

        // Build delete query based on filters
        if (logType !== 'all' && level !== 'all') {
            query = query.delete().eq('log_type', logType).eq('level', level);
        } else if (logType !== 'all') {
            query = query.delete().eq('log_type', logType);
        } else if (level !== 'all') {
            query = query.delete().eq('level', level);
        } else if (olderThan) {
            query = query.delete().lt('created_at', olderThan);
        } else {
            // Clear all logs if no specific criteria
            query = query.delete().neq('id', 0); // Delete all records
        }

        const { error, count } = await query;

        if (error) {
            console.error('Error clearing logs:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Failed to clear logs' 
                })
            };
        }

        // Log the clear action
        await supabase.from('logs').insert({
            log_type: 'admin',
            level: 'info',
            message: `Logs cleared by admin`,
            details: { 
                action: 'logs_cleared',
                criteria: { logType, level, olderThan },
                deletedCount: count
            }
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                message: `Successfully cleared ${count || 0} log entries`
            })
        };

    } catch (error) {
        console.error('Error clearing logs:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Failed to clear logs' 
            })
        };
    }
}

// Export logs as JSON or CSV
async function exportLogs(supabase, params) {
    try {
        const { 
            format = 'json',
            logType = 'all', 
            level = 'all', 
            startDate, 
            endDate,
            limit = 1000
        } = params;

        let query = supabase
            .from('logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        // Apply filters
        if (logType !== 'all') {
            query = query.eq('log_type', logType);
        }

        if (level !== 'all') {
            query = query.eq('level', level);
        }

        if (startDate) {
            query = query.gte('created_at', startDate);
        }

        if (endDate) {
            query = query.lte('created_at', endDate);
        }

        const { data: logs, error } = await query;

        if (error) {
            console.error('Error exporting logs:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Failed to export logs' 
                })
            };
        }

        let exportData;
        let contentType;
        let filename;

        if (format === 'csv') {
            // Convert to CSV format
            const csvHeaders = ['ID', 'Type', 'Level', 'Message', 'Details', 'IP Address', 'User Agent', 'Created At'];
            const csvRows = logs.map(log => [
                log.id,
                log.log_type,
                log.level,
                log.message,
                JSON.stringify(log.details || {}),
                log.ip_address || '',
                log.user_agent || '',
                log.created_at
            ]);
            
            exportData = [csvHeaders, ...csvRows]
                .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
                .join('\n');
            
            contentType = 'text/csv';
            filename = `logs_export_${new Date().toISOString().split('T')[0]}.csv`;
        } else {
            // JSON format
            exportData = JSON.stringify(logs, null, 2);
            contentType = 'application/json';
            filename = `logs_export_${new Date().toISOString().split('T')[0]}.json`;
        }

        // Log the export action
        await supabase.from('logs').insert({
            log_type: 'admin',
            level: 'info',
            message: `Logs exported by admin`,
            details: { 
                action: 'logs_exported',
                format,
                criteria: { logType, level, startDate, endDate },
                exportedCount: logs.length
            }
        });

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': contentType,
                'Content-Disposition': `attachment; filename="${filename}"`
            },
            body: exportData
        };

    } catch (error) {
        console.error('Error exporting logs:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Failed to export logs' 
            })
        };
    }
}

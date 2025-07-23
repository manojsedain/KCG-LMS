// netlify/functions/getScriptMetadata.js - Get comprehensive script metadata for public display

const { createClient } = require('@supabase/supabase-js');

// Configuration
const CONFIG = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
};

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

    // Only allow GET and POST methods
    if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ success: false, message: 'Method not allowed' })
        };
    }

    try {
        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        // Get the active script with comprehensive metadata
        const { data: script, error } = await supabase
            .from('script_updates')
            .select(`
                id,
                version,
                update_notes,
                created_at,
                created_by,
                file_size,
                is_active,
                checksum,
                downloads
            `)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !script) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: 'No active script found'
                })
            };
        }

        // Get download count and last access info
        const { data: accessLogs, error: logsError } = await supabase
            .from('logs')
            .select('created_at, username')
            .eq('action', 'script_download')
            .order('created_at', { ascending: false })
            .limit(1);

        let lastAccess = null;
        let totalDownloads = script.downloads || 0;

        if (!logsError && accessLogs && accessLogs.length > 0) {
            lastAccess = accessLogs[0].created_at;
        }

        // Check if system is in maintenance mode (you can add this logic)
        const maintenanceMode = false; // TODO: Implement maintenance mode check

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                script: {
                    id: script.id,
                    version: script.version || '1.0.0',
                    update_notes: script.update_notes || 'No release notes available.',
                    created_at: script.created_at,
                    updated_at: script.created_at, // Use created_at as updated_at for now
                    created_by: script.created_by || 'Admin',
                    file_size: script.file_size || 0,
                    is_active: script.is_active,
                    downloads: totalDownloads,
                    last_access: lastAccess,
                    maintenance_mode: maintenanceMode,
                    checksum: script.checksum
                }
            })
        };

    } catch (error) {
        console.error('Error in getScriptMetadata:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                message: 'Internal server error: ' + error.message
            })
        };
    }
};

// netlify/functions/manageScripts.js - Complete script management for admin panel

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

// Verify JWT token
function verifyToken(token) {
    try {
        if (!token) return null;
        return jwt.verify(token, CONFIG.JWT_SECRET);
    } catch (error) {
        console.error('JWT verification error:', error.message);
        return null;
    }
}

// Verify admin session
async function verifyAdminSession(token) {
    if (!token) {
        return { valid: false, error: 'No token provided' };
    }

    const payload = verifyToken(token);
    
    if (!payload || payload.role !== 'admin') {
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

        // Verify admin session for protected actions
        if (action !== 'getActiveScript') {
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
        }

        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        switch (action) {
            case 'listScripts':
                const { data: scripts, error: listError } = await supabase
                    .from('script_updates')
                    .select('id, version, encrypted_script, update_notes, created_at, created_by, file_size, is_active, checksum')
                    .order('created_at', { ascending: false });

                if (listError) {
                    console.error('Error fetching scripts:', listError);
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Error fetching scripts: ' + listError.message
                        })
                    };
                }

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        scripts: (scripts || []).map(script => ({
                            id: script.id,
                            version: script.version,
                            name: script.created_by || 'Unnamed Script',
                            description: script.update_notes || 'No description',
                            update_notes: script.update_notes,
                            created_at: script.created_at,
                            updated_at: script.created_at,
                            created_by: script.created_by,
                            file_size: script.file_size,
                            is_active: script.is_active,
                            downloads: 0 // TODO: Add download tracking
                        }))
                    })
                };

            case 'getScript':
                const { scriptId } = actionData;
                const { data: script, error: getError } = await supabase
                    .from('script_updates')
                    .select('*')
                    .eq('id', scriptId)
                    .single();
                
                if (getError || !script) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Script not found'
                        })
                    };
                }

                // Decode the script content
                const scriptContent = Buffer.from(script.encrypted_script, 'base64').toString();

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        script: {
                            id: script.id,
                            version: script.version,
                            name: script.created_by || 'Unnamed Script',
                            description: script.update_notes || 'No description',
                            content: scriptContent,
                            update_notes: script.update_notes,
                            created_at: script.created_at,
                            file_size: script.file_size,
                            is_active: script.is_active,
                            checksum: script.checksum
                        }
                    })
                };

            case 'updateScript':
                const { scriptId: updateId, updates } = actionData;
                const { data: updatedScript, error: updateError } = await supabase
                    .from('script_updates')
                    .update({
                        version: updates.version,
                        encrypted_script: updates.content ? Buffer.from(updates.content).toString('base64') : undefined,
                        update_notes: updates.description,
                        is_active: updates.is_active,
                        checksum: updates.content ? require('crypto').createHash('sha256').update(updates.content).digest('hex') : undefined
                    })
                    .eq('id', updateId)
                    .select()
                    .single();

                if (updateError) {
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Error updating script: ' + updateError.message
                        })
                    };
                }

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        script: updatedScript
                    })
                };

            case 'deleteScript':
                const { scriptId: deleteId } = actionData;
                const { error: deleteError } = await supabase
                    .from('script_updates')
                    .delete()
                    .eq('id', deleteId);

                if (deleteError) {
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Error deleting script: ' + deleteError.message
                        })
                    };
                }

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Script deleted successfully'
                    })
                };

            case 'getActiveScript':
                // Get the active script for public download
                const { data: activeScript, error: activeError } = await supabase
                    .from('script_updates')
                    .select('encrypted_script, version, checksum')
                    .eq('is_active', true)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (activeError || !activeScript) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'No active script found'
                        })
                    };
                }

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        script: {
                            content: Buffer.from(activeScript.encrypted_script, 'base64').toString(),
                            version: activeScript.version,
                            checksum: activeScript.checksum
                        }
                    })
                };

            case 'toggleStatus':
                const { scriptId: toggleId, isActive } = actionData;
                
                // If activating, deactivate all other scripts first
                if (isActive) {
                    await supabase
                        .from('script_updates')
                        .update({ is_active: false })
                        .neq('id', toggleId);
                }
                
                const { error: toggleError } = await supabase
                    .from('script_updates')
                    .update({ is_active: isActive })
                    .eq('id', toggleId);

                if (toggleError) {
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Error updating script status: ' + toggleError.message
                        })
                    };
                }

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: `Script ${isActive ? 'activated' : 'deactivated'} successfully`
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
        console.error('Error in manageScripts:', error);
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

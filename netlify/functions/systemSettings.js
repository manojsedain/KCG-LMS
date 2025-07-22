// netlify/functions/systemSettings.js - System settings management with Supabase integration

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

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
        const { action, token, ...params } = JSON.parse(event.body);

        // Check if token is provided
        if (!token) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, message: 'jwt must be provided' })
            };
        }

        // Verify admin token
        try {
            const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
            if (!decoded || decoded.role !== 'admin') {
                return {
                    statusCode: 401,
                    headers,
                    body: JSON.stringify({ success: false, message: 'Unauthorized' })
                };
            }
        } catch (jwtError) {
            console.error('JWT verification error:', jwtError);
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, message: 'Invalid or expired token' })
            };
        }

        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        switch (action) {
            case 'updateAdminPassword':
                return await updateAdminPassword(supabase, params.newPassword);
            
            case 'updateSitePassword':
                return await updateSitePassword(supabase, params.sitePassword);
            
            case 'generateJwtSecret':
                return await generateJwtSecret(supabase);
            
            case 'testDatabaseConnection':
                return await testDatabaseConnection(params.supabaseUrl, params.supabaseKey);
            
            case 'getSystemInfo':
                return await getSystemInfo(supabase);
            
            default:
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, message: 'Invalid action' })
                };
        }

    } catch (error) {
        console.error('System settings error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, message: 'Server error: ' + error.message })
        };
    }
};

// Update admin password in Supabase
async function updateAdminPassword(supabase, newPassword) {
    if (!newPassword || newPassword.length < 6) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, message: 'Password must be at least 6 characters' })
        };
    }

    try {
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        
        // Update admin password in database
        const { error } = await supabase
            .from('admin_settings')
            .upsert({
                setting_key: 'admin_password',
                setting_value: hashedPassword,
                setting_type: 'string',
                description: 'Hashed admin password',
                updated_at: new Date().toISOString()
            }, { onConflict: 'setting_key' });

        if (error) {
            console.error('Error updating admin password:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ success: false, message: 'Failed to update admin password in database' })
            };
        }

        // Log the password change
        await supabase.from('logs').insert({
            log_type: 'admin',
            level: 'info',
            message: 'Admin password updated',
            details: { action: 'password_change' }
        });
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: 'Admin password updated successfully' })
        };
    } catch (error) {
        console.error('Error updating admin password:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, message: 'Failed to update password' })
        };
    }
}

// Update site password in Supabase
async function updateSitePassword(supabase, sitePassword) {
    if (!sitePassword || sitePassword.length < 3) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, message: 'Site password must be at least 3 characters' })
        };
    }

    try {
        // Update site password in database
        const { error } = await supabase
            .from('admin_settings')
            .upsert({
                setting_key: 'site_password',
                setting_value: sitePassword,
                setting_type: 'string',
                description: 'Password required to download loader script',
                updated_at: new Date().toISOString()
            }, { onConflict: 'setting_key' });

        if (error) {
            console.error('Error updating site password:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ success: false, message: 'Failed to update site password in database' })
            };
        }

        // Log the password change
        await supabase.from('logs').insert({
            log_type: 'admin',
            level: 'info',
            message: 'Site password updated',
            details: { action: 'site_password_change' }
        });
    
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: 'Site password updated successfully' })
        };
    } catch (error) {
        console.error('Error updating site password:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, message: 'Failed to update site password' })
        };
    }
}

// Generate JWT secret and store in Supabase
async function generateJwtSecret(supabase) {
    try {
        const newSecret = crypto.randomBytes(64).toString('base64');
        
        // Update JWT secret in database
        const { error } = await supabase
            .from('admin_settings')
            .upsert({
                setting_key: 'jwt_secret',
                setting_value: newSecret,
                setting_type: 'string',
                description: 'JWT signing secret key',
                updated_at: new Date().toISOString()
            }, { onConflict: 'setting_key' });

        if (error) {
            console.error('Error updating JWT secret:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ success: false, message: 'Failed to update JWT secret in database' })
            };
        }

        // Log the secret generation
        await supabase.from('logs').insert({
            log_type: 'admin',
            level: 'info',
            message: 'JWT secret regenerated',
            details: { action: 'jwt_secret_generation' }
        });
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: 'JWT secret generated successfully', secret: newSecret })
        };
    } catch (error) {
        console.error('Error generating JWT secret:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, message: 'Failed to generate JWT secret' })
        };
    }
}

// Test database connection
async function testDatabaseConnection(supabaseUrl, supabaseKey) {
    if (!supabaseUrl || !supabaseKey) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, message: 'Supabase URL and key are required' })
        };
    }

    try {
        // Test connection with provided credentials
        const testSupabase = createClient(supabaseUrl, supabaseKey);
        const { data, error } = await testSupabase
            .from('admin_settings')
            .select('setting_key')
            .limit(1);

        if (error) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: false, message: 'Database connection failed: ' + error.message })
            };
        }
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: 'Database connection successful' })
        };
    } catch (error) {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: false, message: 'Database connection failed: ' + error.message })
        };
    }
}

// Get system information from Supabase
async function getSystemInfo(supabase) {
    try {
        // Get system settings from database
        const { data: settings, error } = await supabase
            .from('admin_settings')
            .select('setting_key, setting_value, updated_at');

        if (error) {
            console.error('Error fetching system settings:', error);
        }

        // Get device count
        const { count: deviceCount } = await supabase
            .from('devices')
            .select('*', { count: 'exact', head: true });

        // Get active script info
        const { data: activeScript } = await supabase
            .from('script_updates')
            .select('version, created_at')
            .eq('is_active', true)
            .single();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                systemInfo: {
                    version: activeScript?.version || '1.0.0',
                    uptime: process.uptime(),
                    nodeVersion: process.version,
                    platform: process.platform,
                    memoryUsage: process.memoryUsage(),
                    environment: process.env.NODE_ENV || 'production',
                    deviceCount: deviceCount || 0,
                    lastScriptUpdate: activeScript?.created_at,
                    settings: settings || []
                }
            })
        };
    } catch (error) {
        console.error('Error getting system info:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, message: 'Failed to get system information' })
        };
    }
}

// Verify token
function verifyToken(token, secret) {
    try {
        return jwt.verify(token, secret);
    } catch (error) {
        return null;
    }
}

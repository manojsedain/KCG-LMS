// netlify/functions/resetAdminPassword.js - Reset admin password in database
let bcrypt = null;

// Try to load bcrypt with fallback
try {
    bcrypt = require('bcryptjs');
} catch (error) {
    console.log('bcryptjs not available');
    bcrypt = null;
}

// Try to load Supabase
let db = null;
try {
    const supabaseModule = require('../../utils/supabase');
    db = supabaseModule.db;
} catch (error) {
    console.log('Supabase not configured');
    db = null;
}

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
        // Parse request body
        const { newPassword, confirmPassword, resetKey } = JSON.parse(event.body);

        // Security check - require a reset key
        if (resetKey !== 'RESET_ADMIN_2025') {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Invalid reset key' 
                })
            };
        }

        // Validate passwords
        if (!newPassword || !confirmPassword) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Both passwords are required' 
                })
            };
        }

        if (newPassword !== confirmPassword) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Passwords do not match' 
                })
            };
        }

        if (!db) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Database not available' 
                })
            };
        }

        // Hash the new password
        let hashedPassword = newPassword;
        if (bcrypt) {
            hashedPassword = await bcrypt.hash(newPassword, 12);
            console.log('Password hashed with bcrypt');
        } else {
            console.log('Using plain text password (bcrypt not available)');
        }

        // Update the admin password in database directly
        try {
            // Try to load Supabase client directly
            const { createClient } = require('@supabase/supabase-js');
            const supabaseUrl = process.env.SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            
            if (!supabaseUrl || !supabaseKey) {
                throw new Error('Supabase credentials not available');
            }
            
            const supabase = createClient(supabaseUrl, supabaseKey);
            
            // Direct update to admin_settings table
            const { error } = await supabase
                .from('admin_settings')
                .upsert({
                    setting_key: 'admin_password',
                    setting_value: hashedPassword,
                    setting_type: 'string',
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'setting_key'
                });
            
            if (error) {
                console.error('Direct update error:', error);
                throw error;
            }
            
            console.log('Admin password updated successfully via direct update');
        } catch (directError) {
            console.error('Direct update failed, trying setSetting:', directError);
            // Fallback to setSetting if direct update fails
            if (db && db.setSetting) {
                await db.setSetting('admin_password', hashedPassword, 'string');
                console.log('Admin password updated successfully via setSetting');
            } else {
                throw new Error('Unable to update password: ' + directError.message);
            }
        }

        // Log the password reset
        try {
            await db.createLog({
                log_type: 'admin',
                level: 'info',
                message: 'Admin password reset via reset function',
                details: {
                    ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
                    user_agent: event.headers['user-agent']
                },
                ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
            });
        } catch (logError) {
            console.log('Could not log password reset:', logError.message);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Admin password reset successfully'
            })
        };

    } catch (error) {
        console.error('Password reset error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Password reset failed',
                error: error.message
            })
        };
    }
};

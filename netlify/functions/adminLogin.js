// netlify/functions/adminLogin.js - Admin authentication
const EncryptionUtils = require('../../utils/encryption');

// Try to load Supabase, but provide fallback if not configured
let db = null;
try {
    const supabaseModule = require('../../utils/supabase');
    db = supabaseModule.db;
} catch (error) {
    console.log('Supabase not configured, using fallback mode');
    // Fallback database functions
    db = {
        async getSetting(key) {
            // Return default admin password for demo
            if (key === 'admin_password') {
                return 'manakamana12';
            }
            return null;
        },
        async setSetting(key, value, type) {
            // In fallback mode, just log the action
            console.log(`Setting ${key} = ${value} (${type})`);
        },
        async createLog(logData) {
            // In fallback mode, just log to console
            console.log('Log:', logData);
        }
    };
}

// Configuration
const CONFIG = {
    JWT_SECRET: process.env.JWT_SECRET || 'your-jwt-secret-key',
    SESSION_DURATION: 24 * 60 * 60 // 24 hours in seconds
};

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
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
        const { password, action = 'login' } = JSON.parse(event.body);

        if (action === 'login') {
            // Validate required fields
            if (!password) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        message: 'Password is required' 
                    })
                };
            }

            // Get stored admin password hash
            const storedPasswordData = await db.getSetting('admin_password');
            
            // For backward compatibility, check if it's a plain text password
            let isValidPassword = false;
            if (storedPasswordData && storedPasswordData.startsWith('$2b$')) {
                // It's a bcrypt hash
                const bcrypt = require('bcryptjs');
                isValidPassword = await bcrypt.compare(password, storedPasswordData);
            } else {
                // Fallback to plain text comparison (not recommended for production)
                const plainPassword = storedPasswordData || 'manakamana12';
                isValidPassword = password === plainPassword;
                
                // If login is successful with plain text, hash it for future use
                if (isValidPassword) {
                    const bcrypt = require('bcryptjs');
                    const hashedPassword = await bcrypt.hash(password, 12);
                    await db.setSetting('admin_password', hashedPassword, 'string');
                }
            }

            if (!isValidPassword) {
                await db.createLog({
                    log_type: 'security',
                    level: 'warn',
                    message: 'Failed admin login attempt',
                    details: {
                        ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
                        user_agent: event.headers['user-agent']
                    },
                    ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
                });

                return {
                    statusCode: 401,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        message: 'Invalid admin password' 
                    })
                };
            }

            // Generate admin session token
            const sessionToken = EncryptionUtils.createToken(
                {
                    type: 'admin_session',
                    ip: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
                    userAgent: event.headers['user-agent']
                },
                CONFIG.JWT_SECRET,
                CONFIG.SESSION_DURATION
            );

            // Log successful admin login
            await db.createLog({
                log_type: 'admin',
                level: 'info',
                message: 'Admin login successful',
                details: {
                    ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
                    user_agent: event.headers['user-agent']
                },
                ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    token: sessionToken,
                    expiresIn: CONFIG.SESSION_DURATION,
                    message: 'Admin login successful'
                })
            };

        } else if (action === 'verify') {
            // Verify existing session token
            const { token } = JSON.parse(event.body);
            
            if (!token) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        message: 'Token is required' 
                    })
                };
            }

            const payload = EncryptionUtils.verifyToken(token, CONFIG.JWT_SECRET);
            
            if (!payload || payload.type !== 'admin_session') {
                return {
                    statusCode: 401,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        message: 'Invalid or expired token' 
                    })
                };
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    valid: true,
                    expiresAt: payload.exp
                })
            };

        } else if (action === 'changePassword') {
            // Change admin password
            const { currentPassword, newPassword, token } = JSON.parse(event.body);
            
            if (!token || !currentPassword || !newPassword) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        message: 'Missing required fields' 
                    })
                };
            }

            // Verify admin session
            const payload = EncryptionUtils.verifyToken(token, CONFIG.JWT_SECRET);
            if (!payload || payload.type !== 'admin_session') {
                return {
                    statusCode: 401,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        message: 'Invalid or expired session' 
                    })
                };
            }

            // Verify current password
            const storedPasswordData = await db.getSetting('admin_password');
            let isValidCurrentPassword = false;
            
            if (storedPasswordData && storedPasswordData.startsWith('$2b$')) {
                const bcrypt = require('bcryptjs');
                isValidCurrentPassword = await bcrypt.compare(currentPassword, storedPasswordData);
            } else {
                const plainPassword = storedPasswordData || 'manakamana12';
                isValidCurrentPassword = currentPassword === plainPassword;
            }

            if (!isValidCurrentPassword) {
                await db.createLog({
                    log_type: 'security',
                    level: 'warn',
                    message: 'Failed password change attempt - wrong current password',
                    details: {
                        ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
                    },
                    ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
                });

                return {
                    statusCode: 401,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        message: 'Current password is incorrect' 
                    })
                };
            }

            // Hash and save new password
            const bcrypt = require('bcryptjs');
            const hashedNewPassword = await bcrypt.hash(newPassword, 12);
            await db.setSetting('admin_password', hashedNewPassword, 'string');

            // Log password change
            await db.createLog({
                log_type: 'admin',
                level: 'info',
                message: 'Admin password changed',
                details: {
                    ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
                },
                ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
            });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Password changed successfully'
                })
            };

        } else {
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
        console.error('Admin login error:', error);

        await db.createLog({
            log_type: 'error',
            level: 'error',
            message: 'Admin login function error',
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

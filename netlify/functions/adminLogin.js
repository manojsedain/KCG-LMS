// netlify/functions/adminLogin.js - Admin authentication
let EncryptionUtils = null;
let bcrypt = null;

// Try to load dependencies with fallbacks
try {
    EncryptionUtils = require('../../utils/encryption');
} catch (error) {
    console.log('EncryptionUtils not available, using fallback');
    // Fallback EncryptionUtils
    EncryptionUtils = {
        verifyToken: (token, secret) => {
            try {
                const [headerEncoded, payloadEncoded, signature] = token.split('.');
                if (!headerEncoded || !payloadEncoded || !signature) return null;
                const payload = JSON.parse(Buffer.from(payloadEncoded, 'base64').toString());
                if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
                return payload;
            } catch { return null; }
        },
        createToken: (payload, secret, expiresIn = 3600) => {
            const tokenPayload = {
                ...payload,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + expiresIn
            };
            const payloadEncoded = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');
            return `header.${payloadEncoded}.signature`;
        }
    };
}

// Try to load bcrypt with fallback
try {
    bcrypt = require('bcryptjs');
} catch (error) {
    console.log('bcryptjs not available, using plain text comparison');
    bcrypt = null;
}

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
                return process.env.ADMIN_PASSWORD || 'manakamana12';
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

            // Get stored admin password hash with fallback
            let storedPasswordData = null;
            try {
                storedPasswordData = await db.getSetting('admin_password');
                console.log('Retrieved from database:', storedPasswordData ? 'password found' : 'no password');
            } catch (error) {
                console.log('Database error, using environment fallback:', error.message);
                storedPasswordData = process.env.ADMIN_PASSWORD || 'manakamana12';
                console.log('Using environment fallback:', storedPasswordData ? 'env var found' : 'using default');
            }
            
            // For backward compatibility, check if it's a plain text password
            let isValidPassword = false;
            // Check if stored password is a bcrypt hash (supports $2a$, $2b$, $2x$, $2y$ formats)
            const isBcryptHash = storedPasswordData && /^\$2[abxy]\$/.test(storedPasswordData);
            
            console.log('Password comparison debug:', {
                inputPasswordLength: password ? password.length : 0,
                storedPasswordExists: !!storedPasswordData,
                storedPasswordType: isBcryptHash ? 'bcrypt' : 'plaintext',
                storedPasswordPrefix: storedPasswordData ? storedPasswordData.substring(0, 10) : 'none',
                bcryptAvailable: !!bcrypt,
                envPassword: process.env.ADMIN_PASSWORD ? 'set' : 'not set'
            });
            
            if (bcrypt && storedPasswordData && /^\$2[abxy]\$/.test(storedPasswordData)) {
                // It's a bcrypt hash and bcrypt is available
                console.log('Using bcrypt comparison');
                try {
                    isValidPassword = await bcrypt.compare(password, storedPasswordData);
                    console.log('Bcrypt comparison result:', isValidPassword);
                } catch (error) {
                    console.log('Bcrypt error, falling back to plain text:', error.message);
                    const fallbackPassword = process.env.ADMIN_PASSWORD || 'manakamana12';
                    isValidPassword = password === fallbackPassword;
                    console.log('Fallback comparison result:', isValidPassword, 'comparing with:', fallbackPassword);
                }
            } else {
                // Fallback to plain text comparison
                const plainPassword = storedPasswordData || process.env.ADMIN_PASSWORD || 'manakamana12';
                console.log('Using plain text comparison with:', plainPassword);
                isValidPassword = password === plainPassword;
                console.log('Plain text comparison result:', isValidPassword);
                
                // If login is successful with plain text and bcrypt is available, hash it for future use
                if (isValidPassword && bcrypt) {
                    try {
                        const hashedPassword = await bcrypt.hash(password, 12);
                        await db.setSetting('admin_password', hashedPassword, 'string');
                        console.log('Password hashed and stored for future use');
                    } catch (error) {
                        console.log('Could not hash password for future use:', error.message);
                    }
                }
            }

            if (!isValidPassword) {
                try {
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
                } catch (logError) {
                    console.log('Could not log failed login attempt:', logError.message);
                }

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
            try {
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
            } catch (logError) {
                console.log('Could not log successful login:', logError.message);
            }

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
            let storedPasswordData = null;
            try {
                storedPasswordData = await db.getSetting('admin_password');
            } catch (error) {
                console.log('Database error, using environment fallback:', error.message);
                storedPasswordData = process.env.ADMIN_PASSWORD || 'manakamana12';
            }
            
            let isValidCurrentPassword = false;
            
            if (bcrypt && storedPasswordData && storedPasswordData.startsWith('$2b$')) {
                try {
                    isValidCurrentPassword = await bcrypt.compare(currentPassword, storedPasswordData);
                } catch (error) {
                    console.log('Bcrypt error, falling back to plain text:', error.message);
                    isValidCurrentPassword = currentPassword === (process.env.ADMIN_PASSWORD || 'manakamana12');
                }
            } else {
                const plainPassword = storedPasswordData || process.env.ADMIN_PASSWORD || 'manakamana12';
                isValidCurrentPassword = currentPassword === plainPassword;
            }

            if (!isValidCurrentPassword) {
                try {
                    await db.createLog({
                        log_type: 'security',
                        level: 'warn',
                        message: 'Failed password change attempt - wrong current password',
                        details: {
                            ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
                        },
                        ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
                    });
                } catch (logError) {
                    console.log('Could not log failed password change:', logError.message);
                }

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
            let hashedNewPassword = newPassword;
            if (bcrypt) {
                try {
                    hashedNewPassword = await bcrypt.hash(newPassword, 12);
                } catch (error) {
                    console.log('Could not hash new password:', error.message);
                }
            }
            
            try {
                await db.setSetting('admin_password', hashedNewPassword, 'string');
            } catch (error) {
                console.log('Could not save new password:', error.message);
            }

            // Log password change
            try {
                await db.createLog({
                    log_type: 'admin',
                    level: 'info',
                    message: 'Admin password changed',
                    details: {
                        ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
                    },
                    ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
                });
            } catch (logError) {
                console.log('Could not log password change:', logError.message);
            }

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

        try {
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
        } catch (logError) {
            console.log('Could not log admin login error:', logError.message);
        }

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

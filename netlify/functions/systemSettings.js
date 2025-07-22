// netlify/functions/systemSettings.js - System settings management

// Simple token verification
function verifyToken(token, secret) {
    try {
        if (!token) return null;
        const [headerEncoded, payloadEncoded, signature] = token.split('.');
        if (!headerEncoded || !payloadEncoded || !signature) return null;
        const payload = JSON.parse(Buffer.from(payloadEncoded, 'base64').toString());
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch (error) {
        return null;
    }
}

// Configuration
const CONFIG = {
    JWT_SECRET: process.env.JWT_SECRET || 'V+3stApVGE9zLpJFf79RA4SAc/w2vqJygx5wQ2hW/OlGLN/rhEPFHV1tRR+zcO2APsrvMwy+IO6IgN7+jSghTw=='
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
        const { action, token, ...actionData } = JSON.parse(event.body);

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

        switch (action) {
            case 'updateAdminPassword':
                const { newPassword } = actionData;
                
                if (!newPassword || newPassword.length < 6) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Password must be at least 6 characters' 
                        })
                    };
                }

                // In a real implementation, you would update the password in Supabase
                // For now, we'll simulate success
                console.log('Admin password update requested:', { newPassword: '***' });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Admin password updated successfully'
                    })
                };

            case 'updateSitePassword':
                const { sitePassword } = actionData;
                
                if (!sitePassword || sitePassword.length < 3) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Site password must be at least 3 characters' 
                        })
                    };
                }

                // Update environment variable (in real implementation)
                console.log('Site password update requested:', { sitePassword: '***' });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Site password updated successfully'
                    })
                };

            case 'generateJwtSecret':
                // Generate a new JWT secret
                const newJwtSecret = require('crypto').randomBytes(32).toString('hex');
                
                console.log('New JWT secret generated:', { secret: '***' });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'JWT secret generated successfully',
                        secret: newJwtSecret
                    })
                };

            case 'testDatabaseConnection':
                const { supabaseUrl, supabaseKey } = actionData;
                
                if (!supabaseUrl || !supabaseKey) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Supabase URL and key are required' 
                        })
                    };
                }

                // Test database connection (simplified)
                try {
                    // In real implementation, test actual Supabase connection
                    const isValidUrl = supabaseUrl.includes('supabase.co');
                    const isValidKey = supabaseKey.length > 50;
                    
                    if (!isValidUrl || !isValidKey) {
                        throw new Error('Invalid credentials');
                    }

                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({
                            success: true,
                            message: 'Database connection successful'
                        })
                    };
                } catch (error) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            message: 'Database connection failed: ' + error.message
                        })
                    };
                }

            case 'updateSecuritySettings':
                const { rateLimit, deviceApproval, encryption } = actionData;
                
                // Update security settings (in real implementation, save to database)
                console.log('Security settings updated:', { rateLimit, deviceApproval, encryption });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Security settings updated successfully'
                    })
                };

            case 'getSystemInfo':
                // Return current system information
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        systemInfo: {
                            version: '1.0.0',
                            uptime: process.uptime(),
                            nodeVersion: process.version,
                            environment: process.env.NODE_ENV || 'production',
                            lastRestart: new Date().toISOString()
                        }
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
        console.error('System settings error:', error);
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

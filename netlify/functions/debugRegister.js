// netlify/functions/debugRegister.js - Debug registerDevice issues

const { createClient } = require('@supabase/supabase-js');

// Configuration
const CONFIG = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
};

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'false',
    'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        console.log('Debug - Environment check:');
        console.log('SUPABASE_URL exists:', !!CONFIG.SUPABASE_URL);
        console.log('SUPABASE_SERVICE_ROLE_KEY exists:', !!CONFIG.SUPABASE_SERVICE_ROLE_KEY);
        
        if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_SERVICE_ROLE_KEY) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Missing environment variables',
                    debug: {
                        hasUrl: !!CONFIG.SUPABASE_URL,
                        hasKey: !!CONFIG.SUPABASE_SERVICE_ROLE_KEY
                    }
                })
            };
        }

        // Test Supabase connection
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);
        
        console.log('Debug - Testing Supabase connection...');
        const { data: testData, error: testError } = await supabase
            .from('admin_settings')
            .select('setting_key')
            .limit(1);

        if (testError) {
            console.error('Debug - Supabase connection failed:', testError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Database connection failed',
                    error: testError.message
                })
            };
        }

        console.log('Debug - Supabase connection successful');

        // Test AES key generation
        try {
            console.log('Debug - Testing AES key generation...');
            const { data: aesData, error: aesError } = await supabase
                .rpc('generate_aes_key');
            
            if (aesError) {
                console.error('Debug - AES RPC failed:', aesError);
                // Test fallback
                const crypto = require('crypto');
                const fallbackKey = crypto.randomBytes(32).toString('base64');
                console.log('Debug - Fallback AES key generated successfully');
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ 
                        success: true, 
                        message: 'Debug complete - AES fallback works',
                        aesRpcError: aesError.message,
                        fallbackKey: fallbackKey.substring(0, 10) + '...'
                    })
                };
            } else {
                console.log('Debug - AES RPC successful');
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ 
                        success: true, 
                        message: 'Debug complete - all systems working',
                        aesKey: aesData.substring(0, 10) + '...'
                    })
                };
            }
        } catch (aesException) {
            console.error('Debug - AES generation exception:', aesException);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'AES generation failed',
                    error: aesException.message
                })
            };
        }

    } catch (error) {
        console.error('Debug - General error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Debug failed: ' + error.message,
                stack: error.stack
            })
        };
    }
};

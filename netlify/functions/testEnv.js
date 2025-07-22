// netlify/functions/testEnv.js - Test environment variable access
exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Only allow GET requests
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ success: false, message: 'Method not allowed' })
        };
    }

    try {
        // Test environment variable access
        const adminPassword = process.env.ADMIN_PASSWORD;
        const sitePassword = process.env.SITE_PASSWORD;
        const supabaseUrl = process.env.SUPABASE_URL;

        console.log('Environment variable test:', {
            adminPasswordExists: !!adminPassword,
            adminPasswordLength: adminPassword ? adminPassword.length : 0,
            sitePasswordExists: !!sitePassword,
            supabaseUrlExists: !!supabaseUrl,
            nodeEnv: process.env.NODE_ENV
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                envTest: {
                    adminPasswordExists: !!adminPassword,
                    adminPasswordLength: adminPassword ? adminPassword.length : 0,
                    sitePasswordExists: !!sitePassword,
                    supabaseUrlExists: !!supabaseUrl,
                    nodeEnv: process.env.NODE_ENV,
                    // Don't return actual values for security
                    message: 'Environment variables checked'
                }
            })
        };
    } catch (error) {
        console.error('Environment test error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                message: 'Environment test failed',
                error: error.message
            })
        };
    }
};

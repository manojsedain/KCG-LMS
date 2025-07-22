// netlify/functions/debugPassword.js - Temporary password debugging function
let bcrypt = null;

// Try to load bcrypt
try {
    bcrypt = require('bcryptjs');
} catch (error) {
    console.log('bcryptjs not available');
}

// Try to load Supabase
let db = null;
try {
    const supabaseModule = require('../../utils/supabase');
    db = supabaseModule.db;
} catch (error) {
    console.log('Supabase not configured');
}

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

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
        const { testPassword, debugKey } = JSON.parse(event.body);
        
        // Security check
        if (debugKey !== 'DEBUG_PASSWORD_2025') {
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ success: false, message: 'Unauthorized' })
            };
        }

        const debugInfo = {
            bcryptAvailable: !!bcrypt,
            dbAvailable: !!db,
            envPassword: process.env.ADMIN_PASSWORD ? 'set' : 'not set',
            envPasswordValue: process.env.ADMIN_PASSWORD, // Temporary for debugging
            testPassword: testPassword
        };

        // Get stored password from database
        let storedPasswordData = null;
        if (db) {
            try {
                storedPasswordData = await db.getSetting('admin_password');
                debugInfo.storedPasswordExists = !!storedPasswordData;
                debugInfo.storedPasswordType = storedPasswordData && storedPasswordData.startsWith('$2b$') ? 'bcrypt' : 'plaintext';
                debugInfo.storedPasswordLength = storedPasswordData ? storedPasswordData.length : 0;
                debugInfo.storedPasswordPrefix = storedPasswordData ? storedPasswordData.substring(0, 10) + '...' : 'none';
            } catch (error) {
                debugInfo.databaseError = error.message;
            }
        }

        // Test password comparison if test password provided
        if (testPassword && storedPasswordData && bcrypt) {
            try {
                if (storedPasswordData.startsWith('$2b$')) {
                    debugInfo.bcryptComparisonResult = await bcrypt.compare(testPassword, storedPasswordData);
                } else {
                    debugInfo.plaintextComparisonResult = testPassword === storedPasswordData;
                }
            } catch (error) {
                debugInfo.comparisonError = error.message;
            }
        }

        // Test bcrypt hash generation
        if (testPassword && bcrypt) {
            try {
                const testHash = await bcrypt.hash(testPassword, 12);
                debugInfo.testHashGenerated = testHash.substring(0, 20) + '...';
                debugInfo.testHashComparison = await bcrypt.compare(testPassword, testHash);
            } catch (error) {
                debugInfo.hashGenerationError = error.message;
            }
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                debugInfo: debugInfo
            })
        };

    } catch (error) {
        console.error('Debug password error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                message: 'Debug failed',
                error: error.message
            })
        };
    }
};

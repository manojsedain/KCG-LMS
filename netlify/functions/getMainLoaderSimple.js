// Simplified getMainLoader for testing - no external dependencies
exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/javascript'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, message: 'Method not allowed' })
        };
    }

    try {
        // Parse request body
        const requestBody = JSON.parse(event.body || '{}');
        const { username, hwid, fingerprint } = requestBody;

        // Basic validation
        if (!username || !hwid || !fingerprint) {
            return {
                statusCode: 400,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Missing required fields: username, hwid, fingerprint' 
                })
            };
        }

        // Return a simple test script for now
        const testScript = `
// Test LMS AI Assistant Main Script
(function() {
    'use strict';
    
    console.log('🎉 LMS AI Assistant Main Script loaded successfully!');
    console.log('User: ${username}');
    console.log('Device validated and script delivered');
    
    // Show success notification
    const notification = document.createElement('div');
    notification.innerHTML = \`
        <div style="
            position: fixed;
            top: 80px;
            right: 20px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            max-width: 300px;
        ">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 18px; margin-right: 8px;">🎉</span>
                <strong>LMS AI Assistant</strong>
            </div>
            <div style="font-size: 12px; opacity: 0.9;">
                Main script loaded successfully!<br>
                User: ${username}
            </div>
        </div>
    \`;
    
    document.body.appendChild(notification);
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
    
})();
`;

        return {
            statusCode: 200,
            headers,
            body: testScript
        };

    } catch (error) {
        console.error('getMainLoader error:', error);
        return {
            statusCode: 500,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                success: false, 
                message: 'Internal server error: ' + error.message 
            })
        };
    }
};

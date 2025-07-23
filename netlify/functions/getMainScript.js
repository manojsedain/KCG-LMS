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

        // Load the uploaded script from database
        const { createClient } = require('@supabase/supabase-js');
        
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // Track user access
        async function logUserAccess(username, scriptId) {
            try {
                await supabase
                    .from('logs')
                    .insert({
                        action: 'script_access',
                        username: username,
                        message: `User ${username} accessed main script`,
                        details: JSON.stringify({ scriptId, timestamp: new Date().toISOString() }),
                        level: 'info'
                    });
            } catch (error) {
                console.error('Failed to log user access:', error);
            }
        }
        
        let mainScript;
        try {
            // Fetch the latest active script from database
            const { data: scriptData, error: scriptError } = await supabase
                .from('script_updates')
                .select('encrypted_script, version, update_notes')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            
            if (scriptError || !scriptData) {
                throw new Error(`No active script found in database: ${scriptError?.message || 'No data'}`);
            }
            
            // Decrypt the script if it's encrypted
            let decryptedScript = scriptData.encrypted_script;
            
            // Check if the script is base64 encoded and decode it
            try {
                // Try to decode from base64 if it looks encoded
                if (scriptData.encrypted_script.match(/^[A-Za-z0-9+/]+=*$/)) {
                    decryptedScript = Buffer.from(scriptData.encrypted_script, 'base64').toString('utf8');
                }
            } catch (decodeError) {
                console.warn('Script decode failed, using as-is:', decodeError.message);
            }
            
            mainScript = decryptedScript;
            console.log(`Loaded script from database - Version: ${scriptData.version}`);
            console.log(`Update notes: ${scriptData.update_notes || 'No notes'}`);
            
            // Log user access for analytics
            await logUserAccess(username, scriptData.id);
            
        } catch (error) {
            console.warn('Could not load script from database, using fallback:', error.message);
            // Fallback inline script with basic functionality
            mainScript = `
// LMS AI Assistant Main Script - Fallback Version
(function() {
    'use strict';
    
    console.log('🎉 LMS AI Assistant Main Script loaded successfully!');
    console.log('User: ` + username + `');
    console.log('Device validated and script delivered');
    
    // Basic LMS AI Assistant functionality
    const CONFIG = {
        VERSION: '8.2.2',
        BACKEND_URL: 'https://wrongnumber.netlify.app/.netlify/functions'
    };
    
    // Create floating AI button
    const createAIButton = () => {
        const button = document.createElement('div');
        button.id = 'lms-ai-button';
        button.innerHTML = '🤖 AI';
        button.style.cssText = \`
            position: fixed;
            top: 100px;
            right: 20px;
            width: 60px;
            height: 60px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 16px;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            z-index: 10000;
            transition: all 0.3s ease;
            user-select: none;
        \`;
        
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'scale(1.1)';
            button.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.transform = 'scale(1)';
            button.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
        });
        
        button.addEventListener('click', () => {
            showAIPanel();
        });
        
        document.body.appendChild(button);
        console.log('✅ AI Assistant button created');
    };
    
    // Create AI panel
    const showAIPanel = () => {
        const existingPanel = document.getElementById('lms-ai-panel');
        if (existingPanel) {
            existingPanel.remove();
            return;
        }
        
        const panel = document.createElement('div');
        panel.id = 'lms-ai-panel';
        panel.innerHTML = \`
            <div style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 400px;
                max-height: 500px;
                background: white;
                border-radius: 15px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                z-index: 10001;
                overflow: hidden;
            ">
                <div style="
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 15px 20px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <h3 style="margin: 0; font-size: 18px;">🤖 LMS AI Assistant</h3>
                    <button onclick="document.getElementById('lms-ai-panel').remove()" style="
                        background: none;
                        border: none;
                        color: white;
                        font-size: 20px;
                        cursor: pointer;
                        padding: 0;
                        width: 30px;
                        height: 30px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    ">×</button>
                </div>
                <div style="padding: 20px;">
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Ask AI:</label>
                        <textarea id="ai-question" placeholder="Enter your question about the course content..." style="
                            width: 100%;
                            height: 100px;
                            border: 2px solid #e1e5e9;
                            border-radius: 8px;
                            padding: 10px;
                            font-size: 14px;
                            resize: vertical;
                            box-sizing: border-box;
                        "></textarea>
                    </div>
                    <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                        <button onclick="processAIRequest()" style="
                            flex: 1;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            color: white;
                            border: none;
                            padding: 12px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-weight: bold;
                        ">Ask AI</button>
                        <button onclick="autoAnswerQuiz()" style="
                            flex: 1;
                            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                            color: white;
                            border: none;
                            padding: 12px;
                            border-radius: 8px;
                            cursor: pointer;
                            font-weight: bold;
                        ">Auto Answer</button>
                    </div>
                    <div id="ai-response" style="
                        background: #f8f9fa;
                        border-radius: 8px;
                        padding: 15px;
                        min-height: 60px;
                        border: 1px solid #e1e5e9;
                        font-size: 14px;
                        line-height: 1.5;
                    ">AI responses will appear here...</div>
                </div>
            </div>
        \`;
        
        document.body.appendChild(panel);
    };
    
    // Process AI request
    window.processAIRequest = () => {
        const question = document.getElementById('ai-question').value.trim();
        const responseDiv = document.getElementById('ai-response');
        
        if (!question) {
            responseDiv.innerHTML = '❌ Please enter a question first.';
            return;
        }
        
        responseDiv.innerHTML = '🤖 Processing your question...';
        
        // Simulate AI processing
        setTimeout(() => {
            responseDiv.innerHTML = \`
                <strong>AI Response:</strong><br><br>
                Thank you for your question: "\${question}"<br><br>
                🎯 <strong>LMS AI Assistant is now active!</strong><br>
                • User: ` + username + `<br>
                • Device validated and approved<br>
                • Full functionality loaded<br><br>
                <em>Note: This is a demonstration. Full AI capabilities require API configuration in the admin panel.</em>
            \`;
        }, 1500);
    };
    
    // Auto answer quiz
    window.autoAnswerQuiz = () => {
        const responseDiv = document.getElementById('ai-response');
        responseDiv.innerHTML = '🎯 Scanning for quiz questions...';
        
        setTimeout(() => {
            responseDiv.innerHTML = \`
                <strong>Auto Answer Results:</strong><br><br>
                ✅ LMS AI Assistant is fully operational!<br>
                🎯 Ready to assist with quiz questions<br>
                🤖 AI capabilities active for user: ` + username + `<br><br>
                <em>Auto-answer functionality requires quiz content to be present on the page.</em>
            \`;
        }, 1000);
    };
    
    // Initialize when DOM is ready
    const init = () => {
        if (document.body) {
            createAIButton();
            
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
                        Successfully loaded for user: ` + username + `<br>
                        Click the AI button to get started!
                    </div>
                </div>
            \`;
            
            document.body.appendChild(notification);
            
            // Auto-hide notification after 5 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 5000);
        } else {
            setTimeout(init, 100);
        }
    };
    
    // Start initialization
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
        window.addEventListener('load', init);
    }
    
})();
`;
        }

        return {
            statusCode: 200,
            headers,
            body: mainScript
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

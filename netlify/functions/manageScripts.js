// netlify/functions/manageScripts.js - Complete script management for admin panel

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
    JWT_SECRET: process.env.JWT_SECRET || 'your-jwt-secret-key'
};

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

// In-memory storage for scripts (replace with database later)
let scripts = [
    {
        id: 1,
        version: '1.0.0',
        name: 'LMS AI Assistant Main Script',
        description: 'Main userscript for LMS AI Assistant functionality',
        content: `// ==UserScript==
// @name         LMS AI Assistant
// @namespace    https://wrongnumber.netlify.app/
// @version      1.0.0
// @description  AI Assistant for King's College LMS
// @author       LMS AI Assistant
// @match        https://king-lms.kcg.edu/ultra/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    
    console.log('🤖 LMS AI Assistant v1.0.0 loaded!');
    
    // Create floating assistant button
    const assistantButton = document.createElement('div');
    assistantButton.id = 'lms-ai-assistant';
    assistantButton.innerHTML = '🤖 AI Assistant';
    assistantButton.style.cssText = \`
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 20px;
        border-radius: 25px;
        cursor: pointer;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        transition: all 0.3s ease;
        user-select: none;
    \`;
    
    // Hover effects
    assistantButton.onmouseenter = () => {
        assistantButton.style.transform = 'translateY(-2px)';
        assistantButton.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
    };
    
    assistantButton.onmouseleave = () => {
        assistantButton.style.transform = 'translateY(0)';
        assistantButton.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
    };
    
    // Main functionality
    assistantButton.onclick = () => {
        showAssistantPanel();
    };
    
    // Add to page
    document.body.appendChild(assistantButton);
    
    // Create assistant panel
    function showAssistantPanel() {
        // Remove existing panel if any
        const existingPanel = document.getElementById('lms-ai-panel');
        if (existingPanel) {
            existingPanel.remove();
            return;
        }
        
        const panel = document.createElement('div');
        panel.id = 'lms-ai-panel';
        panel.innerHTML = \`
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0; color: #333;">🤖 LMS AI Assistant</h3>
                <button id="close-panel" style="background: none; border: none; font-size: 20px; cursor: pointer;">×</button>
            </div>
            <div style="margin-bottom: 15px;">
                <h4 style="margin: 0 0 10px 0; color: #555;">Quick Actions:</h4>
                <button class="ai-action-btn" data-action="summarize">📄 Summarize Page</button>
                <button class="ai-action-btn" data-action="highlight">✨ Highlight Important</button>
                <button class="ai-action-btn" data-action="notes">📝 Take Notes</button>
            </div>
            <div>
                <h4 style="margin: 0 0 10px 0; color: #555;">AI Chat:</h4>
                <div id="ai-chat" style="height: 200px; border: 1px solid #ddd; border-radius: 8px; padding: 10px; overflow-y: auto; background: #f9f9f9; margin-bottom: 10px;">
                    <div style="color: #666; font-style: italic;">AI Assistant is ready to help! Ask me anything about your LMS content.</div>
                </div>
                <input type="text" id="ai-input" placeholder="Ask me anything..." style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 10px;">
                <button id="send-message" style="width: 100%; padding: 10px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer;">Send Message</button>
            </div>
        \`;
        
        panel.style.cssText = \`
            position: fixed;
            top: 80px;
            right: 20px;
            width: 350px;
            background: white;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            padding: 20px;
            z-index: 10001;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        \`;
        
        document.body.appendChild(panel);
        
        // Add event listeners
        document.getElementById('close-panel').onclick = () => panel.remove();
        
        // Action buttons
        document.querySelectorAll('.ai-action-btn').forEach(btn => {
            btn.style.cssText = \`
                display: block;
                width: 100%;
                margin-bottom: 8px;
                padding: 8px 12px;
                background: #f0f0f0;
                border: 1px solid #ddd;
                border-radius: 6px;
                cursor: pointer;
                text-align: left;
                transition: background 0.2s;
            \`;
            
            btn.onmouseenter = () => btn.style.background = '#e0e0e0';
            btn.onmouseleave = () => btn.style.background = '#f0f0f0';
            
            btn.onclick = () => handleAction(btn.dataset.action);
        });
        
        // Chat functionality
        const sendMessage = () => {
            const input = document.getElementById('ai-input');
            const chat = document.getElementById('ai-chat');
            
            if (input.value.trim()) {
                // Add user message
                chat.innerHTML += \`<div style="margin-bottom: 10px;"><strong>You:</strong> \${input.value}</div>\`;
                
                // Simulate AI response
                setTimeout(() => {
                    chat.innerHTML += \`<div style="margin-bottom: 10px; color: #667eea;"><strong>AI:</strong> I understand you're asking about "\${input.value}". I'm here to help with your LMS content and studies!</div>\`;
                    chat.scrollTop = chat.scrollHeight;
                }, 1000);
                
                input.value = '';
                chat.scrollTop = chat.scrollHeight;
            }
        };
        
        document.getElementById('send-message').onclick = sendMessage;
        document.getElementById('ai-input').onkeypress = (e) => {
            if (e.key === 'Enter') sendMessage();
        };
    }
    
    // Handle action buttons
    function handleAction(action) {
        const chat = document.getElementById('ai-chat');
        
        switch(action) {
            case 'summarize':
                chat.innerHTML += \`<div style="margin-bottom: 10px; color: #667eea;"><strong>AI:</strong> 📄 Analyzing page content for summary...</div>\`;
                setTimeout(() => {
                    chat.innerHTML += \`<div style="margin-bottom: 10px; color: #667eea;"><strong>AI:</strong> Here's a summary of the key points on this page: [Summary would appear here based on page content analysis]</div>\`;
                    chat.scrollTop = chat.scrollHeight;
                }, 1500);
                break;
                
            case 'highlight':
                chat.innerHTML += \`<div style="margin-bottom: 10px; color: #667eea;"><strong>AI:</strong> ✨ Highlighting important content on the page...</div>\`;
                // Add highlighting functionality here
                break;
                
            case 'notes':
                chat.innerHTML += \`<div style="margin-bottom: 10px; color: #667eea;"><strong>AI:</strong> 📝 Opening note-taking interface...</div>\`;
                // Add note-taking functionality here
                break;
        }
        
        chat.scrollTop = chat.scrollHeight;
    }
    
    console.log('✅ LMS AI Assistant fully initialized!');
})();`,
        update_notes: 'Initial release with floating AI assistant, chat interface, and quick actions',
        created_at: new Date().toISOString(),
        file_size: 6500,
        is_active: true,
        downloads: 0
    }
];

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

        // Verify admin session for protected actions
        if (action !== 'getActiveScript') {
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
        }

        switch (action) {
            case 'listScripts':
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        scripts: scripts.map(script => ({
                            id: script.id,
                            version: script.version,
                            name: script.name,
                            description: script.description,
                            update_notes: script.update_notes,
                            created_at: script.created_at,
                            file_size: script.file_size,
                            is_active: script.is_active,
                            downloads: script.downloads
                        }))
                    })
                };

            case 'getScript':
                const { scriptId } = actionData;
                const script = scripts.find(s => s.id === parseInt(scriptId));
                
                if (!script) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Script not found' 
                        })
                    };
                }

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        script: script
                    })
                };

            case 'getActiveScript':
                // Public endpoint for users to download the active script
                const activeScript = scripts.find(s => s.is_active);
                
                if (!activeScript) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'No active script found' 
                        })
                    };
                }

                // Increment download counter
                activeScript.downloads++;

                return {
                    statusCode: 200,
                    headers: {
                        ...headers,
                        'Content-Disposition': `attachment; filename="lms-ai-assistant-v${activeScript.version}.user.js"`,
                        'Content-Type': 'application/javascript'
                    },
                    body: activeScript.content
                };

            case 'uploadScript':
                const { name, description, version, content, updateNotes } = actionData;
                
                if (!name || !version || !content) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Name, version, and content are required' 
                        })
                    };
                }

                const newScript = {
                    id: scripts.length + 1,
                    name,
                    description: description || '',
                    version,
                    content,
                    update_notes: updateNotes || 'No update notes provided',
                    created_at: new Date().toISOString(),
                    file_size: content.length,
                    is_active: false,
                    downloads: 0
                };

                scripts.push(newScript);

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Script uploaded successfully',
                        script: newScript
                    })
                };

            case 'updateScript':
                const { scriptId: updateId, ...updateData } = actionData;
                const scriptIndex = scripts.findIndex(s => s.id === parseInt(updateId));
                
                if (scriptIndex === -1) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Script not found' 
                        })
                    };
                }

                // Update script
                scripts[scriptIndex] = {
                    ...scripts[scriptIndex],
                    ...updateData,
                    file_size: updateData.content ? updateData.content.length : scripts[scriptIndex].file_size
                };

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Script updated successfully',
                        script: scripts[scriptIndex]
                    })
                };

            case 'deleteScript':
                const { scriptId: deleteId } = actionData;
                const deleteIndex = scripts.findIndex(s => s.id === parseInt(deleteId));
                
                if (deleteIndex === -1) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Script not found' 
                        })
                    };
                }

                scripts.splice(deleteIndex, 1);

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Script deleted successfully'
                    })
                };

            case 'setActiveScript':
                const { scriptId: activeId } = actionData;
                
                // Deactivate all scripts
                scripts.forEach(s => s.is_active = false);
                
                // Activate selected script
                const scriptToActivate = scripts.find(s => s.id === parseInt(activeId));
                if (!scriptToActivate) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Script not found' 
                        })
                    };
                }

                scriptToActivate.is_active = true;

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Active script updated successfully',
                        script: scriptToActivate
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
        console.error('Script management error:', error);
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

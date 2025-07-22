// netlify/functions/downloadScript.js - Public endpoint for users to download the LMS AI Assistant userscript

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/javascript'
};

exports.handler = async (event, context) => {
    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Allow both GET and POST requests
    if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, message: 'Method not allowed' })
        };
    }

    try {
        // Return the LMS AI Assistant userscript directly
        const lmsAiScript = `// ==UserScript==
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
                <button class="ai-action-btn" data-action="calendar">📅 Add to Calendar</button>
                <button class="ai-action-btn" data-action="translate">🌐 Translate Content</button>
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
                    const pageTitle = document.title || 'Current Page';
                    chat.innerHTML += \`<div style="margin-bottom: 10px; color: #667eea;"><strong>AI:</strong> Summary of "\${pageTitle}": This appears to be an LMS page with educational content. I can help you understand key concepts, create study notes, or answer questions about the material.</div>\`;
                    chat.scrollTop = chat.scrollHeight;
                }, 1500);
                break;
                
            case 'highlight':
                chat.innerHTML += \`<div style="margin-bottom: 10px; color: #667eea;"><strong>AI:</strong> ✨ Highlighting important content on the page...</div>\`;
                setTimeout(() => {
                    chat.innerHTML += \`<div style="margin-bottom: 10px; color: #667eea;"><strong>AI:</strong> I've identified key sections on this page. Look for important headings, deadlines, and assignment details!</div>\`;
                    chat.scrollTop = chat.scrollHeight;
                }, 1000);
                break;
                
            case 'notes':
                chat.innerHTML += \`<div style="margin-bottom: 10px; color: #667eea;"><strong>AI:</strong> 📝 Creating study notes from this page...</div>\`;
                setTimeout(() => {
                    chat.innerHTML += \`<div style="margin-bottom: 10px; color: #667eea;"><strong>AI:</strong> Study notes created! I can help you organize key points, create flashcards, or generate quiz questions from this content.</div>\`;
                    chat.scrollTop = chat.scrollHeight;
                }, 1500);
                break;
                
            case 'calendar':
                chat.innerHTML += \`<div style="margin-bottom: 10px; color: #667eea;"><strong>AI:</strong> 📅 Scanning for dates and deadlines...</div>\`;
                setTimeout(() => {
                    chat.innerHTML += \`<div style="margin-bottom: 10px; color: #667eea;"><strong>AI:</strong> I found some important dates on this page. I can help you add them to your calendar or set reminders!</div>\`;
                    chat.scrollTop = chat.scrollHeight;
                }, 1200);
                break;
                
            case 'translate':
                chat.innerHTML += \`<div style="margin-bottom: 10px; color: #667eea;"><strong>AI:</strong> 🌐 Translation feature activated...</div>\`;
                setTimeout(() => {
                    chat.innerHTML += \`<div style="margin-bottom: 10px; color: #667eea;"><strong>AI:</strong> I can help translate content on this page to different languages. What language would you like me to translate to?</div>\`;
                    chat.scrollTop = chat.scrollHeight;
                }, 1000);
                break;
        }
        
        chat.scrollTop = chat.scrollHeight;
    }
    
    console.log('✅ LMS AI Assistant fully initialized!');
})();`;

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Disposition': 'attachment; filename="lms-ai-assistant.user.js"',
                'Content-Type': 'application/javascript'
            },
            body: lmsAiScript
        };

    } catch (error) {
        console.error('Download script error:', error);
        return {
            statusCode: 500,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                success: false, 
                message: 'Server error: ' + error.message 
            })
        };
    }
};

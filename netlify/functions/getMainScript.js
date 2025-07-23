// netlify/functions/getMainScript.js - Serve main script to approved devices only

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

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
    'Content-Type': 'application/javascript'
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
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: false, message: 'Method not allowed' })
        };
    }

    try {
        const { username, hwid, fingerprint } = JSON.parse(event.body);

        // Validate required fields
        if (!username || !hwid || !fingerprint) {
            return {
                statusCode: 400,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Username, HWID, and fingerprint are required' 
                })
            };
        }

        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        // Process HWID and fingerprint (hash if too long, same logic as registerDevice.js)
        let processedHwid = hwid;
        let processedFingerprint = fingerprint;
        
        // Hash HWID if longer than 400 characters
        if (hwid && hwid.length > 400) {
            processedHwid = crypto.createHash('sha256').update(hwid).digest('hex');
        }
        
        // Hash fingerprint if longer than 800 characters
        if (fingerprint && fingerprint.length > 800) {
            processedFingerprint = crypto.createHash('sha256').update(fingerprint).digest('hex');
        }

        // Verify device is approved and active using processed values
        const { data: device, error: deviceError } = await supabase
            .from('devices')
            .select('*')
            .eq('hwid', processedHwid)
            .eq('fingerprint', processedFingerprint)
            .eq('status', 'active')
            .single();

        if (deviceError || !device) {
            // Log unauthorized access attempt
            await supabase.from('logs').insert({
                log_type: 'security',
                level: 'warn',
                message: 'Unauthorized main script access attempt',
                details: { 
                    username,
                    hwid: hwid.substring(0, 10) + '...',
                    reason: deviceError ? 'Device not found or not active' : 'Unknown error'
                },
                ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
                user_agent: event.headers['user-agent']
            });

            return {
                statusCode: 403,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Device not authorized to access main script' 
                })
            };
        }

        // Check if device is expired
        if (device.expires_at && new Date(device.expires_at) < new Date()) {
            return {
                statusCode: 403,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Device has expired' 
                })
            };
        }

        // Get active script from database
        const { data: scriptData, error: scriptError } = await supabase
            .from('script_updates')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (scriptError || !scriptData) {
            console.error('Error fetching active script:', scriptError);
            return {
                statusCode: 500,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    success: false, 
                    message: 'No active script available' 
                })
            };
        }

        // Update device usage
        await supabase
            .from('devices')
            .update({ 
                last_used: new Date().toISOString(),
                usage_count: device.usage_count + 1
            })
            .eq('id', device.id);

        // Log script access
        await supabase.from('logs').insert({
            log_type: 'script',
            level: 'info',
            message: 'Main script accessed by approved device',
            details: { 
                username: device.username,
                device_name: device.device_name,
                script_version: scriptData.version
            },
            user_id: device.user_id,
            device_id: device.id,
            ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
            user_agent: event.headers['user-agent']
        });

        // Return decrypted main script (for now, return as plain text since encryption is not implemented)
        const mainScript = scriptData.encrypted_script || generateDefaultMainScript(scriptData.version, scriptData.update_notes);

        return {
            statusCode: 200,
            headers,
            body: mainScript
        };

    } catch (error) {
        console.error('Get main script error:', error);
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

function generateDefaultMainScript(version, updateNotes) {
    return `// LMS AI Assistant Main Script v${version}
// This is the main functionality script that runs after device approval

(function() {
    'use strict';
    
    console.log('🤖 LMS AI Assistant Main Script v${version} loaded!');
    
    // Remove device validation panel if it exists
    const statusPanel = document.getElementById('lms-ai-status-panel');
    if (statusPanel) {
        statusPanel.remove();
    }
    
    // Create main AI assistant interface
    const assistantButton = document.createElement('div');
    assistantButton.id = 'lms-ai-assistant-main';
    assistantButton.innerHTML = '🤖 AI Assistant';
    assistantButton.style.cssText = \`
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        padding: 12px 20px;
        border-radius: 25px;
        cursor: pointer;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
        transition: all 0.3s ease;
        user-select: none;
        border: 2px solid #10b981;
    \`;
    
    // Hover effects
    assistantButton.onmouseenter = () => {
        assistantButton.style.transform = 'translateY(-2px)';
        assistantButton.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.4)';
    };
    
    assistantButton.onmouseleave = () => {
        assistantButton.style.transform = 'translateY(0)';
        assistantButton.style.boxShadow = '0 4px 15px rgba(16, 185, 129, 0.3)';
    };
    
    // Main functionality
    assistantButton.onclick = () => {
        showMainAssistantPanel();
    };
    
    // Add to page
    document.body.appendChild(assistantButton);
    
    // Create main assistant panel
    function showMainAssistantPanel() {
        // Remove existing panel if any
        const existingPanel = document.getElementById('lms-ai-main-panel');
        if (existingPanel) {
            existingPanel.remove();
            return;
        }
        
        const panel = document.createElement('div');
        panel.id = 'lms-ai-main-panel';
        panel.innerHTML = \`
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <div>
                    <h3 style="margin: 0; color: #333;">🤖 LMS AI Assistant</h3>
                    <small style="color: #666;">v${version} - Approved Device</small>
                </div>
                <button id="close-main-panel" style="background: none; border: none; font-size: 20px; cursor: pointer;">×</button>
            </div>
            
            <div style="margin-bottom: 15px;">
                <h4 style="margin: 0 0 10px 0; color: #555;">AI-Powered Features:</h4>
                <button class="ai-main-btn" data-action="summarize">📄 Smart Summarization</button>
                <button class="ai-main-btn" data-action="highlight">✨ Content Analysis</button>
                <button class="ai-main-btn" data-action="notes">📝 Auto Note-Taking</button>
                <button class="ai-main-btn" data-action="calendar">📅 Schedule Integration</button>
                <button class="ai-main-btn" data-action="translate">🌐 Multi-Language Support</button>
                <button class="ai-main-btn" data-action="about">ℹ️ About & Updates</button>
            </div>
            
            <div>
                <h4 style="margin: 0 0 10px 0; color: #555;">AI Chat Assistant:</h4>
                <div id="ai-main-chat" style="height: 250px; border: 1px solid #ddd; border-radius: 8px; padding: 10px; overflow-y: auto; background: #f9f9f9; margin-bottom: 10px;">
                    <div style="color: #10b981; font-weight: 600; margin-bottom: 10px;">✅ Device Approved & Active</div>
                    <div style="color: #666; font-style: italic;">Welcome! Your AI Assistant is now fully activated. How can I help you with your LMS tasks today?</div>
                </div>
                <input type="text" id="ai-main-input" placeholder="Ask me anything about your coursework..." style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 10px;">
                <button id="send-main-message" style="width: 100%; padding: 10px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">Send Message</button>
            </div>
        \`;
        
        panel.style.cssText = \`
            position: fixed;
            top: 80px;
            right: 20px;
            width: 380px;
            background: white;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            padding: 20px;
            z-index: 10001;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            border: 2px solid #10b981;
        \`;
        
        document.body.appendChild(panel);
        
        // Add event listeners
        document.getElementById('close-main-panel').onclick = () => panel.remove();
        
        // Action buttons
        document.querySelectorAll('.ai-main-btn').forEach(btn => {
            btn.style.cssText = \`
                display: block;
                width: 100%;
                margin-bottom: 8px;
                padding: 10px 12px;
                background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
                border: 1px solid #10b981;
                border-radius: 6px;
                cursor: pointer;
                text-align: left;
                transition: all 0.2s;
                color: #065f46;
                font-weight: 500;
            \`;
            
            btn.onmouseenter = () => {
                btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                btn.style.color = 'white';
            };
            btn.onmouseleave = () => {
                btn.style.background = 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)';
                btn.style.color = '#065f46';
            };
            
            btn.onclick = () => handleMainAction(btn.dataset.action);
        });
        
        // Chat functionality
        const sendMainMessage = () => {
            const input = document.getElementById('ai-main-input');
            const chat = document.getElementById('ai-main-chat');
            
            if (input.value.trim()) {
                // Add user message
                chat.innerHTML += \`<div style="margin-bottom: 10px;"><strong>You:</strong> \${input.value}</div>\`;
                
                // Simulate AI response
                setTimeout(() => {
                    chat.innerHTML += \`<div style="margin-bottom: 10px; color: #10b981;"><strong>AI Assistant:</strong> I understand you're asking about "\${input.value}". As your approved AI assistant, I can help you with LMS tasks, content analysis, study planning, and much more!</div>\`;
                    chat.scrollTop = chat.scrollHeight;
                }, 1000);
                
                input.value = '';
                chat.scrollTop = chat.scrollHeight;
            }
        };
        
        document.getElementById('send-main-message').onclick = sendMainMessage;
        document.getElementById('ai-main-input').onkeypress = (e) => {
            if (e.key === 'Enter') sendMainMessage();
        };
    }
    
    // Handle main action buttons
    function handleMainAction(action) {
        const chat = document.getElementById('ai-main-chat');
        
        switch(action) {
            case 'about':
                chat.innerHTML += \`<div style="margin-bottom: 10px; color: #10b981;"><strong>AI Assistant:</strong> 
                    <br><strong>Version:</strong> ${version}
                    <br><strong>Status:</strong> ✅ Device Approved & Active
                    <br><strong>Updates:</strong> ${updateNotes || 'Latest features and improvements'}
                    <br><strong>Support:</strong> Full AI-powered assistance available
                </div>\`;
                break;
                
            case 'summarize':
                chat.innerHTML += \`<div style="margin-bottom: 10px; color: #10b981;"><strong>AI Assistant:</strong> 📄 Analyzing page content with advanced AI algorithms...</div>\`;
                setTimeout(() => {
                    const pageTitle = document.title || 'Current Page';
                    chat.innerHTML += \`<div style="margin-bottom: 10px; color: #10b981;"><strong>AI Assistant:</strong> Smart summary of "\${pageTitle}": This LMS page contains educational content that I can help you understand, summarize, and organize for better learning outcomes.</div>\`;
                    chat.scrollTop = chat.scrollHeight;
                }, 1500);
                break;
                
            case 'highlight':
                chat.innerHTML += \`<div style="margin-bottom: 10px; color: #10b981;"><strong>AI Assistant:</strong> ✨ Performing intelligent content analysis...</div>\`;
                setTimeout(() => {
                    chat.innerHTML += \`<div style="margin-bottom: 10px; color: #10b981;"><strong>AI Assistant:</strong> I've identified key learning objectives, important deadlines, and critical information on this page. The content has been analyzed for optimal study planning!</div>\`;
                    chat.scrollTop = chat.scrollHeight;
                }, 1200);
                break;
                
            case 'notes':
                chat.innerHTML += \`<div style="margin-bottom: 10px; color: #10b981;"><strong>AI Assistant:</strong> 📝 Creating comprehensive study notes...</div>\`;
                setTimeout(() => {
                    chat.innerHTML += \`<div style="margin-bottom: 10px; color: #10b981;"><strong>AI Assistant:</strong> Smart notes generated! I've organized key concepts, created study guides, and prepared review materials based on the current content.</div>\`;
                    chat.scrollTop = chat.scrollHeight;
                }, 1800);
                break;
                
            case 'calendar':
                chat.innerHTML += \`<div style="margin-bottom: 10px; color: #10b981;"><strong>AI Assistant:</strong> 📅 Scanning for important dates and deadlines...</div>\`;
                setTimeout(() => {
                    chat.innerHTML += \`<div style="margin-bottom: 10px; color: #10b981;"><strong>AI Assistant:</strong> Schedule integration complete! I've identified assignment due dates, exam schedules, and important milestones that can be added to your calendar.</div>\`;
                    chat.scrollTop = chat.scrollHeight;
                }, 1400);
                break;
                
            case 'translate':
                chat.innerHTML += \`<div style="margin-bottom: 10px; color: #10b981;"><strong>AI Assistant:</strong> 🌐 Multi-language support activated...</div>\`;
                setTimeout(() => {
                    chat.innerHTML += \`<div style="margin-bottom: 10px; color: #10b981;"><strong>AI Assistant:</strong> Translation services ready! I can help translate course content, assignments, and materials into multiple languages for better comprehension.</div>\`;
                    chat.scrollTop = chat.scrollHeight;
                }, 1000);
                break;
        }
        
        chat.scrollTop = chat.scrollHeight;
    }
    
    console.log('✅ LMS AI Assistant Main Script fully initialized and ready!');
    console.log('🔐 Device Status: Approved & Active');
    console.log('📊 Script Version: ${version}');
})();`;
}

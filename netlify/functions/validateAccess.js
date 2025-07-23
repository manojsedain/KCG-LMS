// netlify/functions/validateAccess.js - Validate site password and provide device validation userscript

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
        const { username, sitePassword } = JSON.parse(event.body);

        // Validate required fields
        if (!username || !sitePassword) {
            return {
                statusCode: 400,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Username and site password are required' 
                })
            };
        }

        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        // Get site password from database
        const { data: settingData, error: settingError } = await supabase
            .from('admin_settings')
            .select('setting_value')
            .eq('setting_key', 'site_password')
            .single();

        if (settingError || !settingData) {
            console.error('Error fetching site password:', settingError);
            return {
                statusCode: 500,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Server configuration error' 
                })
            };
        }

        // Validate site password
        if (sitePassword !== settingData.setting_value) {
            // Log failed attempt
            await supabase.from('logs').insert({
                log_type: 'security',
                level: 'warn',
                message: 'Failed site password attempt',
                details: { 
                    username, 
                    ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'] 
                },
                ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
                user_agent: event.headers['user-agent']
            });

            return {
                statusCode: 401,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Invalid access password' 
                })
            };
        }

        // Log successful access
        await supabase.from('logs').insert({
            log_type: 'info',
            level: 'info',
            message: 'Successful script download',
            details: { 
                username,
                ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
            },
            ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
            user_agent: event.headers['user-agent']
        });

        // Generate device validation userscript
        const deviceValidationScript = `// ==UserScript==
// @name         LMS AI Assistant - Device Validator
// @namespace    https://wrongnumber.netlify.app/
// @version      8.2.2
// @description  Device validation and registration for LMS AI Assistant (appendChild fix applied)
// @author       LMS AI Assistant
// @match        https://king-lms.kcg.edu/ultra/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    
    console.log('🔐 LMS AI Assistant Device Validator v1.0.0 loaded!');
    
    const CONFIG = {
        USERNAME: '${username}',
        BACKEND_URL: '${event.headers.origin || 'https://wrongnumber.netlify.app'}/.netlify/functions',
        CHECK_INTERVAL: 5000 // Check device status every 5 seconds
    };
    
    let deviceInfo = null;
    let checkInterval = null;
    let statusPanel = null;
    
    // Generate device fingerprint and HWID
    function generateDeviceInfo() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Device fingerprint', 2, 2);
        
        const fingerprint = btoa(JSON.stringify({
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            cookieEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            screen: {
                width: screen.width,
                height: screen.height,
                colorDepth: screen.colorDepth
            },
            canvas: canvas.toDataURL(),
            webgl: getWebGLFingerprint()
        }));
        
        const hwid = btoa(navigator.userAgent + navigator.platform + screen.width + screen.height);
        
        return {
            username: CONFIG.USERNAME,
            hwid: hwid,
            fingerprint: fingerprint,
            deviceName: getBrowserName() + ' on ' + getOSName(),
            browserInfo: navigator.userAgent,
            osInfo: navigator.platform
        };
    }
    
    function getWebGLFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) return 'no-webgl';
            
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            return debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';
        } catch (e) {
            return 'error';
        }
    }
    
    function getBrowserName() {
        const userAgent = navigator.userAgent;
        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('Safari')) return 'Safari';
        if (userAgent.includes('Edge')) return 'Edge';
        return 'Unknown';
    }
    
    function getOSName() {
        const platform = navigator.platform;
        if (platform.includes('Win')) return 'Windows';
        if (platform.includes('Mac')) return 'macOS';
        if (platform.includes('Linux')) return 'Linux';
        return 'Unknown';
    }
    
    // Register device with backend
    async function registerDevice() {
        try {
            console.log('🔍 Registering device with:', {
                url: CONFIG.BACKEND_URL + '/registerDevice',
                username: deviceInfo.username,
                hwid: deviceInfo.hwid?.substring(0, 20) + '...',
                fingerprint: deviceInfo.fingerprint?.substring(0, 20) + '...',
                deviceName: deviceInfo.deviceName
            });
            
            const response = await fetch(CONFIG.BACKEND_URL + '/registerDevice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(deviceInfo)
            });
            
            console.log('🔍 Device registration response:', {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                headers: Object.fromEntries(response.headers.entries())
            });
            
            if (!response.ok) {
                console.error('❌ Device registration HTTP error:', response.status, response.statusText);
                throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            
            const result = await response.json();
            console.log('✅ Device registration result:', result);
            return result;
        } catch (error) {
            console.error('❌ Device registration error:', error);
            return { success: false, message: 'Registration failed' };
        }
    }
    
    // Check device status
    async function checkDeviceStatus() {
        try {
            console.log('🔍 Checking device status with:', {
                url: CONFIG.BACKEND_URL + '/checkDeviceStatus',
                username: deviceInfo.username,
                hwid: deviceInfo.hwid?.substring(0, 20) + '...',
                fingerprint: deviceInfo.fingerprint?.substring(0, 20) + '...'
            });
            
            const response = await fetch(CONFIG.BACKEND_URL + '/checkDeviceStatus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: deviceInfo.username,
                    hwid: deviceInfo.hwid,
                    fingerprint: deviceInfo.fingerprint
                })
            });
            
            console.log('🔍 Device status response:', {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
                headers: Object.fromEntries(response.headers.entries())
            });
            
            if (!response.ok) {
                console.error('❌ Device status check HTTP error:', response.status, response.statusText);
                throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            
            const result = await response.json();
            console.log('✅ Device status result:', result);
            return result;
        } catch (error) {
            console.error('❌ Device status check error:', error);
            return { success: false, status: 'error' };
        }
    }
    
    // Load main script with appendChild error handling
    async function loadMainScript() {
        try {
            console.log('🔍 Calling getMainScript with:', {
                url: CONFIG.BACKEND_URL + '/getMainScript',
                username: deviceInfo.username,
                hwid: deviceInfo.hwid?.substring(0, 20) + '...',
                fingerprint: deviceInfo.fingerprint?.substring(0, 20) + '...'
            });
            
            const response = await fetch(CONFIG.BACKEND_URL + '/getMainScript', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: deviceInfo.username,
                    hwid: deviceInfo.hwid,
                    fingerprint: deviceInfo.fingerprint
                })
            });
            
            console.log('🔍 Response status:', response.status);
            console.log('🔍 Response headers:', Object.fromEntries(response.headers.entries()));
            console.log('🔍 Response content-type:', response.headers.get('content-type'));
            
            if (!response.ok) {
                throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            
            const scriptContent = await response.text();
            
            console.log('🔍 Response content length:', scriptContent.length);
            console.log('🔍 First 200 chars:', scriptContent.substring(0, 200));
            console.log('🔍 Contains DOCTYPE?', scriptContent.includes('<!DOCTYPE'));
            console.log('🔍 Contains <html?', scriptContent.includes('<html'));
            
            // Validate JavaScript content before execution
            if (!scriptContent || scriptContent.trim().length === 0) {
                throw new Error('Empty script content received');
            }
            
            // Check for common invalid content patterns
            if (scriptContent.includes('<!DOCTYPE') || scriptContent.includes('<html')) {
                console.error('❌ HTML content detected:', scriptContent.substring(0, 500));
                throw new Error('Received HTML instead of JavaScript');
            }
            
            // Basic JavaScript syntax validation
            try {
                new Function(scriptContent);
            } catch (syntaxError) {
                throw new Error('Invalid JavaScript syntax: ' + syntaxError.message);
            }
            
            // SAFE EXECUTION: Use Function constructor instead of appendChild
            try {
                const scriptFunction = new Function(scriptContent);
                scriptFunction.call(window);
                console.log('✅ Main LMS AI Assistant script loaded successfully!');
                hideStatusPanel();
            } catch (execError) {
                throw new Error('Script execution failed: ' + execError.message);
            }
            
        } catch (error) {
            console.error('Main script loading error:', error);
            console.error('Script loading error details:', {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
            showStatusPanel('error', 'Failed to load main script: ' + error.message);
        }
    }
    
    // Show status panel
    function showStatusPanel(status, message) {
        hideStatusPanel();
        
        statusPanel = document.createElement('div');
        statusPanel.id = 'lms-ai-status-panel';
        statusPanel.innerHTML = \`
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 15px 20px;
                border-radius: 10px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                max-width: 300px;
                border: 2px solid \${status === 'pending' ? '#f59e0b' : status === 'blocked' ? '#ef4444' : '#10b981'};
            ">
                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 18px; margin-right: 8px;">
                        \${status === 'pending' ? '⏳' : status === 'blocked' ? '🚫' : status === 'active' ? '✅' : '❌'}
                    </span>
                    <strong>LMS AI Assistant</strong>
                </div>
                <div style="font-size: 12px; opacity: 0.9;">
                    \${message}
                </div>
                \${status === 'pending' ? '<div style="margin-top: 8px; font-size: 11px; opacity: 0.8;">Checking status every 5 seconds...</div>' : ''}
            </div>
        \`;
        
        document.body.appendChild(statusPanel);
    }
    
    function hideStatusPanel() {
        if (statusPanel) {
            statusPanel.remove();
            statusPanel = null;
        }
    }
    
    // Main initialization
    async function initialize() {
        deviceInfo = generateDeviceInfo();
        
        console.log('Device Info:', deviceInfo);
        
        // Register device
        showStatusPanel('pending', 'Registering device...');
        const registrationResult = await registerDevice();
        
        if (!registrationResult.success) {
            showStatusPanel('error', 'Registration failed: ' + registrationResult.message);
            return;
        }
        
        // Start checking device status
        console.log('🔄 Starting device status check interval (every 5 seconds)');
        checkInterval = setInterval(async () => {
            console.log('⏰ Interval timer triggered - checking device status...');
            const statusResult = await checkDeviceStatus();
            
            if (statusResult.success) {
                switch (statusResult.status) {
                    case 'active':
                        clearInterval(checkInterval);
                        showStatusPanel('active', 'Device approved! Loading AI Assistant...');
                        setTimeout(() => {
                            loadMainScript();
                        }, 2000);
                        break;
                        
                    case 'blocked':
                        clearInterval(checkInterval);
                        showStatusPanel('blocked', 'Device has been blocked by administrator');
                        break;
                        
                    case 'pending':
                        showStatusPanel('pending', 'Device pending approval from administrator');
                        break;
                        
                    default:
                        showStatusPanel('error', 'Unknown device status: ' + statusResult.status);
                }
            } else {
                showStatusPanel('error', 'Failed to check device status');
            }
        }, CONFIG.CHECK_INTERVAL);
        
        // Initial status check
        console.log('🔍 Performing initial device status check...');
        const initialStatus = await checkDeviceStatus();
        if (initialStatus.success && initialStatus.status === 'active') {
            clearInterval(checkInterval);
            showStatusPanel('active', 'Device already approved! Loading AI Assistant...');
            setTimeout(() => {
                loadMainScript();
            }, 2000);
        } else {
            showStatusPanel('pending', 'Device pending approval from administrator');
        }
    }
    
    // Start when page is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
    console.log('🔐 Device validation system initialized for user: ' + CONFIG.USERNAME);
})();`;

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Disposition': 'attachment; filename="lms-device-validator.user.js"',
                'Content-Type': 'application/javascript'
            },
            body: deviceValidationScript
        };

    } catch (error) {
        console.error('Validate access error:', error);
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

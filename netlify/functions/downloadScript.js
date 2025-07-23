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
        // Parse request body for username (if POST)
        let username = 'user';
        if (event.httpMethod === 'POST' && event.body) {
            try {
                const body = JSON.parse(event.body);
                username = body.username || 'user';
            } catch (e) {
                // If parsing fails, use default username
            }
        }

        // Read the actual loader template with fixes
        const fs = require('fs');
        const path = require('path');
        const loaderTemplatePath = path.join(__dirname, '../../scripts/loader-template.js');
        
        let loaderTemplate;
        try {
            loaderTemplate = fs.readFileSync(loaderTemplatePath, 'utf8');
        } catch (error) {
            console.error('Failed to read loader template:', error);
            // Fallback to inline template with fixes
            loaderTemplate = getInlineLoaderTemplate();
        }

        // Replace placeholders in the template
        const userScript = loaderTemplate
            .replace(/{{USERNAME}}/g, username)
            .replace(/{{SITE_PASSWORD}}/g, 'defaultPassword') // This should be replaced with actual site password
            .replace(/{{API_BASE}}/g, 'https://wrongnumber.netlify.app/.netlify/functions');

        // Generate userscript with proper headers
        const lmsAiScript = `// ==UserScript==
// @name         LMS AI Assistant - Device Validator
// @namespace    https://wrongnumber.netlify.app/
// @version      8.2.2
// @description  Device validator and loader for LMS AI Assistant (appendChild fix applied)
// @author       LMS AI Assistant Team
// @match        https://king-lms.kcg.edu/ultra/*
// @match        https://king-lms.kcg.edu/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @grant        GM_info
// @run-at       document-start
// ==/UserScript==

${userScript}`;

        const filename = `lms-device-validator-${username}.user.js`;

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Content-Type': 'application/javascript',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'ETag': `"${Date.now()}"`
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

// Fallback inline loader template with appendChild fixes
function getInlineLoaderTemplate() {
    return `(function() {
    'use strict';
    
    // ===== GM COMPATIBILITY LAYER =====
    if (typeof GM_setValue === 'undefined') {
        window.GM_setValue = (key, value) => localStorage.setItem(key, JSON.stringify(value));
    }
    if (typeof GM_getValue === 'undefined') {
        window.GM_getValue = (key, defaultValue) => {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : defaultValue;
        };
    }
    if (typeof GM_xmlhttpRequest === 'undefined') {
        window.GM_xmlhttpRequest = (options) => {
            const xhr = new XMLHttpRequest();
            xhr.open(options.method || 'GET', options.url);
            if (options.headers) {
                Object.keys(options.headers).forEach(key => {
                    xhr.setRequestHeader(key, options.headers[key]);
                });
            }
            xhr.onload = () => options.onload && options.onload({ responseText: xhr.responseText, status: xhr.status });
            xhr.onerror = () => options.onerror && options.onerror(xhr);
            xhr.send(options.data);
        };
    }
    if (typeof GM_notification === 'undefined') {
        window.GM_notification = (text, title) => {
            if (Notification.permission === 'granted') {
                new Notification(title || 'LMS AI Assistant', { body: text });
            }
        };
    }
    
    // Configuration
    const CONFIG = {
        VERSION: '8.2.1',
        USERNAME: '{{USERNAME}}',
        API_BASE: '{{API_BASE}}',
        LMS_DOMAIN: 'king-lms.kcg.edu'
    };
    
    console.log('🔐 LMS AI Assistant Device Validator v' + CONFIG.VERSION + ' loaded!');
    
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
            const response = await fetch(CONFIG.API_BASE + '/registerDevice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(deviceInfo)
            });
            
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Device registration error:', error);
            return { success: false, message: 'Registration failed' };
        }
    }
    
    // Check device status
    async function checkDeviceStatus() {
        try {
            const response = await fetch(CONFIG.API_BASE + '/checkDeviceStatus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: deviceInfo.username,
                    hwid: deviceInfo.hwid,
                    fingerprint: deviceInfo.fingerprint
                })
            });
            
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Device status check error:', error);
            return { success: false, status: 'error' };
        }
    }
    
    // FIXED: Load main script with appendChild error handling
    async function loadMainScript() {
        try {
            const response = await fetch(CONFIG.API_BASE + '/getMainLoader', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: deviceInfo.username,
                    hwid: deviceInfo.hwid,
                    fingerprint: deviceInfo.fingerprint
                })
            });
            
            if (!response.ok) {
                throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
            }
            
            const scriptContent = await response.text();
            
            // Validate that response is valid JavaScript
            if (typeof scriptContent !== 'string' || !scriptContent.trim()) {
                throw new Error('Invalid response format: expected non-empty string');
            }
            
            // Check for common invalid content patterns
            if (scriptContent.includes('<!DOCTYPE') || scriptContent.includes('<html')) {
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
                hwid: deviceInfo?.hwid ? deviceInfo.hwid.substring(0, 8) + '...' : 'null',
                fingerprint: deviceInfo?.fingerprint ? deviceInfo.fingerprint.substring(0, 8) + '...' : 'null'
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
                border: 2px solid \${status === 'pending' ? '#f59e0b' : status === 'blocked' ? '#ef4444' : status === 'error' ? '#ef4444' : '#10b981'};
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
        console.log('🔐 Device validation system initialized for user: ' + CONFIG.USERNAME);
        
        // Check if we're on the correct domain
        if (!window.location.hostname.includes(CONFIG.LMS_DOMAIN)) {
            console.log('Not on LMS domain, skipping initialization');
            return;
        }
        
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
        const checkInterval = setInterval(async () => {
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
        }, 5000);
        
        // Initial status check
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
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
})();`;
}

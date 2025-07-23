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
// @version      8.2.1
// @description  Device validator and loader for LMS AI Assistant
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
    
    // Enhanced loadMainScript function with appendChild fixes
    async function loadMainScript() {
        const hwid = GM_getValue('device_hwid');
        const fingerprint = GM_getValue('device_fingerprint');
        const deviceId = GM_getValue('device_id');
        
        try {
            const response = await makeRequest(\`\${CONFIG.API_BASE}/getMainLoader\`, {
                username: CONFIG.USERNAME,
                hwid,
                fingerprint,
                deviceId
            });
            
            if (!response) {
                throw new Error('Empty response from server');
            }
            
            // Validate that response is valid JavaScript
            if (typeof response !== 'string') {
                throw new Error('Invalid response format: expected string');
            }
            
            // Check for common invalid content patterns
            if (response.includes('<!DOCTYPE') || response.includes('<html')) {
                throw new Error('Received HTML instead of JavaScript');
            }
            
            // Basic JavaScript syntax validation
            try {
                new Function(response);
            } catch (syntaxError) {
                throw new Error('Invalid JavaScript syntax: ' + syntaxError.message);
            }
            
            // Create a safer execution context
            try {
                // Execute the main loader script in a controlled way
                const scriptFunction = new Function(response);
                scriptFunction.call(window);
                console.log('✅ Main LMS AI Assistant script loaded successfully!');
            } catch (execError) {
                throw new Error('Script execution failed: ' + execError.message);
            }
            
        } catch (error) {
            console.error('Failed to load main script: ' + error.message);
            console.error('Script loading error details:', {
                error: error.message,
                stack: error.stack,
                hwid: hwid ? hwid.substring(0, 8) + '...' : 'null',
                fingerprint: fingerprint ? fingerprint.substring(0, 8) + '...' : 'null',
                deviceId: deviceId || 'null'
            });
        }
    }
    
    // Device validation and initialization logic
    async function initialize() {
        console.log('🔐 Device validation system initialized for user: ' + CONFIG.USERNAME);
        
        // Check if we're on the correct domain
        if (!window.location.hostname.includes(CONFIG.LMS_DOMAIN)) {
            console.log('Not on LMS domain, skipping initialization');
            return;
        }
        
        // For demo purposes, simulate device approval and load main script
        setTimeout(async () => {
            await loadMainScript();
        }, 2000);
    }
    
    // Utility function for making requests
    async function makeRequest(url, data) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: url,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(data),
                onload: function(response) {
                    if (response.status === 200) {
                        try {
                            if (response.responseText.startsWith('{')) {
                                const result = JSON.parse(response.responseText);
                                resolve(result);
                            } else {
                                resolve(response.responseText);
                            }
                        } catch (error) {
                            reject(new Error('Failed to parse response: ' + error.message));
                        }
                    } else {
                        reject(new Error(\`HTTP \${response.status}: \${response.statusText}\`));
                    }
                },
                onerror: function(error) {
                    reject(new Error('Network error: ' + error.message));
                }
            });
        });
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
})();`;
}

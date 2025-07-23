// ==UserScript==
// @name         LMS AI Assistant Loader - {{USERNAME}}
// @namespace    https://wrongnumber.netlify.app/
// @version      1.0.0
// @description  Secure loader for LMS AI Assistant with device validation
// @author       LMS AI Assistant Team
// @match        https://king-lms.kcg.edu/ultra/*
// @match        https://*.kcg.edu/ultra/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_info
// @run-at       document-start
// @updateURL    https://wrongnumber.netlify.app/.netlify/functions/loader?username={{USERNAME}}
// @downloadURL  https://wrongnumber.netlify.app/.netlify/functions/loader?username={{USERNAME}}
// ==/UserScript==

(function() {
    'use strict';
    
    // Configuration
    const CONFIG = {
        USERNAME: '{{USERNAME}}',
        API_BASE: 'https://wrongnumber.netlify.app/.netlify/functions',
        LMS_DOMAIN: 'king-lms.kcg.edu',
        VERSION: '1.0.0'
    };
    
    // Utility functions
    function log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        console.log(`[LMS AI Assistant Loader] [${level.toUpperCase()}] ${timestamp} - ${message}`);
    }
    
    function showNotification(message, type = 'info') {
        if (typeof GM_notification !== 'undefined') {
            GM_notification({
                title: 'LMS AI Assistant',
                text: message,
                timeout: 5000,
                onclick: () => window.focus()
            });
        }
        
        // Also show in-page notification
        showInPageNotification(message, type);
    }
    
    function showInPageNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            max-width: 300px;
            word-wrap: break-word;
            animation: slideIn 0.3s ease-out;
        `;
        
        // Add animation keyframes
        if (!document.getElementById('lms-ai-notification-styles')) {
            const style = document.createElement('style');
            style.id = 'lms-ai-notification-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }
    
    // Generate hardware ID from browser/system information
    function generateHWID() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Hardware fingerprint', 2, 2);
        
        const systemInfo = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            languages: navigator.languages ? navigator.languages.join(',') : '',
            platform: navigator.platform,
            screen: {
                width: screen.width,
                height: screen.height,
                colorDepth: screen.colorDepth,
                pixelDepth: screen.pixelDepth
            },
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            hardwareConcurrency: navigator.hardwareConcurrency || 0,
            deviceMemory: navigator.deviceMemory || 0,
            cookieEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack,
            canvas: canvas.toDataURL(),
            plugins: Array.from(navigator.plugins).map(p => p.name).join(','),
            mimeTypes: Array.from(navigator.mimeTypes).map(m => m.type).join(',')
        };
        
        const hwString = JSON.stringify(systemInfo);
        return btoa(hwString).replace(/[^a-zA-Z0-9]/g, '').substring(0, 64);
    }
    
    // Generate browser fingerprint
    function generateFingerprint() {
        const fingerprint = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            languages: navigator.languages ? navigator.languages.join(',') : '',
            platform: navigator.platform,
            cookieEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack,
            screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            touchSupport: 'ontouchstart' in window,
            webgl: getWebGLFingerprint(),
            fonts: detectFonts(),
            timestamp: Date.now()
        };
        
        const fpString = JSON.stringify(fingerprint);
        return btoa(fpString).replace(/[^a-zA-Z0-9]/g, '').substring(0, 64);
    }
    
    function getWebGLFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) return 'no-webgl';
            
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            
            return `${vendor}|${renderer}`;
        } catch (e) {
            return 'webgl-error';
        }
    }
    
    function detectFonts() {
        const testFonts = ['Arial', 'Helvetica', 'Times', 'Courier', 'Verdana', 'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS', 'Trebuchet MS', 'Arial Black', 'Impact'];
        const detected = [];
        
        const testString = 'mmmmmmmmmmlli';
        const testSize = '72px';
        const h = document.getElementsByTagName('body')[0];
        
        const s = document.createElement('span');
        s.style.fontSize = testSize;
        s.innerHTML = testString;
        const defaultWidth = {};
        const defaultHeight = {};
        
        for (const font of ['monospace', 'sans-serif', 'serif']) {
            s.style.fontFamily = font;
            h.appendChild(s);
            defaultWidth[font] = s.offsetWidth;
            defaultHeight[font] = s.offsetHeight;
            h.removeChild(s);
        }
        
        for (const font of testFonts) {
            let detected_font = false;
            for (const baseFont of ['monospace', 'sans-serif', 'serif']) {
                s.style.fontFamily = font + ',' + baseFont;
                h.appendChild(s);
                const matched = (s.offsetWidth !== defaultWidth[baseFont] || s.offsetHeight !== defaultHeight[baseFont]);
                h.removeChild(s);
                detected_font = detected_font || matched;
            }
            if (detected_font) {
                detected.push(font);
            }
        }
        
        return detected.join(',');
    }
    
    // Get device information
    function getDeviceInfo() {
        return {
            deviceName: `${navigator.platform} - ${navigator.userAgent.split(' ')[0]}`,
            browserInfo: {
                name: getBrowserName(),
                version: getBrowserVersion(),
                userAgent: navigator.userAgent,
                language: navigator.language,
                platform: navigator.platform,
                cookieEnabled: navigator.cookieEnabled,
                onLine: navigator.onLine,
                hardwareConcurrency: navigator.hardwareConcurrency,
                deviceMemory: navigator.deviceMemory
            },
            osInfo: getOSInfo(),
            screenInfo: {
                width: screen.width,
                height: screen.height,
                colorDepth: screen.colorDepth,
                pixelDepth: screen.pixelDepth
            },
            timestamp: new Date().toISOString()
        };
    }
    
    function getBrowserName() {
        const userAgent = navigator.userAgent;
        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('Safari')) return 'Safari';
        if (userAgent.includes('Edge')) return 'Edge';
        if (userAgent.includes('Opera')) return 'Opera';
        return 'Unknown';
    }
    
    function getBrowserVersion() {
        const userAgent = navigator.userAgent;
        const match = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)\/(\d+)/);
        return match ? match[2] : 'Unknown';
    }
    
    function getOSInfo() {
        const userAgent = navigator.userAgent;
        if (userAgent.includes('Windows')) return 'Windows';
        if (userAgent.includes('Mac')) return 'macOS';
        if (userAgent.includes('Linux')) return 'Linux';
        if (userAgent.includes('Android')) return 'Android';
        if (userAgent.includes('iOS')) return 'iOS';
        return 'Unknown';
    }
    
    // Validate device with server
    async function validateDevice() {
        const hwid = generateHWID();
        const fingerprint = generateFingerprint();
        const deviceInfo = getDeviceInfo();
        
        // Store device identifiers
        GM_setValue('device_hwid', hwid);
        GM_setValue('device_fingerprint', fingerprint);
        
        try {
            const response = await makeRequest(`${CONFIG.API_BASE}/validateDevice`, {
                username: CONFIG.USERNAME,
                hwid,
                fingerprint,
                deviceInfo,
                sitePassword: '{{SITE_PASSWORD}}' // This will be replaced when generating the script
            });
            
            if (response.success) {
                if (response.status === 'approved' || response.status === 'active') {
                    GM_setValue('device_approved', true);
                    GM_setValue('device_id', response.device_id);
                    GM_setValue('expires_at', response.expires_at);
                    
                    log('Device validated successfully', 'success');
                    showNotification('Device validated - Loading LMS AI Assistant...', 'success');
                    
                    return { approved: true, deviceId: response.device_id };
                } else if (response.status === 'pending') {
                    GM_setValue('device_approved', false);
                    GM_setValue('device_pending', true);
                    
                    log('Device registration pending approval', 'info');
                    showNotification('Device registration submitted - Waiting for admin approval', 'info');
                    
                    return { approved: false, pending: true };
                }
            }
            
            log('Device validation failed: ' + response.message, 'error');
            showNotification('Device validation failed: ' + response.message, 'error');
            
            return { approved: false, error: response.message };
            
        } catch (error) {
            log('Device validation error: ' + error.message, 'error');
            showNotification('Device validation error: ' + error.message, 'error');
            
            return { approved: false, error: error.message };
        }
    }
    
    // Check approval status periodically
    async function checkApprovalStatus() {
        const hwid = GM_getValue('device_hwid');
        const fingerprint = GM_getValue('device_fingerprint');
        
        if (!hwid || !fingerprint) {
            return false;
        }
        
        try {
            const response = await makeRequest(`${CONFIG.API_BASE}/validateDevice`, {
                username: CONFIG.USERNAME,
                hwid,
                fingerprint,
                sitePassword: '{{SITE_PASSWORD}}'
            });
            
            if (response.success && (response.status === 'approved' || response.status === 'active')) {
                GM_setValue('device_approved', true);
                GM_setValue('device_pending', false);
                GM_setValue('device_id', response.device_id);
                GM_setValue('expires_at', response.expires_at);
                
                log('Device approved by admin!', 'success');
                showNotification('Device approved! Loading LMS AI Assistant...', 'success');
                
                // Load main script
                loadMainScript();
                
                return true;
            } else if (response.status === 'blocked') {
                GM_setValue('device_approved', false);
                GM_setValue('device_pending', false);
                GM_setValue('device_blocked', true);
                
                log('Device has been blocked', 'error');
                showNotification('Device has been blocked by admin', 'error');
                
                return false;
            }
            
        } catch (error) {
            log('Approval check error: ' + error.message, 'error');
        }
        
        return false;
    }
    
    // Load main script
    async function loadMainScript() {
        const hwid = GM_getValue('device_hwid');
        const fingerprint = GM_getValue('device_fingerprint');
        const deviceId = GM_getValue('device_id');
        
        try {
            const response = await makeRequest(`${CONFIG.API_BASE}/getMainLoader`, {
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
                log('Main loader script executed successfully', 'success');
            } catch (execError) {
                throw new Error('Script execution failed: ' + execError.message);
            }
            
        } catch (error) {
            log('Failed to load main script: ' + error.message, 'error');
            showNotification('Failed to load LMS AI Assistant: ' + error.message, 'error');
            
            // Additional debugging information
            console.error('[LMS AI Assistant] Script loading error details:', {
                error: error.message,
                stack: error.stack,
                hwid: hwid ? hwid.substring(0, 8) + '...' : 'null',
                fingerprint: fingerprint ? fingerprint.substring(0, 8) + '...' : 'null',
                deviceId: deviceId || 'null'
            });
        }
    }
    
    // Make HTTP request
    function makeRequest(url, data) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: url,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-User-Agent': 'LMS-AI-Assistant-Loader/' + CONFIG.VERSION,
                    'X-Timestamp': Date.now().toString()
                },
                data: JSON.stringify(data),
                timeout: 30000,
                onload: function(response) {
                    try {
                        if (response.status === 200) {
                            if (response.responseText.startsWith('{')) {
                                // JSON response
                                const result = JSON.parse(response.responseText);
                                resolve(result);
                            } else {
                                // Script response
                                resolve(response.responseText);
                            }
                        } else {
                            reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
                        }
                    } catch (error) {
                        reject(new Error('Failed to parse response: ' + error.message));
                    }
                },
                onerror: function(error) {
                    reject(new Error('Network error: ' + error.message));
                },
                ontimeout: function() {
                    reject(new Error('Request timeout'));
                }
            });
        });
    }
    
    // Main initialization
    async function initialize() {
        log('LMS AI Assistant Loader starting...', 'info');
        
        // Check if we're on the correct domain
        if (!window.location.hostname.includes(CONFIG.LMS_DOMAIN)) {
            log('Not on LMS domain, skipping initialization', 'info');
            return;
        }
        
        // Check if already approved
        const isApproved = GM_getValue('device_approved', false);
        const isPending = GM_getValue('device_pending', false);
        const isBlocked = GM_getValue('device_blocked', false);
        
        if (isBlocked) {
            log('Device is blocked', 'error');
            showNotification('Device is blocked by admin', 'error');
            return;
        }
        
        if (isApproved) {
            log('Device already approved, loading main script...', 'info');
            await loadMainScript();
        } else if (isPending) {
            log('Device approval pending, checking status...', 'info');
            showNotification('Checking device approval status...', 'info');
            
            // Check approval status immediately
            const approved = await checkApprovalStatus();
            
            if (!approved) {
                // Set up periodic checking
                setInterval(checkApprovalStatus, 30000); // Check every 30 seconds
            }
        } else {
            log('New device, requesting validation...', 'info');
            showNotification('Registering device with LMS AI Assistant...', 'info');
            
            const result = await validateDevice();
            
            if (result.approved) {
                await loadMainScript();
            } else if (result.pending) {
                // Set up periodic checking for approval
                setInterval(checkApprovalStatus, 30000);
            }
        }
    }
    
    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
    // Also start on page navigation (for SPA)
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            setTimeout(initialize, 1000); // Delay to allow page to load
        }
    }).observe(document, { subtree: true, childList: true });
    
    log('LMS AI Assistant Loader initialized', 'info');
})();

// ==UserScript==
// @name         LMS AI Assistant - {{EMAIL}}
// @namespace    https://wrongnumber.netlify.app
// @version      9.0.0
// @description  Production LMS AI Assistant - Silent operation with error-only prompts
// @author       Admin
// @match        https://king-lms.kcg.edu/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// @updateURL    https://wrongnumber.netlify.app/.netlify/functions/downloadScript
// @downloadURL  https://wrongnumber.netlify.app/.netlify/functions/downloadScript
// ==/UserScript==

(function() {
    'use strict';
    
    // Configuration
    const CONFIG = {
        EMAIL: '{{EMAIL}}',
        API_BASE: 'https://wrongnumber.netlify.app/.netlify/functions',
        LMS_DOMAIN: 'king-lms.kcg.edu'
    };
    
    // Silent operation - only show errors
    function showError(message) {
        if (typeof GM_notification !== 'undefined') {
            GM_notification({
                title: 'LMS AI Assistant - Error',
                text: message,
                timeout: 8000
            });
        }
        
        // Also show in-page error notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ef4444;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
            z-index: 10000;
            max-width: 350px;
            word-wrap: break-word;
            border-left: 4px solid #dc2626;
        `;
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;">⚠️</span>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 8000);
    }
    
    // Generate device fingerprint
    function generateDeviceInfo() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Device fingerprint', 2, 2);
        
        const hwid = btoa(JSON.stringify({
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            canvas: canvas.toDataURL()
        })).substring(0, 64);
        
        const fingerprint = btoa(JSON.stringify({
            plugins: Array.from(navigator.plugins).map(p => p.name).join(','),
            webgl: (() => {
                const gl = canvas.getContext('webgl');
                return gl ? gl.getParameter(gl.RENDERER) : 'none';
            })(),
            fonts: (() => {
                const testFonts = ['Arial', 'Times', 'Courier', 'Helvetica'];
                return testFonts.filter(font => {
                    const test = document.createElement('span');
                    test.style.fontFamily = font;
                    test.textContent = 'test';
                    document.body.appendChild(test);
                    const width = test.offsetWidth;
                    document.body.removeChild(test);
                    return width > 0;
                }).join(',');
            })()
        })).substring(0, 64);
        
        return { hwid, fingerprint };
    }
    
    // Make HTTP request
    function makeRequest(url, data) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: url,
                headers: {
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(data),
                timeout: 15000,
                onload: function(response) {
                    try {
                        if (response.status === 200) {
                            if (response.responseText.startsWith('{')) {
                                resolve(JSON.parse(response.responseText));
                            } else {
                                resolve(response.responseText);
                            }
                        } else {
                            reject(new Error(`HTTP ${response.status}`));
                        }
                    } catch (error) {
                        reject(error);
                    }
                },
                onerror: () => reject(new Error('Network error')),
                ontimeout: () => reject(new Error('Request timeout'))
            });
        });
    }
    
    // Load main script
    async function loadMainScript(deviceInfo) {
        try {
            const script = await makeRequest(`${CONFIG.API_BASE}/getMainScript`, {
                email: CONFIG.EMAIL,
                hwid: deviceInfo.hwid,
                fingerprint: deviceInfo.fingerprint
            });
            
            // Execute main script silently
            if (typeof script === 'string' && script.length > 100) {
                const scriptFunction = new Function(script);
                scriptFunction();
                // Success - no notification, silent operation
            } else {
                showError('No script available. Please contact administrator.');
            }
        } catch (scriptError) {
            showError('Failed to load main script. Please refresh the page.');
        }
    }
    
    // Check device status and load script if approved
    async function checkDeviceAndLoadScript() {
        try {
            const deviceInfo = generateDeviceInfo();
            
            // Check cached approval status first
            const cacheKey = `device_approved_${deviceInfo.hwid}`;
            const cachedStatus = GM_getValue(cacheKey, null);
            const cacheTime = GM_getValue(`${cacheKey}_time`, 0);
            const now = Date.now();
            
            // Use cache if it's less than 24 hours old and status is approved
            if (cachedStatus === 'approved' && (now - cacheTime) < 24 * 60 * 60 * 1000) {
                console.log('🔐 Using cached device approval status');
                await loadMainScript(deviceInfo);
                return;
            }
            
            // Check device status from server
            const statusResult = await makeRequest(`${CONFIG.API_BASE}/checkDeviceStatus`, {
                email: CONFIG.EMAIL,
                hwid: deviceInfo.hwid,
                fingerprint: deviceInfo.fingerprint
            });
            
            if (!statusResult.success) {
                // Device not registered - register it
                try {
                    await makeRequest(`${CONFIG.API_BASE}/registerDevice`, {
                        email: CONFIG.EMAIL,
                        hwid: deviceInfo.hwid,
                        fingerprint: deviceInfo.fingerprint
                    });
                    
                    showError('Device registration pending admin approval. Please contact administrator.');
                    return;
                } catch (regError) {
                    showError('Failed to register device. Please try again later.');
                    return;
                }
            }
            
            const status = statusResult.status;
            
            // Handle different device statuses
            switch (status) {
                case 'active':
                case 'approved':
                    // Cache the approved status for 24 hours
                    GM_setValue(cacheKey, 'approved');
                    GM_setValue(`${cacheKey}_time`, now);
                    console.log('🔐 Device approved! Caching status for 24 hours');
                    
                    // Load main script silently
                    await loadMainScript(deviceInfo);
                    break;
                    
                case 'pending':
                    showError('Device approval pending. Please contact administrator.');
                    break;
                    
                case 'blocked':
                case 'inactive':
                    showError('Device access blocked. Please contact administrator.');
                    break;
                    
                case 'maintenance':
                    showError('System is in maintenance mode. Please try again later.');
                    break;
                    
                default:
                    showError('Unknown device status. Please contact administrator.');
            }
            
        } catch (error) {
            // Clear cache on server error to allow retry on next load
            const deviceInfo = generateDeviceInfo();
            const cacheKey = `device_approved_${deviceInfo.hwid}`;
            GM_deleteValue(cacheKey);
            GM_deleteValue(`${cacheKey}_time`);
            console.log('⚠️ Server error - cleared device cache for retry');
            
            showError('Connection failed. Please check your internet connection.');
        }
    }
    
    // Initialize only once when page loads
    function initialize() {
        // Check if we're on the correct domain
        if (!window.location.hostname.includes(CONFIG.LMS_DOMAIN)) {
            return;
        }
        
        // Prevent multiple initializations
        if (window.lmsAiAssistantInitialized) {
            return;
        }
        window.lmsAiAssistantInitialized = true;
        
        // Check device status and load script (only once)
        checkDeviceAndLoadScript();
    }
    
    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();

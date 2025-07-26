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
        const { email, sitePassword } = JSON.parse(event.body);

        // Validate required fields
        if (!email || !sitePassword) {
            return {
                statusCode: 400,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Email and site password are required' 
                })
            };
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return {
                statusCode: 400,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Please enter a valid email address' 
                })
            };
        }

        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        // Get site password from database
        const { data: settingData, error: settingError } = await supabase
            .from('payment_settings')
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
            await supabase.from('logs_new').insert({
                log_type: 'security',
                level: 'warn',
                message: 'Failed site password attempt',
                details: { 
                    email, 
                    ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'] 
                },
                user_email: email,
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

        // Check if user is admin or has paid for access
        const { data: adminSettings } = await supabase
            .from('payment_settings')
            .select('setting_value')
            .eq('setting_key', 'admin_emails')
            .single();
        
        const adminEmails = (adminSettings?.setting_value || 'manojsedain40@gmail.com').split(',').map(e => e.trim());
        const isAdmin = adminEmails.includes(email);
        
        if (!isAdmin) {
            // Check if user has valid payment
            const { data: userPayment } = await supabase
                .from('payments')
                .select('id, payment_status, subscription_type, expires_at')
                .eq('email', email)
                .eq('payment_status', 'completed')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            
            if (!userPayment) {
                // No payment found - return payment required script
                const paymentRequiredScript = `// ==UserScript==
// @name         LMS AI Assistant - Payment Required
// @namespace    https://wrongnumber.netlify.app/
// @version      1.0.0
// @description  Payment required to access LMS AI Assistant
// @author       Developer
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    
    // Show payment required toast
    function showPaymentToast() {
        const toast = document.createElement('div');
        toast.style.cssText = \`
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #ff6b6b, #ee5a24);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            font-weight: 500;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 350px;
            cursor: pointer;
            transition: transform 0.3s ease;
        \`;
        
        toast.innerHTML = \`
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="font-size: 18px;">🔒</div>
                <div>
                    <div style="font-weight: 600; margin-bottom: 4px;">Payment Required</div>
                    <div style="font-size: 12px; opacity: 0.9;">Click here to purchase LMS AI Assistant access</div>
                </div>
            </div>
        \`;
        
        toast.addEventListener('click', () => {
            window.open('https://wrongnumber.netlify.app/#payment', '_blank');
        });
        
        toast.addEventListener('mouseenter', () => {
            toast.style.transform = 'scale(1.05)';
        });
        
        toast.addEventListener('mouseleave', () => {
            toast.style.transform = 'scale(1)';
        });
        
        document.body.appendChild(toast);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }
        }, 10000);
    }
    
    // Show toast when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', showPaymentToast);
    } else {
        showPaymentToast();
    }
})();`;
                
                return {
                    statusCode: 200,
                    headers: {
                        ...headers,
                        'Content-Disposition': 'attachment; filename="lms-payment-required.user.js"',
                        'Content-Type': 'application/javascript'
                    },
                    body: paymentRequiredScript
                };
            }
        }
        
        // Log successful access
        await supabase.from('logs_new').insert({
            log_type: 'info',
            level: 'info',
            message: isAdmin ? 'Admin script download' : 'Paid user script download',
            details: { 
                email,
                is_admin: isAdmin,
                payment_id: userPayment?.id || null,
                ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
            },
            user_email: email,
            ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
            user_agent: event.headers['user-agent']
        });

        // Generate device validation userscript
        const deviceValidationScript = `// ==UserScript==
// @name         LMS AI Assistant - Device Validator
// @namespace    https://wrongnumber.netlify.app/
// @version      8.2.3
// @description  Device validation and registration for LMS AI Assistant (appendChild fix applied)
// @author       LMS AI Assistant
// @match        https://king-lms.kcg.edu/ultra/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';
    
    console.log('🔐 LMS AI Assistant Device Validator v1.0.0 loaded!');
    
    const CONFIG = {
        EMAIL: '${email}',
        BACKEND_URL: '${event.headers.origin || 'https://wrongnumber.netlify.app'}/.netlify/functions'
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
            email: CONFIG.EMAIL,
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
    
    // Main initialization with caching optimization
    async function initialize() {
        deviceInfo = generateDeviceInfo();
        

        
        // Check cached approval status first
        const cacheKey = \`device_approved_\${deviceInfo.hwid}\`;
        const cachedStatus = GM_getValue(cacheKey, null);
        const cacheTime = GM_getValue(\`\${cacheKey}_time\`, 0);
        const now = Date.now();
        
        // Use cache if it's less than 24 hours old and status is approved
        if (cachedStatus === 'approved' && (now - cacheTime) < 24 * 60 * 60 * 1000) {

            loadMainScript();
            return;
        }
        
        // Register device if not cached or cache expired
        const registrationResult = await registerDevice();
        
        if (!registrationResult.success) {
            showStatusPanel('error', 'Registration failed: ' + registrationResult.message);
            return;
        }
        
        // Single device status check (no repeated intervals)
        const statusResult = await checkDeviceStatus();
        
        if (statusResult.success) {
            switch (statusResult.status) {
                case 'active':
                    // Cache the approved status for 24 hours
                    GM_setValue(cacheKey, 'approved');
                    GM_setValue(\`\${cacheKey}_time\`, now);

                    
                    loadMainScript();
                    break;
                    
                case 'blocked':
                    showStatusPanel('blocked', 'Device has been blocked by administrator');
                    break;
                    
                case 'pending':
                    showStatusPanel('pending', 'Device pending approval from administrator. Please contact your administrator.');
                    break;
                    
                default:
                    showStatusPanel('error', 'Unknown device status: ' + statusResult.status);
            }
        } else {
            // Clear cache on server error to allow retry on next load
            GM_deleteValue(cacheKey);
            GM_deleteValue(\`\${cacheKey}_time\`);
            console.log('⚠️ Server error - cleared device cache for retry');
            
            showStatusPanel('error', 'Failed to check device status. Please refresh the page.');
        }
    }
    
    // Start when page is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
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

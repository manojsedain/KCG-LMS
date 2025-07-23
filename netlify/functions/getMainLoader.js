// netlify/functions/getMainLoader.js - Deliver main-loader.js to validated devices
const { db } = require('../../utils/supabase');
const EncryptionUtils = require('../../utils/encryption');

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
            headers,
            body: JSON.stringify({ success: false, message: 'Method not allowed' })
        };
    }

    try {
        // Parse request body
        const { username, hwid, fingerprint, deviceId } = JSON.parse(event.body);

        // Validate required fields
        if (!username || !hwid || !fingerprint) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Missing required fields' 
                })
            };
        }

        // Get device from database
        const device = await db.getDevice(hwid, fingerprint);
        
        if (!device) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Device not found' 
                })
            };
        }

        // Check device status
        if (device.status !== 'active') {
            await db.createLog({
                log_type: 'security',
                level: 'warn',
                message: 'Unauthorized main loader request',
                details: { 
                    device_id: device.id, 
                    username,
                    status: device.status 
                },
                device_id: device.id,
                ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
            });

            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Device not authorized' 
                })
            };
        }

        // Check if device is expired
        if (new Date(device.expires_at) < new Date()) {
            await db.updateDeviceStatus(device.id, 'expired');
            
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Device registration expired' 
                })
            };
        }

        // Update device usage
        await db.updateDeviceUsage(device.id);

        // Get active script version
        const activeScript = await db.getActiveScript();
        if (!activeScript) {
            return {
                statusCode: 503,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'No active script available' 
                })
            };
        }

        // Generate main-loader.js content
        const mainLoaderScript = generateMainLoaderScript(device, activeScript);

        // Log successful delivery
        await db.createLog({
            log_type: 'script',
            level: 'info',
            message: 'Main loader delivered',
            details: { 
                device_id: device.id, 
                username,
                script_version: activeScript.version 
            },
            device_id: device.id,
            ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
        });

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/javascript',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            },
            body: mainLoaderScript
        };

    } catch (error) {
        console.error('Main loader delivery error:', error);

        await db.createLog({
            log_type: 'error',
            level: 'error',
            message: 'Main loader delivery error',
            details: { 
                error: error.message,
                stack: error.stack 
            },
            ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
        });

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Server error' 
            })
        };
    }
};

function generateMainLoaderScript(device, activeScript) {
    return `
// main-loader.js - LMS AI Assistant Main Loader
// Generated for device: ${device.id}
// Script version: ${activeScript.version}
// Generated at: ${new Date().toISOString()}

(function() {
    'use strict';
    
    const DEVICE_ID = '${device.id}';
    const USERNAME = '${device.username}';
    const SCRIPT_VERSION = '${activeScript.version}';
    const API_BASE = 'https://wrongnumber.netlify.app/.netlify/functions';
    
    // Device validation data
    const deviceData = {
        hwid: '${device.hwid}',
        fingerprint: '${device.fingerprint}',
        deviceId: DEVICE_ID,
        username: USERNAME
    };
    
    // Utility functions
    function log(message, level = 'info') {
        console.log(\`[LMS AI Assistant] [\${level.toUpperCase()}] \${message}\`);
    }
    
    function showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.style.cssText = \`
            position: fixed;
            top: 20px;
            right: 20px;
            background: \${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#3b82f6'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            max-width: 300px;
            word-wrap: break-word;
        \`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }
    
    // Validate device status
    async function validateDevice() {
        try {
            const response = await fetch(\`\${API_BASE}/validateDevice\`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(deviceData)
            });
            
            const data = await response.json();
            
            if (response.ok && data.success && (data.status === 'approved' || data.status === 'active')) {
                log('Device validation successful', 'info');
                return true;
            } else {
                log('Device validation failed: ' + data.message, 'error');
                showNotification('Device not authorized: ' + data.message, 'error');
                return false;
            }
            return true;
        } catch (error) {
            log('Device validation error: ' + error.message, 'error');
            showNotification('Device validation failed', 'error');
            return false;
        }
    }
    
    // Get decryption key
    async function getDecryptionKey() {
        try {
            const response = await fetch(\`\${API_BASE}/getDecryptionKey\`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(deviceData)
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.message);
            }
            
            return result.key;
        } catch (error) {
            log('Failed to get decryption key: ' + error.message, 'error');
            throw error;
        }
    }
    
    // Decrypt using Web Crypto API (browser native)
    async function decryptScript(encryptedData, key) {
        try {
            // Convert base64 encrypted data to ArrayBuffer
            const encryptedBytes = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
            
            // Extract IV (first 16 bytes) and encrypted content
            const iv = encryptedBytes.slice(0, 16);
            const encrypted = encryptedBytes.slice(16);
            
            // Import the key
            const cryptoKey = await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(key.padEnd(32, '0').slice(0, 32)), // Ensure 32 bytes for AES-256
                { name: 'AES-CBC' },
                false,
                ['decrypt']
            );
            
            // Decrypt the data
            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: 'AES-CBC', iv: iv },
                cryptoKey,
                encrypted
            );
            
            // Convert back to string
            return new TextDecoder().decode(decryptedBuffer);
        } catch (error) {
            log('Web Crypto API decryption failed, trying fallback: ' + error.message, 'warn');
            // Fallback: return encrypted data as-is for now
            return encryptedData;
        }
    }
    
    // Decrypt and execute script
    async function loadAndExecuteScript() {
        try {
            log('Starting script loading process', 'info');
            
            // Get decryption key
            const key = await getDecryptionKey();
            
            // Get encrypted script
            const response = await fetch(\`\${API_BASE}/getEncryptedScript\`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(deviceData)
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.message);
            }
            
            // Decrypt script using Web Crypto API
            const decryptedScript = await decryptScript(result.encryptedScript, key);
            
            if (!decryptedScript || decryptedScript === result.encryptedScript) {
                // If decryption failed, try to execute the script as-is (might be unencrypted for testing)
                log('Decryption may have failed, trying to execute script as-is', 'warn');
            }
            }
            
            log('Script decrypted successfully', 'info');
            
            // Execute the decrypted script
            eval(decryptedScript);
            
            log('LMS AI Assistant loaded successfully', 'success');
            showNotification('LMS AI Assistant loaded successfully', 'success');
            
        } catch (error) {
            log('Failed to load script: ' + error.message, 'error');
            showNotification('Failed to load LMS AI Assistant: ' + error.message, 'error');
        }
    }
    
    // Get update notes and device info for About menu
    async function getAboutInfo() {
        try {
            const response = await fetch(\`\${API_BASE}/getUpdateNotes\`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(deviceData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                return {
                    username: USERNAME,
                    deviceId: DEVICE_ID,
                    status: 'Active',
                    expiryDate: '${device.expires_at}',
                    scriptVersion: SCRIPT_VERSION,
                    updateNotes: result.updateNotes || 'No update notes available'
                };
            }
        } catch (error) {
            log('Failed to get about info: ' + error.message, 'error');
        }
        
        return {
            username: USERNAME,
            deviceId: DEVICE_ID,
            status: 'Active',
            expiryDate: '${device.expires_at}',
            scriptVersion: SCRIPT_VERSION,
            updateNotes: 'Failed to load update notes'
        };
    }
    
    // Create About menu
    function createAboutMenu() {
        // Only create if not already exists
        if (document.getElementById('lms-ai-about-menu')) {
            return;
        }
        
        const aboutButton = document.createElement('div');
        aboutButton.id = 'lms-ai-about-button';
        aboutButton.style.cssText = \`
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 50px;
            height: 50px;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 18px;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
            z-index: 9999;
            transition: transform 0.2s ease;
        \`;
        aboutButton.textContent = 'AI';
        aboutButton.title = 'LMS AI Assistant Info';
        
        aboutButton.addEventListener('mouseenter', () => {
            aboutButton.style.transform = 'scale(1.1)';
        });
        
        aboutButton.addEventListener('mouseleave', () => {
            aboutButton.style.transform = 'scale(1)';
        });
        
        aboutButton.addEventListener('click', async () => {
            const aboutInfo = await getAboutInfo();
            showAboutModal(aboutInfo);
        });
        
        document.body.appendChild(aboutButton);
    }
    
    // Show About modal
    function showAboutModal(aboutInfo) {
        // Remove existing modal if any
        const existingModal = document.getElementById('lms-ai-about-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        const modal = document.createElement('div');
        modal.id = 'lms-ai-about-modal';
        modal.style.cssText = \`
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        \`;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = \`
            background: white;
            border-radius: 12px;
            padding: 24px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        \`;
        
        modalContent.innerHTML = \`
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #1f2937; font-size: 24px;">LMS AI Assistant</h2>
                <button id="close-about-modal" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
            </div>
            
            <div style="margin-bottom: 16px;">
                <strong style="color: #374151;">Username:</strong>
                <span style="color: #6b7280; margin-left: 8px;">\${aboutInfo.username}</span>
            </div>
            
            <div style="margin-bottom: 16px;">
                <strong style="color: #374151;">Device ID:</strong>
                <span style="color: #6b7280; margin-left: 8px; font-family: monospace; font-size: 12px;">\${aboutInfo.deviceId}</span>
            </div>
            
            <div style="margin-bottom: 16px;">
                <strong style="color: #374151;">Status:</strong>
                <span style="color: #10b981; margin-left: 8px;">\${aboutInfo.status}</span>
            </div>
            
            <div style="margin-bottom: 16px;">
                <strong style="color: #374151;">Expires:</strong>
                <span style="color: #6b7280; margin-left: 8px;">\${new Date(aboutInfo.expiryDate).toLocaleDateString()}</span>
            </div>
            
            <div style="margin-bottom: 16px;">
                <strong style="color: #374151;">Script Version:</strong>
                <span style="color: #6b7280; margin-left: 8px;">\${aboutInfo.scriptVersion}</span>
            </div>
            
            <div style="margin-bottom: 20px;">
                <strong style="color: #374151;">Update Notes:</strong>
                <div style="background: #f9fafb; padding: 12px; border-radius: 8px; margin-top: 8px; color: #6b7280; font-size: 14px; line-height: 1.5;">
                    \${aboutInfo.updateNotes}
                </div>
            </div>
            
            <div style="text-align: center; color: #9ca3af; font-size: 12px;">
                Powered by LMS AI Assistant v\${aboutInfo.scriptVersion}
            </div>
        \`;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Close modal handlers
        document.getElementById('close-about-modal').addEventListener('click', () => {
            modal.remove();
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }
    
    // Load CryptoJS library
    function loadCryptoJS() {
        return new Promise((resolve, reject) => {
            if (window.CryptoJS) {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    // Main initialization
    async function initialize() {
        try {
            log('Initializing LMS AI Assistant...', 'info');
            
            // Validate device first
            const isValid = await validateDevice();
            if (!isValid) {
                return;
            }
            
            // Load CryptoJS
            await loadCryptoJS();
            log('CryptoJS loaded', 'info');
            
            // Create About menu
            createAboutMenu();
            
            // Load and execute the main script
            await loadAndExecuteScript();
            
        } catch (error) {
            log('Initialization error: ' + error.message, 'error');
            showNotification('Failed to initialize LMS AI Assistant', 'error');
        }
    }
    
    // Start initialization when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
    // Expose global functions for the main script
    window.LMS_AI_ASSISTANT = {
        log,
        showNotification,
        getAboutInfo,
        deviceData,
        API_BASE
    };
    
})();
`;
}

// netlify/functions/loader.js - Generate and deliver personalized loader script
const { db } = require('../../utils/supabase');
const fs = require('fs').promises;
const path = require('path');

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
    if (!['GET', 'POST'].includes(event.httpMethod)) {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ success: false, message: 'Method not allowed' })
        };
    }

    try {
        let username, sitePassword;

        if (event.httpMethod === 'GET') {
            // Extract from query parameters
            username = event.queryStringParameters?.username;
            sitePassword = event.queryStringParameters?.password;
        } else {
            // Extract from POST body
            const body = JSON.parse(event.body || '{}');
            username = body.username;
            sitePassword = body.sitePassword;
        }

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

        // Validate site password (with fallback)
        let storedSitePassword;
        try {
            storedSitePassword = await db.getSetting('site_password') || process.env.SITE_PASSWORD || 'wrongnumber';
        } catch (error) {
            // Fallback if database is not available
            storedSitePassword = process.env.SITE_PASSWORD || 'wrongnumber';
        }
        if (sitePassword !== storedSitePassword) {
            try {
                await db.createLog({
                    log_type: 'security',
                    level: 'warn',
                    message: 'Invalid site password for loader download',
                    details: {
                        username,
                        ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
                        user_agent: event.headers['user-agent']
                    },
                    ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
                });
            } catch (logError) {
                console.log('Could not log security event:', logError.message);
            }

            return {
                statusCode: 401,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Invalid site password' 
                })
            };
        }

        // Validate username (basic sanitization)
        if (!/^[a-zA-Z0-9_-]+$/.test(username) || username.length > 50) {
            return {
                statusCode: 400,
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Invalid username format' 
                })
            };
        }

        // Read the loader template
        let loaderTemplate;
        try {
            // Try to read from the scripts directory
            const templatePath = path.join(__dirname, '../../scripts/loader-template.js');
            loaderTemplate = await fs.readFile(templatePath, 'utf8');
        } catch (error) {
            // Fallback: inline template if file not found
            loaderTemplate = getInlineLoaderTemplate();
        }

        // Replace placeholders in the template
        const personalizedLoader = loaderTemplate
            .replace(/\{\{USERNAME\}\}/g, username)
            .replace(/\{\{SITE_PASSWORD\}\}/g, sitePassword)
            .replace(/\{\{TIMESTAMP\}\}/g, new Date().toISOString())
            .replace(/\{\{VERSION\}\}/g, '1.0.0');

        // Log successful loader generation
        try {
            await db.createLog({
                log_type: 'script',
                level: 'info',
                message: 'Loader script generated',
                details: {
                    username,
                    ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
                    user_agent: event.headers['user-agent']
                },
                ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
            });
        } catch (logError) {
            console.log('Could not log success event:', logError.message);
        }

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Disposition': `attachment; filename="loader-${username}.user.js"`,
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            },
            body: personalizedLoader
        };

    } catch (error) {
        console.error('Loader generation error:', error);

        await db.createLog({
            log_type: 'error',
            level: 'error',
            message: 'Loader generation error',
            details: { 
                error: error.message,
                stack: error.stack 
            },
            ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip']
        });

        return {
            statusCode: 500,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                success: false, 
                message: 'Server error generating loader script' 
            })
        };
    }
};

// Fallback inline template if file reading fails
function getInlineLoaderTemplate() {
    return `// ==UserScript==
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
        VERSION: '{{VERSION}}'
    };
    
    console.log('[LMS AI Assistant] Loader initialized for user: ' + CONFIG.USERNAME);
    
    // Basic device validation and main script loading logic
    // This is a simplified version - the full template should be used
    
    async function initialize() {
        console.log('[LMS AI Assistant] Starting initialization...');
        
        // Check if on correct domain
        if (!window.location.hostname.includes(CONFIG.LMS_DOMAIN)) {
            return;
        }
        
        // Basic notification
        const notification = document.createElement('div');
        notification.style.cssText = \`
            position: fixed;
            top: 20px;
            right: 20px;
            background: #3b82f6;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-family: sans-serif;
            font-size: 14px;
            z-index: 10000;
        \`;
        notification.textContent = 'LMS AI Assistant Loader Active';
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
    
    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
})();`;
}

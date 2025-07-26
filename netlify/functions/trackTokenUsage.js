// netlify/functions/trackTokenUsage.js - Track token usage by email for analytics

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
    'Content-Type': 'application/json'
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
        const requestData = JSON.parse(event.body || '{}');
        const { 
            email, 
            hwid, 
            fingerprint,
            tokensUsed, 
            provider, 
            feature, 
            prompt, 
            response,
            sessionId,
            timestamp 
        } = requestData;

        // Validate required fields
        if (!email || !tokensUsed || !provider || !feature) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Email, tokensUsed, provider, and feature are required' 
                })
            };
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Invalid email format' 
                })
            };
        }

        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        // Insert token usage record
        const { data: tokenRecord, error: tokenError } = await supabase
            .from('token_usage')
            .insert({
                email: email,
                device_hwid: hwid || 'unknown',
                device_fingerprint: fingerprint || 'unknown',
                tokens_used: parseInt(tokensUsed),
                provider: provider,
                feature_type: feature,
                prompt_text: prompt ? prompt.substring(0, 1000) : null, // Limit prompt length
                response_text: response ? response.substring(0, 2000) : null, // Limit response length
                session_id: sessionId || null
                // created_at will be set automatically by DEFAULT NOW()
            })
            .select()
            .single();

        if (tokenError) {
            console.error('Error inserting token usage:', tokenError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Failed to record token usage: ' + tokenError.message 
                })
            };
        }

        // Update or create user token summary
        const { data: existingSummary, error: summaryFetchError } = await supabase
            .from('token_usage_summary')
            .select('*')
            .eq('email', email)
            .single();

        if (summaryFetchError && summaryFetchError.code !== 'PGRST116') { // PGRST116 = no rows found
            console.error('Error fetching token summary:', summaryFetchError);
        }

        if (existingSummary) {
            // Update existing summary
            const { error: updateError } = await supabase
                .from('token_usage_summary')
                .update({
                    total_tokens: existingSummary.total_tokens + parseInt(tokensUsed),
                    total_requests: existingSummary.total_requests + 1,
                    last_used: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('email', email);

            if (updateError) {
                console.error('Error updating token summary:', updateError);
            }
        } else {
            // Create new summary
            const { error: insertError } = await supabase
                .from('token_usage_summary')
                .insert({
                    email: email,
                    total_tokens: parseInt(tokensUsed),
                    total_requests: 1,
                    first_used: new Date().toISOString(),
                    last_used: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

            if (insertError) {
                console.error('Error creating token summary:', insertError);
            }
        }

        // Log the token usage for admin monitoring
        await supabase.from('logs').insert({
            log_type: 'token_usage',
            level: 'info',
            message: `Token usage recorded: ${tokensUsed} tokens for ${feature}`,
            details: {
                email: email,
                tokens: parseInt(tokensUsed),
                provider: provider,
                feature: feature,
                session_id: sessionId
            },
            user_email: email,
            ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
            user_agent: event.headers['user-agent'],
            created_at: new Date().toISOString()
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Token usage recorded successfully',
                recordId: tokenRecord.id,
                tokensRecorded: parseInt(tokensUsed)
            })
        };

    } catch (error) {
        console.error('Token tracking error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Server error: ' + error.message 
            })
        };
    }
};

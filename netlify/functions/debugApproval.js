// Debug function to test device approval specifically
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const CONFIG = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    JWT_SECRET: process.env.JWT_SECRET || 'V+3stApVGE9zLpJFf79RA4SAc/w2vqJygx5wQ2hW/OlGLN/rhEPFHV1tRR+zcO2APsrvMwy+IO6IgN7+jSghTw=='
};

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        console.log('Debug approval - Event body:', event.body);
        
        const { deviceId, token } = JSON.parse(event.body);
        console.log('Debug approval - Device ID:', deviceId);
        console.log('Debug approval - Token exists:', !!token);

        // Verify admin session
        if (!token) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, message: 'No token provided' })
            };
        }

        try {
            const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
            console.log('Debug approval - JWT decoded:', decoded);
            if (!decoded || decoded.role !== 'admin') {
                return {
                    statusCode: 401,
                    headers,
                    body: JSON.stringify({ success: false, message: 'Invalid session' })
                };
            }
        } catch (jwtError) {
            console.error('Debug approval - JWT error:', jwtError);
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, message: 'JWT verification failed' })
            };
        }

        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);
        console.log('Debug approval - Supabase client initialized');

        // First, check if device exists
        const { data: existingDevice, error: fetchError } = await supabase
            .from('devices')
            .select('*')
            .eq('id', deviceId)
            .single();

        console.log('Debug approval - Existing device:', existingDevice);
        console.log('Debug approval - Fetch error:', fetchError);

        if (fetchError) {
            console.error('Debug approval - Error fetching device:', fetchError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: 'Error fetching device: ' + fetchError.message
                })
            };
        }

        if (!existingDevice) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ success: false, message: 'Device not found' })
            };
        }

        // Try to update the device
        console.log('Debug approval - Attempting to update device status to active');
        const { data, error } = await supabase
            .from('devices')
            .update({
                status: 'active',
                approved_at: new Date().toISOString(),
                approved_by: 'admin',
                updated_at: new Date().toISOString()
            })
            .eq('id', deviceId)
            .select();

        console.log('Debug approval - Update result:', data);
        console.log('Debug approval - Update error:', error);

        if (error) {
            console.error('Debug approval - Update error details:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: 'Error updating device: ' + error.message,
                    details: error
                })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Device approved successfully',
                device: data[0],
                debug: {
                    originalDevice: existingDevice,
                    updatedDevice: data[0]
                }
            })
        };

    } catch (error) {
        console.error('Debug approval - General error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                message: 'Server error: ' + error.message,
                stack: error.stack
            })
        };
    }
};

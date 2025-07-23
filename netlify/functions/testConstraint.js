// Simple constraint test function
const { createClient } = require('@supabase/supabase-js');

const CONFIG = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
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
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        // Get the first pending device
        const { data: devices, error: fetchError } = await supabase
            .from('devices')
            .select('*')
            .eq('status', 'pending')
            .limit(1);

        if (fetchError || !devices || devices.length === 0) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: 'No pending devices found',
                    error: fetchError
                })
            };
        }

        const device = devices[0];
        console.log('Test constraint - Found device:', device);

        // Test 1: Try updating just the status to 'active'
        console.log('Test constraint - Test 1: Update status to active');
        const { data: result1, error: error1 } = await supabase
            .from('devices')
            .update({ status: 'active' })
            .eq('id', device.id)
            .select();

        console.log('Test constraint - Test 1 result:', result1);
        console.log('Test constraint - Test 1 error:', error1);

        if (error1) {
            // Test 2: Try other allowed statuses
            console.log('Test constraint - Test 2: Try blocked status');
            const { data: result2, error: error2 } = await supabase
                .from('devices')
                .update({ status: 'blocked' })
                .eq('id', device.id)
                .select();

            console.log('Test constraint - Test 2 result:', result2);
            console.log('Test constraint - Test 2 error:', error2);

            // Test 3: Try expired status
            console.log('Test constraint - Test 3: Try expired status');
            const { data: result3, error: error3 } = await supabase
                .from('devices')
                .update({ status: 'expired' })
                .eq('id', device.id)
                .select();

            console.log('Test constraint - Test 3 result:', result3);
            console.log('Test constraint - Test 3 error:', error3);

            // Revert to pending
            await supabase
                .from('devices')
                .update({ status: 'pending' })
                .eq('id', device.id);
        } else {
            // Success! Revert to pending
            await supabase
                .from('devices')
                .update({ status: 'pending' })
                .eq('id', device.id);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                device: device,
                tests: {
                    active: { result: result1, error: error1 },
                    blocked: error1 ? { result: result2, error: error2 } : null,
                    expired: error1 ? { result: result3, error: error3 } : null
                }
            })
        };

    } catch (error) {
        console.error('Test constraint error:', error);
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

// netlify/functions/testRegister.js - Test registerDevice with actual data

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
    'Access-Control-Allow-Credentials': 'false',
    'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        console.log('Test Register - Starting test...');
        
        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);
        
        // Test data
        const testData = {
            username: 'testuser',
            hwid: 'test-hwid-12345',
            fingerprint: 'test-fingerprint-67890',
            deviceName: 'Test Device',
            browserInfo: 'Test Browser',
            osInfo: 'Test OS'
        };
        
        console.log('Test Register - Test data:', testData);
        
        // Step 1: Test user creation/retrieval
        console.log('Test Register - Step 1: Testing user creation...');
        let userId = null;
        const { data: existingUser, error: userCheckError } = await supabase
            .from('users')
            .select('id')
            .eq('username', testData.username)
            .single();

        if (userCheckError && userCheckError.code !== 'PGRST116') {
            console.error('Test Register - User check error:', userCheckError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'User check failed',
                    error: userCheckError.message
                })
            };
        }

        if (existingUser) {
            userId = existingUser.id;
            console.log('Test Register - Found existing user:', userId);
        } else {
            console.log('Test Register - Creating new user...');
            const { data: newUser, error: userCreateError } = await supabase
                .from('users')
                .insert({ username: testData.username })
                .select('id')
                .single();

            if (userCreateError) {
                console.error('Test Register - User creation error:', userCreateError);
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        message: 'User creation failed',
                        error: userCreateError.message
                    })
                };
            }
            userId = newUser.id;
            console.log('Test Register - Created new user:', userId);
        }
        
        // Step 2: Test AES key generation
        console.log('Test Register - Step 2: Testing AES key generation...');
        let aesKeyData;
        try {
            const { data, error: aesError } = await supabase
                .rpc('generate_aes_key');
            
            if (aesError) {
                console.error('Test Register - AES RPC error:', aesError);
                const crypto = require('crypto');
                aesKeyData = crypto.randomBytes(32).toString('base64');
                console.log('Test Register - Using fallback AES key');
            } else {
                aesKeyData = data;
                console.log('Test Register - AES key generated successfully');
            }
        } catch (error) {
            console.error('Test Register - AES generation exception:', error);
            const crypto = require('crypto');
            aesKeyData = crypto.randomBytes(32).toString('base64');
            console.log('Test Register - Using fallback AES key after exception');
        }
        
        // Step 3: Test auto-approval setting
        console.log('Test Register - Step 3: Testing auto-approval setting...');
        const { data: autoApproveData, error: settingError } = await supabase
            .from('admin_settings')
            .select('setting_value')
            .eq('setting_key', 'auto_approve_devices')
            .single();

        const autoApprove = settingError ? false : autoApproveData.setting_value === 'true';
        const deviceStatus = autoApprove ? 'active' : 'pending';
        console.log('Test Register - Auto approve:', autoApprove, 'Status:', deviceStatus);
        
        // Step 4: Test device creation (this is likely where the error occurs)
        console.log('Test Register - Step 4: Testing device creation...');
        const deviceData = {
            user_id: userId,
            username: testData.username,
            hwid: testData.hwid,
            fingerprint: testData.fingerprint,
            device_name: testData.deviceName,
            browser_info: testData.browserInfo,
            os_info: testData.osInfo,
            status: deviceStatus,
            aes_key: aesKeyData,
            approved_at: autoApprove ? new Date().toISOString() : null,
            approved_by: autoApprove ? 'system' : null
        };
        
        console.log('Test Register - Device data to insert:', deviceData);
        
        const { data: newDevice, error: deviceError } = await supabase
            .from('devices')
            .insert(deviceData)
            .select('id')
            .single();

        if (deviceError) {
            console.error('Test Register - Device creation error:', deviceError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Device creation failed',
                    error: deviceError.message,
                    details: deviceError.details,
                    hint: deviceError.hint,
                    code: deviceError.code
                })
            };
        }
        
        console.log('Test Register - Device created successfully:', newDevice.id);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                message: 'Test register completed successfully',
                userId,
                deviceId: newDevice.id,
                autoApprove,
                aesKeyLength: aesKeyData.length
            })
        };

    } catch (error) {
        console.error('Test Register - General error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Test failed: ' + error.message,
                stack: error.stack
            })
        };
    }
};

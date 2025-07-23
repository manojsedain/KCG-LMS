// Database schema inspection function
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
        const { token } = JSON.parse(event.body);

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
            if (!decoded || decoded.role !== 'admin') {
                return {
                    statusCode: 401,
                    headers,
                    body: JSON.stringify({ success: false, message: 'Invalid session' })
                };
            }
        } catch (jwtError) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, message: 'JWT verification failed' })
            };
        }

        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        // Inspect devices table schema
        console.log('Schema inspection - Checking devices table structure');
        
        // Get table information
        const { data: tableInfo, error: tableError } = await supabase
            .from('information_schema.columns')
            .select('column_name, data_type, is_nullable, column_default')
            .eq('table_name', 'devices')
            .eq('table_schema', 'public');

        console.log('Schema inspection - Table info:', tableInfo);
        console.log('Schema inspection - Table error:', tableError);

        // Get check constraints
        const { data: constraints, error: constraintError } = await supabase
            .from('information_schema.check_constraints')
            .select('constraint_name, check_clause')
            .eq('constraint_schema', 'public');

        console.log('Schema inspection - Constraints:', constraints);
        console.log('Schema inspection - Constraint error:', constraintError);

        // Get a sample device record to inspect current data
        const { data: sampleDevice, error: sampleError } = await supabase
            .from('devices')
            .select('*')
            .limit(1)
            .single();

        console.log('Schema inspection - Sample device:', sampleDevice);
        console.log('Schema inspection - Sample error:', sampleError);

        // Test direct SQL query to check constraint
        const { data: sqlResult, error: sqlError } = await supabase
            .rpc('exec_sql', { 
                sql: "SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'status'" 
            });

        console.log('Schema inspection - SQL result:', sqlResult);
        console.log('Schema inspection - SQL error:', sqlError);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                schema: {
                    tableInfo: tableInfo,
                    constraints: constraints,
                    sampleDevice: sampleDevice,
                    sqlResult: sqlResult
                }
            })
        };

    } catch (error) {
        console.error('Schema inspection error:', error);
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

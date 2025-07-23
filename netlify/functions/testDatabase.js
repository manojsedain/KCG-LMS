// Test database connection and check script_updates table
exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const { createClient } = require('@supabase/supabase-js');
        
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
        
        console.log('Testing database connection...');
        console.log('URL:', supabaseUrl ? 'Present' : 'Missing');
        console.log('Key:', supabaseKey ? 'Present' : 'Missing');
        
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // Test 1: Check table structure
        const { data: tableInfo, error: tableError } = await supabase
            .from('script_updates')
            .select('*')
            .limit(0);
        
        console.log('Table structure test:', { error: tableError });
        
        // Test 2: Try to get all records (including potentially corrupted ones)
        const { data: allRecords, error: allError } = await supabase
            .from('script_updates')
            .select('*')
            .order('created_at', { ascending: false });
        
        console.log('All records query:', { 
            count: allRecords?.length || 0, 
            error: allError,
            records: allRecords?.map(r => ({
                id: r.id,
                version: r.version,
                created_at: r.created_at,
                is_active: r.is_active,
                created_by: r.created_by,
                file_size: r.file_size,
                has_script: !!r.encrypted_script
            }))
        });
        
        // Test 3: Check for any records at all
        const { count, error: countError } = await supabase
            .from('script_updates')
            .select('*', { count: 'exact', head: true });
        
        console.log('Count query:', { count, error: countError });
        
        // Test 4: Try inserting a test record
        const testRecord = {
            version: 'test-1.0.0',
            encrypted_script: Buffer.from('console.log("test");').toString('base64'),
            update_notes: 'Test upload',
            is_active: false,
            created_by: 'test-user',
            file_size: 20,
            checksum: 'test-checksum'
        };
        
        const { data: insertTest, error: insertError } = await supabase
            .from('script_updates')
            .insert(testRecord)
            .select()
            .single();
        
        console.log('Insert test:', { data: insertTest, error: insertError });
        
        // Clean up test record if it was created
        if (insertTest?.id) {
            await supabase
                .from('script_updates')
                .delete()
                .eq('id', insertTest.id);
        }
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                debug: {
                    environment: {
                        supabaseUrl: !!supabaseUrl,
                        supabaseKey: !!supabaseKey
                    },
                    tableStructure: {
                        error: tableError
                    },
                    allRecords: {
                        count: allRecords?.length || 0,
                        error: allError,
                        records: allRecords?.map(r => ({
                            id: r.id,
                            version: r.version,
                            created_at: r.created_at,
                            is_active: r.is_active,
                            created_by: r.created_by,
                            file_size: r.file_size,
                            update_notes: r.update_notes,
                            hasScript: !!r.encrypted_script,
                            scriptLength: r.encrypted_script?.length || 0
                        })) || []
                    },
                    recordCount: {
                        count,
                        error: countError
                    },
                    insertTest: {
                        success: !!insertTest,
                        error: insertError
                    }
                }
            })
        };

    } catch (error) {
        console.error('Database test error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                message: 'Test error: ' + error.message,
                stack: error.stack
            })
        };
    }
};

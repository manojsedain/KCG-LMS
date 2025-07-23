// Debug function to check script loading from database
exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const { createClient } = require('@supabase/supabase-js');
        
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;
        
        console.log('Environment check:');
        console.log('SUPABASE_URL:', supabaseUrl ? 'Present' : 'Missing');
        console.log('SUPABASE_ANON_KEY:', supabaseKey ? 'Present' : 'Missing');
        
        if (!supabaseUrl || !supabaseKey) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Missing Supabase environment variables',
                    debug: {
                        supabaseUrl: !!supabaseUrl,
                        supabaseKey: !!supabaseKey
                    }
                })
            };
        }
        
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        // Check database connection and query scripts
        console.log('Querying script_updates table...');
        const { data: allScripts, error: allError } = await supabase
            .from('script_updates')
            .select('id, version, is_active, created_at, file_size, update_notes')
            .order('created_at', { ascending: false });
        
        console.log('All scripts query result:', { data: allScripts, error: allError });
        
        // Check for active scripts specifically
        const { data: activeScripts, error: activeError } = await supabase
            .from('script_updates')
            .select('id, version, is_active, created_at, file_size, update_notes, encrypted_script')
            .eq('is_active', true)
            .order('created_at', { ascending: false });
        
        console.log('Active scripts query result:', { 
            data: activeScripts?.map(s => ({ ...s, encrypted_script: s.encrypted_script ? `${s.encrypted_script.length} chars` : 'null' })), 
            error: activeError 
        });
        
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
                    allScripts: {
                        count: allScripts?.length || 0,
                        scripts: allScripts?.map(s => ({
                            id: s.id,
                            version: s.version,
                            is_active: s.is_active,
                            created_at: s.created_at,
                            file_size: s.file_size,
                            update_notes: s.update_notes
                        })) || [],
                        error: allError
                    },
                    activeScripts: {
                        count: activeScripts?.length || 0,
                        scripts: activeScripts?.map(s => ({
                            id: s.id,
                            version: s.version,
                            is_active: s.is_active,
                            created_at: s.created_at,
                            file_size: s.file_size,
                            update_notes: s.update_notes,
                            hasScript: !!s.encrypted_script,
                            scriptLength: s.encrypted_script?.length || 0
                        })) || [],
                        error: activeError
                    }
                }
            })
        };

    } catch (error) {
        console.error('Debug script loading error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Debug error: ' + error.message,
                stack: error.stack
            })
        };
    }
};

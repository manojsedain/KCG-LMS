// netlify/functions/scriptUpload.js - Script file upload management
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const multipart = require('lambda-multipart-parser');

// Configuration
const CONFIG = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    JWT_SECRET: process.env.JWT_SECRET || 'V+3stApVGE9zLpJFf79RA4SAc/w2vqJygx5wQ2hW/OlGLN/rhEPFHV1tRR+zcO2APsrvMwy+IO6IgN7+jSghTw=='
};

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
        // Parse multipart form data
        const result = await multipart.parse(event);
        
        // Extract token from form data
        const token = result.token;
        
        // Check if token is provided
        if (!token) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, message: 'jwt must be provided' })
            };
        }

        // Verify admin token
        try {
            const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
            if (!decoded || decoded.role !== 'admin') {
                return {
                    statusCode: 401,
                    headers,
                    body: JSON.stringify({ success: false, message: 'Unauthorized' })
                };
            }
        } catch (jwtError) {
            console.error('JWT verification error:', jwtError);
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, message: 'Invalid or expired token' })
            };
        }

        // Check if file was uploaded
        if (!result.files || result.files.length === 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, message: 'No file uploaded' })
            };
        }

        const file = result.files[0];
        
        // Validate file type (should be JavaScript)
        const allowedExtensions = ['.js', '.user.js'];
        const fileName = file.filename || '';
        const fileExtension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
        
        if (!allowedExtensions.includes(fileExtension)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Invalid file type. Only .js and .user.js files are allowed.' 
                })
            };
        }

        // Validate file size (max 10MB to handle large userscripts)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.content.length > maxSize) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'File too large. Maximum size is 10MB.' 
                })
            };
        }

        // Convert buffer to string
        const scriptContent = file.content.toString('utf8');
        
        // Extract script metadata from content
        const scriptName = result.scriptName || fileName.replace(/\.(user\.)?js$/, '');
        const scriptDescription = result.scriptDescription || 'Uploaded script';
        const scriptVersion = extractVersionFromScript(scriptContent) || '1.0.0';
        
        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        // Check if script with same name already exists
        const { data: existingScript, error: checkError } = await supabase
            .from('script_updates')
            .select('id, version')
            .eq('created_by', scriptName)
            .single();

        let scriptId;
        
        if (existingScript) {
            // Update existing script
            const { data: updatedScript, error: updateError } = await supabase
                .from('script_updates')
                .update({
                    encrypted_script: Buffer.from(scriptContent).toString('base64'),
                    update_notes: scriptDescription,
                    version: scriptVersion,
                    file_size: file.content.length,
                    is_active: true
                })
                .eq('id', existingScript.id)
                .select()
                .single();

            if (updateError) {
                console.error('Error updating script:', updateError);
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        message: 'Failed to update script: ' + updateError.message 
                    })
                };
            }

            scriptId = updatedScript.id;

            // Log the update
            await supabase.from('logs').insert({
                log_type: 'admin',
                level: 'info',
                message: `Script updated via file upload: ${scriptName}`,
                details: { 
                    script_id: scriptId,
                    script_name: scriptName,
                    file_name: fileName,
                    file_size: file.content.length,
                    version: scriptVersion
                }
            });

        } else {
            // Create new script
            const { data: newScript, error: insertError } = await supabase
                .from('script_updates')
                .insert({
                    version: scriptVersion,
                    encrypted_script: Buffer.from(scriptContent).toString('base64'),
                    update_notes: scriptDescription,
                    is_active: true,
                    created_by: scriptName,
                    file_size: file.content.length,
                    checksum: require('crypto').createHash('sha256').update(scriptContent).digest('hex')
                })
                .select()
                .single();

            if (insertError) {
                console.error('Error creating script:', insertError);
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        message: 'Failed to create script: ' + insertError.message 
                    })
                };
            }

            scriptId = newScript.id;

            // Log the creation
            await supabase.from('logs').insert({
                log_type: 'admin',
                level: 'info',
                message: `New script uploaded: ${scriptName}`,
                details: { 
                    script_id: scriptId,
                    script_name: scriptName,
                    file_name: fileName,
                    file_size: file.content.length,
                    version: scriptVersion
                }
            });
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: existingScript ? 'Script updated successfully' : 'Script uploaded successfully',
                script: {
                    id: scriptId,
                    name: scriptName,
                    version: scriptVersion,
                    size: file.content.length
                }
            })
        };

    } catch (error) {
        console.error('Script upload error:', error);
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

// Extract version from userscript header
function extractVersionFromScript(content) {
    const versionMatch = content.match(/@version\s+(.+)/i);
    return versionMatch ? versionMatch[1].trim() : null;
}

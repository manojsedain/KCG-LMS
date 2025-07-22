// netlify/functions/manageScripts.js - Admin script management
const { db } = require('../../utils/supabase');
const EncryptionUtils = require('../../utils/encryption');

// Configuration
const CONFIG = {
    JWT_SECRET: process.env.JWT_SECRET || 'your-jwt-secret-key'
};

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

// Verify admin session
async function verifyAdminSession(token) {
    if (!token) {
        return { valid: false, error: 'No token provided' };
    }

    const payload = EncryptionUtils.verifyToken(token, CONFIG.JWT_SECRET);
    
    if (!payload || payload.type !== 'admin_session') {
        return { valid: false, error: 'Invalid or expired session' };
    }

    return { valid: true, payload };
}

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
        const { action, token, ...actionData } = JSON.parse(event.body);

        // Verify admin session
        const sessionCheck = await verifyAdminSession(token);
        if (!sessionCheck.valid) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: sessionCheck.error 
                })
            };
        }

        const clientIP = event.headers['x-forwarded-for'] || event.headers['x-real-ip'];

        switch (action) {
            case 'uploadScript':
                const { scriptContent, version, updateNotes } = actionData;
                
                if (!scriptContent || !version) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Script content and version are required' 
                        })
                    };
                }

                // Generate a random AES key for encryption
                const encryptionKey = EncryptionUtils.generateKey();
                
                // Encrypt the script content
                const encryptedScript = EncryptionUtils.encrypt(scriptContent, encryptionKey);
                
                // Create checksum for integrity verification
                const checksum = EncryptionUtils.createChecksum(scriptContent);
                
                // Store the script in database
                const scriptUpdate = await db.createScriptUpdate({
                    version,
                    encrypted_script: encryptedScript,
                    update_notes: updateNotes || 'No update notes provided',
                    created_by: 'admin',
                    file_size: scriptContent.length,
                    checksum
                });

                // Store the encryption key separately (in a secure way)
                // For this implementation, we'll store it as a setting
                await db.setSetting(`script_key_${scriptUpdate.id}`, encryptionKey, 'string');

                // Log script upload
                await db.createLog({
                    log_type: 'admin',
                    level: 'info',
                    message: 'New script version uploaded',
                    details: { 
                        script_id: scriptUpdate.id,
                        version,
                        file_size: scriptContent.length,
                        checksum
                    },
                    ip_address: clientIP
                });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        scriptId: scriptUpdate.id,
                        message: 'Script uploaded and encrypted successfully'
                    })
                };

            case 'getScriptHistory':
                const scriptHistory = await db.getScriptHistory();
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        scripts: scriptHistory
                    })
                };

            case 'activateScript':
                const { scriptId } = actionData;
                
                if (!scriptId) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Script ID is required' 
                        })
                    };
                }

                // Deactivate all scripts first
                const { error: deactivateError } = await db.supabase
                    .from('script_updates')
                    .update({ is_active: false })
                    .eq('is_active', true);

                if (deactivateError) throw deactivateError;

                // Activate the selected script
                const { data: activatedScript, error: activateError } = await db.supabase
                    .from('script_updates')
                    .update({ is_active: true })
                    .eq('id', scriptId)
                    .select()
                    .single();

                if (activateError) throw activateError;

                // Log script activation
                await db.createLog({
                    log_type: 'admin',
                    level: 'info',
                    message: 'Script version activated',
                    details: { 
                        script_id: scriptId,
                        version: activatedScript.version
                    },
                    ip_address: clientIP
                });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: `Script version ${activatedScript.version} activated successfully`
                    })
                };

            case 'deleteScript':
                const { scriptId: deleteScriptId } = actionData;
                
                if (!deleteScriptId) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Script ID is required' 
                        })
                    };
                }

                // Get script info before deletion
                const { data: scriptToDelete, error: getError } = await db.supabase
                    .from('script_updates')
                    .select('*')
                    .eq('id', deleteScriptId)
                    .single();

                if (getError) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Script not found' 
                        })
                    };
                }

                // Don't allow deletion of active script
                if (scriptToDelete.is_active) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Cannot delete active script. Activate another script first.' 
                        })
                    };
                }

                // Delete the script
                const { error: deleteError } = await db.supabase
                    .from('script_updates')
                    .delete()
                    .eq('id', deleteScriptId);

                if (deleteError) throw deleteError;

                // Delete the associated encryption key
                await db.setSetting(`script_key_${deleteScriptId}`, null, 'string');

                // Log script deletion
                await db.createLog({
                    log_type: 'admin',
                    level: 'warn',
                    message: 'Script version deleted',
                    details: { 
                        script_id: deleteScriptId,
                        version: scriptToDelete.version
                    },
                    ip_address: clientIP
                });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        message: 'Script deleted successfully'
                    })
                };

            case 'getActiveScript':
                const activeScript = await db.getActiveScript();
                
                if (!activeScript) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'No active script found' 
                        })
                    };
                }

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        script: {
                            id: activeScript.id,
                            version: activeScript.version,
                            update_notes: activeScript.update_notes,
                            created_at: activeScript.created_at,
                            file_size: activeScript.file_size,
                            checksum: activeScript.checksum
                        }
                    })
                };

            case 'decryptScript':
                const { scriptId: decryptScriptId } = actionData;
                
                if (!decryptScriptId) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Script ID is required' 
                        })
                    };
                }

                // Get script from database
                const { data: scriptToDecrypt, error: scriptError } = await db.supabase
                    .from('script_updates')
                    .select('*')
                    .eq('id', decryptScriptId)
                    .single();

                if (scriptError) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Script not found' 
                        })
                    };
                }

                // Get encryption key
                const scriptEncryptionKey = await db.getSetting(`script_key_${decryptScriptId}`);
                
                if (!scriptEncryptionKey) {
                    return {
                        statusCode: 404,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Encryption key not found' 
                        })
                    };
                }

                // Decrypt script
                const decryptedScript = EncryptionUtils.decrypt(scriptToDecrypt.encrypted_script, scriptEncryptionKey);
                
                // Verify checksum
                const isValidChecksum = EncryptionUtils.verifyChecksum(decryptedScript, scriptToDecrypt.checksum);
                
                if (!isValidChecksum) {
                    await db.createLog({
                        log_type: 'security',
                        level: 'error',
                        message: 'Script checksum verification failed',
                        details: { 
                            script_id: decryptScriptId,
                            version: scriptToDecrypt.version
                        },
                        ip_address: clientIP
                    });

                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({ 
                            success: false, 
                            message: 'Script integrity check failed' 
                        })
                    };
                }

                // Log script decryption (for admin viewing)
                await db.createLog({
                    log_type: 'admin',
                    level: 'info',
                    message: 'Script decrypted for admin viewing',
                    details: { 
                        script_id: decryptScriptId,
                        version: scriptToDecrypt.version
                    },
                    ip_address: clientIP
                });

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        success: true,
                        script: {
                            id: scriptToDecrypt.id,
                            version: scriptToDecrypt.version,
                            content: decryptedScript,
                            update_notes: scriptToDecrypt.update_notes,
                            created_at: scriptToDecrypt.created_at,
                            file_size: scriptToDecrypt.file_size,
                            checksum: scriptToDecrypt.checksum
                        }
                    })
                };

            default:
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ 
                        success: false, 
                        message: 'Invalid action' 
                    })
                };
        }

    } catch (error) {
        console.error('Script management error:', error);

        await db.createLog({
            log_type: 'error',
            level: 'error',
            message: 'Script management function error',
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

// netlify/functions/releaseNotesManagement.js - Release notes management with Supabase integration

const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const CONFIG = {
    JWT_SECRET: process.env.JWT_SECRET || 'V+3stApVGE9zLpJFf79RA4SAc/w2vqJygx5wQ2hW/OlGLN/rhEPFHV1tRR+zcO2APsrvMwy+IO6IgN7+jSghTw==',
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
};

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
        const { action, token, ...params } = JSON.parse(event.body);

        // Verify admin token
        const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
        if (!decoded || decoded.role !== 'admin') {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, message: 'Unauthorized' })
            };
        }

        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        switch (action) {
            case 'getReleaseNotes':
                return await getReleaseNotes(supabase, params);
            
            case 'createReleaseNote':
                return await createReleaseNote(supabase, params);
            
            case 'updateReleaseNote':
                return await updateReleaseNote(supabase, params);
            
            case 'deleteReleaseNote':
                return await deleteReleaseNote(supabase, params);
            
            case 'publishReleaseNote':
                return await publishReleaseNote(supabase, params);
            
            default:
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ success: false, message: 'Invalid action' })
                };
        }

    } catch (error) {
        console.error('Release notes management error:', error);
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

// Get release notes with pagination and filtering
async function getReleaseNotes(supabase, params) {
    try {
        const { 
            limit = 20, 
            offset = 0,
            published = null,
            version = null
        } = params;

        let query = supabase
            .from('script_updates')
            .select('*')
            .order('created_at', { ascending: false });

        // Apply filters
        if (published !== null) {
            query = query.eq('is_published', published);
        }

        if (version) {
            query = query.ilike('version', `%${version}%`);
        }

        // Apply pagination
        query = query.range(offset, offset + limit - 1);

        const { data: releaseNotes, error } = await query;

        if (error) {
            console.error('Error fetching release notes:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Failed to fetch release notes' 
                })
            };
        }

        // Get total count
        const { count: totalCount } = await supabase
            .from('script_updates')
            .select('*', { count: 'exact', head: true });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                releaseNotes: releaseNotes || [],
                pagination: {
                    total: totalCount || 0,
                    limit,
                    offset,
                    hasMore: (offset + limit) < (totalCount || 0)
                }
            })
        };

    } catch (error) {
        console.error('Error getting release notes:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Failed to get release notes' 
            })
        };
    }
}

// Create new release note
async function createReleaseNote(supabase, params) {
    try {
        const { 
            version, 
            title, 
            description, 
            changes = [], 
            bugFixes = [], 
            newFeatures = [],
            scriptContent = '',
            isPublished = false
        } = params;

        if (!version || !title || !description) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Version, title, and description are required' 
                })
            };
        }

        // Check if version already exists
        const { data: existingVersion } = await supabase
            .from('script_updates')
            .select('id')
            .eq('version', version)
            .single();

        if (existingVersion) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Version already exists' 
                })
            };
        }

        // Create release note
        const { data: releaseNote, error } = await supabase
            .from('script_updates')
            .insert({
                version,
                title,
                description,
                changes,
                bug_fixes: bugFixes,
                new_features: newFeatures,
                script_content: scriptContent,
                is_published: isPublished,
                is_active: false, // New releases are not active by default
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating release note:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Failed to create release note' 
                })
            };
        }

        // Log the creation
        await supabase.from('logs').insert({
            log_type: 'admin',
            level: 'info',
            message: `Release note created for version ${version}`,
            details: { 
                action: 'release_note_created',
                version,
                title,
                isPublished
            }
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                message: 'Release note created successfully',
                releaseNote
            })
        };

    } catch (error) {
        console.error('Error creating release note:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Failed to create release note' 
            })
        };
    }
}

// Update existing release note
async function updateReleaseNote(supabase, params) {
    try {
        const { 
            id,
            version, 
            title, 
            description, 
            changes = [], 
            bugFixes = [], 
            newFeatures = [],
            scriptContent = '',
            isPublished = false
        } = params;

        if (!id) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Release note ID is required' 
                })
            };
        }

        // Check if release note exists
        const { data: existingNote } = await supabase
            .from('script_updates')
            .select('*')
            .eq('id', id)
            .single();

        if (!existingNote) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Release note not found' 
                })
            };
        }

        // Update release note
        const { data: updatedNote, error } = await supabase
            .from('script_updates')
            .update({
                version: version || existingNote.version,
                title: title || existingNote.title,
                description: description || existingNote.description,
                changes: changes.length > 0 ? changes : existingNote.changes,
                bug_fixes: bugFixes.length > 0 ? bugFixes : existingNote.bug_fixes,
                new_features: newFeatures.length > 0 ? newFeatures : existingNote.new_features,
                script_content: scriptContent || existingNote.script_content,
                is_published: isPublished,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating release note:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Failed to update release note' 
                })
            };
        }

        // Log the update
        await supabase.from('logs').insert({
            log_type: 'admin',
            level: 'info',
            message: `Release note updated for version ${updatedNote.version}`,
            details: { 
                action: 'release_note_updated',
                id,
                version: updatedNote.version,
                title: updatedNote.title
            }
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                message: 'Release note updated successfully',
                releaseNote: updatedNote
            })
        };

    } catch (error) {
        console.error('Error updating release note:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Failed to update release note' 
            })
        };
    }
}

// Delete release note
async function deleteReleaseNote(supabase, params) {
    try {
        const { id } = params;

        if (!id) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Release note ID is required' 
                })
            };
        }

        // Check if release note exists and is not active
        const { data: existingNote } = await supabase
            .from('script_updates')
            .select('*')
            .eq('id', id)
            .single();

        if (!existingNote) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Release note not found' 
                })
            };
        }

        if (existingNote.is_active) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Cannot delete active release. Deactivate it first.' 
                })
            };
        }

        // Delete release note
        const { error } = await supabase
            .from('script_updates')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting release note:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Failed to delete release note' 
                })
            };
        }

        // Log the deletion
        await supabase.from('logs').insert({
            log_type: 'admin',
            level: 'info',
            message: `Release note deleted for version ${existingNote.version}`,
            details: { 
                action: 'release_note_deleted',
                id,
                version: existingNote.version,
                title: existingNote.title
            }
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                message: 'Release note deleted successfully'
            })
        };

    } catch (error) {
        console.error('Error deleting release note:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Failed to delete release note' 
            })
        };
    }
}

// Publish/unpublish release note
async function publishReleaseNote(supabase, params) {
    try {
        const { id, isPublished } = params;

        if (!id || typeof isPublished !== 'boolean') {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Release note ID and publish status are required' 
                })
            };
        }

        // Check if release note exists
        const { data: existingNote } = await supabase
            .from('script_updates')
            .select('*')
            .eq('id', id)
            .single();

        if (!existingNote) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Release note not found' 
                })
            };
        }

        // Update publish status
        const { data: updatedNote, error } = await supabase
            .from('script_updates')
            .update({
                is_published: isPublished,
                published_at: isPublished ? new Date().toISOString() : null,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error publishing release note:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Failed to update publish status' 
                })
            };
        }

        // Log the publish action
        await supabase.from('logs').insert({
            log_type: 'admin',
            level: 'info',
            message: `Release note ${isPublished ? 'published' : 'unpublished'} for version ${updatedNote.version}`,
            details: { 
                action: isPublished ? 'release_note_published' : 'release_note_unpublished',
                id,
                version: updatedNote.version,
                title: updatedNote.title
            }
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                success: true, 
                message: `Release note ${isPublished ? 'published' : 'unpublished'} successfully`,
                releaseNote: updatedNote
            })
        };

    } catch (error) {
        console.error('Error publishing release note:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false, 
                message: 'Failed to update publish status' 
            })
        };
    }
}

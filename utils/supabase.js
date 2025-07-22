// utils/supabase.js - Supabase client configuration
const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

// Create Supabase client with service role key (for backend operations)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// Database helper functions
const db = {
    // User operations
    async createUser(username) {
        const { data, error } = await supabase
            .from('users')
            .insert({ username })
            .select()
            .single();
        
        if (error && error.code !== '23505') { // Ignore unique constraint violations
            throw error;
        }
        
        return data;
    },

    async getUser(username) {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();
        
        if (error && error.code !== 'PGRST116') { // Ignore not found errors
            throw error;
        }
        
        return data;
    },

    async updateUserActivity(username) {
        const { error } = await supabase
            .from('users')
            .update({ last_active: new Date().toISOString() })
            .eq('username', username);
        
        if (error) throw error;
    },

    // Device operations
    async createDevice(deviceData) {
        const { data, error } = await supabase
            .from('devices')
            .insert(deviceData)
            .select()
            .single();
        
        if (error) throw error;
        return data;
    },

    async getDevice(hwid, fingerprint) {
        const { data, error } = await supabase
            .from('devices')
            .select('*')
            .eq('hwid', hwid)
            .eq('fingerprint', fingerprint)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        
        return data;
    },

    async getDevicesByUsername(username) {
        const { data, error } = await supabase
            .from('devices')
            .select('*')
            .eq('username', username)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data || [];
    },

    async updateDeviceStatus(deviceId, status, approvedBy = null) {
        const updateData = { 
            status, 
            updated_at: new Date().toISOString() 
        };
        
        if (approvedBy) {
            updateData.approved_by = approvedBy;
            updateData.approved_at = new Date().toISOString();
        }

        const { data, error } = await supabase
            .from('devices')
            .update(updateData)
            .eq('id', deviceId)
            .select()
            .single();
        
        if (error) throw error;
        return data;
    },

    async updateDeviceUsage(deviceId) {
        const { error } = await supabase
            .from('devices')
            .update({ 
                last_used: new Date().toISOString(),
                usage_count: supabase.rpc('increment_usage_count', { device_id: deviceId })
            })
            .eq('id', deviceId);
        
        if (error) throw error;
    },

    async deleteDevice(deviceId) {
        const { error } = await supabase
            .from('devices')
            .delete()
            .eq('id', deviceId);
        
        if (error) throw error;
    },

    // Admin settings operations
    async getSetting(key) {
        const { data, error } = await supabase
            .from('admin_settings')
            .select('setting_value, setting_type')
            .eq('setting_key', key)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        
        if (!data) return null;
        
        // Parse value based on type
        switch (data.setting_type) {
            case 'boolean':
                return data.setting_value === 'true';
            case 'number':
                return parseFloat(data.setting_value);
            case 'json':
                return JSON.parse(data.setting_value);
            default:
                return data.setting_value;
        }
    },

    async setSetting(key, value, type = 'string') {
        let stringValue = value;
        if (type === 'json') {
            stringValue = JSON.stringify(value);
        } else if (type === 'boolean') {
            stringValue = value.toString();
        } else if (type === 'number') {
            stringValue = value.toString();
        }

        const { error } = await supabase
            .from('admin_settings')
            .upsert({
                setting_key: key,
                setting_value: stringValue,
                setting_type: type,
                updated_at: new Date().toISOString()
            });
        
        if (error) throw error;
    },

    async getAllSettings() {
        const { data, error } = await supabase
            .from('admin_settings')
            .select('*')
            .order('setting_key');
        
        if (error) throw error;
        
        // Parse values based on type
        const settings = {};
        data.forEach(setting => {
            let value = setting.setting_value;
            switch (setting.setting_type) {
                case 'boolean':
                    value = value === 'true';
                    break;
                case 'number':
                    value = parseFloat(value);
                    break;
                case 'json':
                    value = JSON.parse(value);
                    break;
            }
            settings[setting.setting_key] = value;
        });
        
        return settings;
    },

    // Script operations
    async getActiveScript() {
        const { data, error } = await supabase
            .from('script_updates')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        
        return data;
    },

    async createScriptUpdate(scriptData) {
        // First, deactivate all existing scripts
        await supabase
            .from('script_updates')
            .update({ is_active: false })
            .eq('is_active', true);

        // Then create the new active script
        const { data, error } = await supabase
            .from('script_updates')
            .insert({
                ...scriptData,
                is_active: true,
                created_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (error) throw error;
        return data;
    },

    async getScriptHistory() {
        const { data, error } = await supabase
            .from('script_updates')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data || [];
    },

    // Logging operations
    async createLog(logData) {
        const { error } = await supabase
            .from('logs')
            .insert({
                ...logData,
                created_at: new Date().toISOString()
            });
        
        if (error) throw error;
    },

    async getLogs(filters = {}) {
        let query = supabase
            .from('logs')
            .select('*');
        
        if (filters.log_type) {
            query = query.eq('log_type', filters.log_type);
        }
        
        if (filters.level) {
            query = query.eq('level', filters.level);
        }
        
        if (filters.user_id) {
            query = query.eq('user_id', filters.user_id);
        }
        
        if (filters.limit) {
            query = query.limit(filters.limit);
        }
        
        query = query.order('created_at', { ascending: false });
        
        const { data, error } = await query;
        
        if (error) throw error;
        return data || [];
    },

    // Device request operations
    async createDeviceRequest(requestData) {
        const { data, error } = await supabase
            .from('device_requests')
            .insert(requestData)
            .select()
            .single();
        
        if (error) throw error;
        return data;
    },

    async getPendingRequests() {
        const { data, error } = await supabase
            .from('device_requests')
            .select(`
                *,
                devices (
                    id,
                    username,
                    hwid,
                    fingerprint,
                    device_name,
                    browser_info,
                    os_info,
                    created_at
                )
            `)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data || [];
    },

    async updateRequestStatus(requestId, status, processedBy, adminNotes = null) {
        const { data, error } = await supabase
            .from('device_requests')
            .update({
                status,
                processed_by: processedBy,
                processed_at: new Date().toISOString(),
                admin_notes: adminNotes
            })
            .eq('id', requestId)
            .select()
            .single();
        
        if (error) throw error;
        return data;
    },

    // Dashboard data
    async getDashboardStats() {
        const [
            { count: totalDevices },
            { count: activeDevices },
            { count: pendingRequests },
            { count: blockedDevices },
            { count: totalUsers }
        ] = await Promise.all([
            supabase.from('devices').select('*', { count: 'exact', head: true }),
            supabase.from('devices').select('*', { count: 'exact', head: true }).eq('status', 'active'),
            supabase.from('device_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
            supabase.from('devices').select('*', { count: 'exact', head: true }).eq('status', 'blocked'),
            supabase.from('users').select('*', { count: 'exact', head: true })
        ]);

        return {
            totalDevices,
            activeDevices,
            pendingRequests,
            blockedDevices,
            totalUsers
        };
    },

    // Cleanup operations
    async cleanupExpiredDevices() {
        const { data, error } = await supabase.rpc('cleanup_expired_devices');
        
        if (error) throw error;
        return data;
    }
};

module.exports = { supabase, db };

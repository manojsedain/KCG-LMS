// Environment configuration for LMS AI Assistant
const config = {
    // Supabase configuration
    supabase: {
        url: process.env.SUPABASE_URL || 'https://yxkrqklbnhaoydpisikk.supabase.co',
        anonKey: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4a3Jxa2xibmhhb3lkcGlzaWtrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxNzk2MTMsImV4cCI6MjA2ODc1NTYxM30.El5vxZMw3iiwG50i8l_08-MlDBl93hdktOzXvS6BhiU',
    },
    
    // App configuration
    app: {
        name: 'LMS AI Assistant',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'production'
    },
    
    // API endpoints
    api: {
        baseUrl: process.env.API_BASE_URL || window.location.origin
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = config;
} else {
    window.AppConfig = config;
}

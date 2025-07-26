// netlify/functions/getTokenUsage.js - Get token usage statistics for admin dashboard

const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Only allow GET and POST requests
    if (!['GET', 'POST'].includes(event.httpMethod)) {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ success: false, message: 'Method not allowed' })
        };
    }

    try {
        // Verify admin authentication
        const authHeader = event.headers.authorization;
        console.log('Auth header received:', authHeader ? 'Bearer token present' : 'No auth header');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('Missing or invalid authorization header');
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, message: 'Unauthorized - Missing Bearer token' })
            };
        }

        const token = authHeader.split(' ')[1];
        console.log('Token received, length:', token ? token.length : 0);
        
        let decoded;
        try {
            decoded = jwt.verify(token, CONFIG.JWT_SECRET);
            console.log('Token verified successfully, payload:', { role: decoded.role, type: decoded.type });
        } catch (jwtError) {
            console.log('JWT verification failed:', jwtError.message);
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, message: 'Invalid token: ' + jwtError.message })
            };
        }

        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        const { period = '7d' } = event.queryStringParameters || {};

        // Calculate date range based on period
        const now = new Date();
        let startDate;
        
        switch (period) {
            case '24h':
                startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90d':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        }

        // Get token usage statistics from token_usage table
        const { data: tokenLogs, error: tokenError } = await supabase
            .from('token_usage')
            .select('*')
            .gte('timestamp', startDate.toISOString())
            .order('timestamp', { ascending: false });

        if (tokenError) {
            console.error('Error fetching token usage:', tokenError);
            // Provide fallback data if token usage table doesn't exist yet
            const fallbackData = {
                totalTokens: 0,
                dailyUsage: [],
                featureUsage: {
                    'AI Chat': 0,
                    'Auto Answer': 0,
                    'Content Analysis': 0,
                    'Quiz Helper': 0
                },
                topUsers: [],
                recentActivity: []
            };
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    data: fallbackData,
                    message: 'Token usage tracking will be available once data is collected'
                })
            };
        }

        // Process token usage data for charts
        const usageByUser = {};
        const usageByDate = {};
        const usageByFeature = {};
        let totalTokens = 0;

        tokenLogs.forEach(record => {
            const date = record.timestamp.split('T')[0]; // Get date part only
            const email = record.email;
            const feature = record.feature_type || 'general';
            const tokens = record.tokens_used || 0;

            totalTokens += tokens;

            // Group by user
            if (!usageByUser[email]) {
                usageByUser[email] = 0;
            }
            usageByUser[email] += tokens;

            // Group by date
            if (!usageByDate[date]) {
                usageByDate[date] = 0;
            }
            usageByDate[date] += tokens;

            // Group by feature
            if (!usageByFeature[feature]) {
                usageByFeature[feature] = 0;
            }
            usageByFeature[feature] += tokens;
        });

        // Get top users
        const topUsers = Object.entries(usageByUser)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([email, tokens]) => ({ email, tokens }));

        // Prepare chart data for daily usage
        const dailyUsageChart = Object.entries(usageByDate)
            .sort(([a], [b]) => new Date(a) - new Date(b))
            .map(([date, tokens]) => ({ date, tokens }));

        // Prepare chart data for feature usage
        const featureUsageChart = Object.entries(usageByFeature)
            .sort(([,a], [,b]) => b - a)
            .map(([feature, tokens]) => ({ feature, tokens }));

        // Get user count for additional stats
        const { data: activeUsers, error: usersError } = await supabase
            .from('token_usage')
            .select('email')
            .gte('timestamp', startDate.toISOString());
            
        const uniqueUsers = activeUsers ? [...new Set(activeUsers.map(r => r.email))] : [];

        const activeUserCount = uniqueUsers.length || 0;

        // Calculate average tokens per user
        const avgTokensPerUser = activeUserCount > 0 ? Math.round(totalTokens / activeUserCount) : 0;

        // Get most active feature
        const mostActiveFeature = featureUsageChart.length > 0 ? featureUsageChart[0].feature : 'N/A';

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                data: {
                    period,
                    summary: {
                        totalTokens,
                        activeUsers: activeUserCount,
                        avgTokensPerUser,
                        mostActiveFeature
                    },
                    charts: {
                        dailyUsage: dailyUsageChart,
                        featureUsage: featureUsageChart,
                        topUsers
                    },
                    raw: tokenLogs
                }
            })
        };

    } catch (error) {
        console.error('Token usage API error:', error);
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

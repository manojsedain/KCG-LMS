-- Token Usage Tracking Database Schema
-- Run this in your Supabase SQL Editor to create token usage tracking tables

-- Token usage detailed records table
CREATE TABLE IF NOT EXISTS token_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    device_hwid VARCHAR(255),
    device_fingerprint VARCHAR(255),
    tokens_used INTEGER NOT NULL DEFAULT 0,
    provider VARCHAR(50) NOT NULL, -- deepseek, openai, etc.
    feature_type VARCHAR(50) NOT NULL, -- ai_chat, auto_answer, content_analysis, quiz_helper
    prompt_text TEXT,
    response_text TEXT,
    session_id VARCHAR(255),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Token usage summary table for quick stats and rankings
CREATE TABLE IF NOT EXISTS token_usage_summary (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    total_tokens INTEGER DEFAULT 0,
    total_requests INTEGER DEFAULT 0,
    first_used TIMESTAMP WITH TIME ZONE,
    last_used TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_token_usage_email ON token_usage(email);
CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_token_usage_provider ON token_usage(provider);
CREATE INDEX IF NOT EXISTS idx_token_usage_feature ON token_usage(feature_type);
CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage(session_id);

CREATE INDEX IF NOT EXISTS idx_token_summary_email ON token_usage_summary(email);
CREATE INDEX IF NOT EXISTS idx_token_summary_total_tokens ON token_usage_summary(total_tokens);
CREATE INDEX IF NOT EXISTS idx_token_summary_last_used ON token_usage_summary(last_used);

-- Create function to get token usage rankings
CREATE OR REPLACE FUNCTION get_token_usage_rankings(
    limit_count INTEGER DEFAULT 10,
    time_period VARCHAR DEFAULT 'all' -- 'all', '24h', '7d', '30d'
)
RETURNS TABLE (
    rank INTEGER,
    email VARCHAR,
    total_tokens BIGINT,
    total_requests BIGINT,
    avg_tokens_per_request NUMERIC,
    last_used TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    time_filter TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Set time filter based on period
    CASE time_period
        WHEN '24h' THEN time_filter := NOW() - INTERVAL '24 hours';
        WHEN '7d' THEN time_filter := NOW() - INTERVAL '7 days';
        WHEN '30d' THEN time_filter := NOW() - INTERVAL '30 days';
        ELSE time_filter := '1900-01-01'::TIMESTAMP WITH TIME ZONE;
    END CASE;
    
    RETURN QUERY
    SELECT 
        ROW_NUMBER() OVER (ORDER BY SUM(tu.tokens_used) DESC)::INTEGER as rank,
        tu.email,
        SUM(tu.tokens_used) as total_tokens,
        COUNT(tu.id) as total_requests,
        ROUND(AVG(tu.tokens_used), 2) as avg_tokens_per_request,
        MAX(tu.timestamp) as last_used
    FROM token_usage tu
    WHERE tu.timestamp >= time_filter
    GROUP BY tu.email
    ORDER BY total_tokens DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to get user token usage details
CREATE OR REPLACE FUNCTION get_user_token_details(
    user_email VARCHAR,
    limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    tokens_used INTEGER,
    provider VARCHAR,
    feature_type VARCHAR,
    timestamp TIMESTAMP WITH TIME ZONE,
    session_id VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tu.id,
        tu.tokens_used,
        tu.provider,
        tu.feature_type,
        tu.timestamp,
        tu.session_id
    FROM token_usage tu
    WHERE tu.email = user_email
    ORDER BY tu.timestamp DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to get token usage statistics by time period
CREATE OR REPLACE FUNCTION get_token_usage_stats(
    time_period VARCHAR DEFAULT '7d'
)
RETURNS TABLE (
    period_start TIMESTAMP WITH TIME ZONE,
    period_end TIMESTAMP WITH TIME ZONE,
    total_tokens BIGINT,
    total_requests BIGINT,
    unique_users BIGINT,
    avg_tokens_per_user NUMERIC,
    top_provider VARCHAR,
    top_feature VARCHAR
) AS $$
DECLARE
    time_filter TIMESTAMP WITH TIME ZONE;
    period_start_val TIMESTAMP WITH TIME ZONE;
    period_end_val TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Set time filter and period bounds
    period_end_val := NOW();
    CASE time_period
        WHEN '24h' THEN 
            time_filter := NOW() - INTERVAL '24 hours';
            period_start_val := time_filter;
        WHEN '7d' THEN 
            time_filter := NOW() - INTERVAL '7 days';
            period_start_val := time_filter;
        WHEN '30d' THEN 
            time_filter := NOW() - INTERVAL '30 days';
            period_start_val := time_filter;
        ELSE 
            time_filter := '1900-01-01'::TIMESTAMP WITH TIME ZONE;
            period_start_val := (SELECT MIN(timestamp) FROM token_usage);
    END CASE;
    
    RETURN QUERY
    SELECT 
        period_start_val as period_start,
        period_end_val as period_end,
        SUM(tu.tokens_used) as total_tokens,
        COUNT(tu.id) as total_requests,
        COUNT(DISTINCT tu.email) as unique_users,
        ROUND(AVG(tu.tokens_used), 2) as avg_tokens_per_user,
        (SELECT tu2.provider FROM token_usage tu2 WHERE tu2.timestamp >= time_filter 
         GROUP BY tu2.provider ORDER BY SUM(tu2.tokens_used) DESC LIMIT 1) as top_provider,
        (SELECT tu3.feature_type FROM token_usage tu3 WHERE tu3.timestamp >= time_filter 
         GROUP BY tu3.feature_type ORDER BY SUM(tu3.tokens_used) DESC LIMIT 1) as top_feature
    FROM token_usage tu
    WHERE tu.timestamp >= time_filter;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update summary table
CREATE OR REPLACE FUNCTION update_token_summary()
RETURNS TRIGGER AS $$
BEGIN
    -- Update or insert summary record
    INSERT INTO token_usage_summary (email, total_tokens, total_requests, first_used, last_used, updated_at)
    VALUES (NEW.email, NEW.tokens_used, 1, NEW.timestamp, NEW.timestamp, NOW())
    ON CONFLICT (email) 
    DO UPDATE SET
        total_tokens = token_usage_summary.total_tokens + NEW.tokens_used,
        total_requests = token_usage_summary.total_requests + 1,
        last_used = NEW.timestamp,
        updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_token_summary ON token_usage;
CREATE TRIGGER trigger_update_token_summary
    AFTER INSERT ON token_usage
    FOR EACH ROW
    EXECUTE FUNCTION update_token_summary();

-- Enable Row Level Security
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_usage_summary ENABLE ROW LEVEL SECURITY;

-- Create policies for service role access
CREATE POLICY "Service role can access token_usage" ON token_usage 
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can access token_usage_summary" ON token_usage_summary 
    FOR ALL USING (auth.role() = 'service_role');

-- Grant permissions
GRANT ALL ON token_usage TO service_role;
GRANT ALL ON token_usage_summary TO service_role;
GRANT EXECUTE ON FUNCTION get_token_usage_rankings TO service_role;
GRANT EXECUTE ON FUNCTION get_user_token_details TO service_role;
GRANT EXECUTE ON FUNCTION get_token_usage_stats TO service_role;

-- Insert some sample data for testing (optional)
/*
INSERT INTO token_usage (email, tokens_used, provider, feature_type, prompt_text, response_text) VALUES
('user1@example.com', 150, 'deepseek', 'ai_chat', 'What is machine learning?', 'Machine learning is a subset of AI...'),
('user2@example.com', 200, 'openai', 'auto_answer', 'Solve this math problem', '42'),
('user1@example.com', 100, 'deepseek', 'quiz_helper', 'Help with quiz question', 'The answer is C'),
('user3@example.com', 300, 'deepseek', 'content_analysis', 'Analyze this text', 'This text discusses...');
*/

COMMIT;

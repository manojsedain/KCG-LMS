// netlify/functions/handleContactForm.js - Handle contact form submissions

const { createClient } = require('@supabase/supabase-js');

// Configuration
const CONFIG = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
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
        const { name, email, subject, message, newsletter } = JSON.parse(event.body);
        
        // Validate required fields
        if (!name || !email || !subject || !message) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'All fields are required' 
                })
            };
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Please enter a valid email address' 
                })
            };
        }

        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        // Get admin contact email from settings
        const { data: adminEmailData } = await supabase
            .from('payment_settings')
            .select('setting_value')
            .eq('setting_key', 'admin_contact_email')
            .single();

        const adminEmail = adminEmailData?.setting_value || 'manojsedain40@gmail.com';

        // Create contact record
        const { data: contact, error: contactError } = await supabase
            .from('contact_messages_new')
            .insert({
                name,
                email,
                subject,
                message,
                newsletter_subscribe: newsletter === 'yes',
                status: 'new',
                admin_email: adminEmail
            })
            .select()
            .single();

        if (contactError) {
            console.error('Error creating contact record:', contactError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Failed to save contact message: ' + contactError.message 
                })
            };
        }

        // Send notification to admin
        await supabase.from('notification_logs_new').insert({
            notification_type: 'contact_form',
            recipient_email: adminEmail,
            subject: `Contact Form: ${subject}`,
            message: `New contact form submission from ${name} (${email}):\n\nSubject: ${subject}\n\nMessage:\n${message}\n\nNewsletter: ${newsletter === 'yes' ? 'Yes' : 'No'}`,
            contact_id: contact.id,
            status: 'pending'
        });

        // Log the contact submission
        await supabase.from('logs_new').insert({
            log_type: 'contact',
            level: 'info',
            message: 'Contact form submitted',
            details: { 
                name,
                email,
                subject,
                newsletter_subscribe: newsletter === 'yes'
            },
            user_email: email,
            ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
            user_agent: event.headers['user-agent']
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Thank you for your message! We will get back to you soon.',
                contactId: contact.id
            })
        };

    } catch (error) {
        console.error('Contact form error:', error);
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

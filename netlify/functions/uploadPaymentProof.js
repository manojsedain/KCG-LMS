// netlify/functions/uploadPaymentProof.js - Handle payment proof photo uploads

const { createClient } = require('@supabase/supabase-js');
const multipart = require('lambda-multipart-parser');

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

// Convert file to base64 data URL
function fileToDataURL(buffer, mimeType) {
    const base64 = buffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
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
        // Parse multipart form data
        const result = await multipart.parse(event);
        
        const { email, amount } = result;
        
        // Validate required fields
        if (!email || !amount) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Email and amount are required' 
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
        
        // Validate amount
        const paymentAmount = parseFloat(amount);
        if (isNaN(paymentAmount) || paymentAmount <= 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Please enter a valid payment amount' 
                })
            };
        }

        // Check if file was uploaded
        if (!result.files || result.files.length === 0) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Payment proof image is required' 
                })
            };
        }

        const file = result.files[0];
        
        // Validate file type (images only)
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        const fileType = file.contentType || 'application/octet-stream';
        
        if (!allowedTypes.includes(fileType.toLowerCase())) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Invalid file type. Only images (JPEG, PNG, GIF, WebP) are allowed.' 
                })
            };
        }

        // Validate file size (max 5MB)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.content.length > maxSize) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'File too large. Maximum size is 5MB.' 
                })
            };
        }

        // Initialize Supabase client
        const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_ROLE_KEY);

        // Convert image to data URL for storage
        const paymentProofUrl = fileToDataURL(file.content, fileType);

        // Create payment record with proof
        const { data: payment, error: paymentError } = await supabase
            .from('payments_new')
            .insert({
                email,
                amount: paymentAmount,
                currency: 'USD',
                payment_method: 'manual_upload',
                payment_status: 'pending_verification',
                subscription_type: 'manual',
                payment_proof_url: paymentProofUrl,
                notes: 'Manual payment with proof uploaded'
            })
            .select()
            .single();

        if (paymentError) {
            console.error('Error creating payment record:', paymentError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Failed to save payment record: ' + paymentError.message 
                })
            };
        }

        // Send notification to developer/admin
        const { data: devEmail } = await supabase
            .from('payment_settings')
            .select('setting_value')
            .eq('setting_key', 'developer_email')
            .single();

        if (devEmail?.setting_value) {
            await supabase.from('notification_logs_new').insert({
                notification_type: 'payment_proof_uploaded',
                recipient_email: devEmail.setting_value,
                subject: 'Payment Proof Uploaded - Verification Required',
                message: `Payment proof uploaded by ${email} for $${paymentAmount}. Please verify the payment and approve access.`,
                payment_id: payment.id,
                status: 'pending'
            });
        }

        // Log the upload
        await supabase.from('logs_new').insert({
            log_type: 'payment',
            level: 'info',
            message: 'Payment proof uploaded',
            details: { 
                email,
                amount: paymentAmount,
                payment_method: 'manual_upload',
                file_size: file.content.length,
                file_type: fileType
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
                message: 'Payment proof uploaded successfully. Your payment will be verified within 24 hours.',
                paymentId: payment.id,
                amount: paymentAmount,
                status: 'pending_verification'
            })
        };

    } catch (error) {
        console.error('Payment proof upload error:', error);
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

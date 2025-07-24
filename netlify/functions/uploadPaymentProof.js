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
        
        const { username, email, deviceHwid, paymentMethod, transactionId, notes } = result;
        
        // Validate required fields
        if (!username || !email || !deviceHwid) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    success: false, 
                    message: 'Username, email, and device HWID are required' 
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

        // Get current pricing
        const { data: settings } = await supabase
            .from('payment_settings')
            .select('setting_key, setting_value')
            .in('setting_key', ['discount_price', 'lifetime_price', 'discount_end_date']);
        
        const settingsMap = {};
        settings?.forEach(setting => {
            settingsMap[setting.setting_key] = setting.setting_value;
        });
        
        const discountEndDate = new Date(settingsMap.discount_end_date || '2025-08-31');
        const currentDate = new Date();
        const isDiscountPeriod = currentDate <= discountEndDate;
        const amount = isDiscountPeriod 
            ? parseFloat(settingsMap.discount_price || '36.00')
            : parseFloat(settingsMap.lifetime_price || '68.00');

        // Convert image to data URL for storage
        const paymentProofUrl = fileToDataURL(file.content, fileType);

        // Create payment record with proof
        const { data: payment, error: paymentError } = await supabase
            .from('payments')
            .insert({
                username,
                email,
                amount,
                currency: 'USD',
                payment_method: paymentMethod || 'manual',
                paypal_transaction_id: transactionId,
                payment_status: 'pending_verification',
                subscription_type: isDiscountPeriod ? 'discount' : 'lifetime',
                payment_proof_url: paymentProofUrl,
                device_hwid: deviceHwid,
                notes: notes || 'Manual payment with proof uploaded'
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

        // Update device with payment info (but keep as pending until admin approves)
        await supabase
            .from('devices')
            .update({
                payment_id: payment.id,
                payment_status: 'pending_verification'
            })
            .eq('hwid', deviceHwid);

        // Send notification to developer/admin
        const { data: devEmail } = await supabase
            .from('payment_settings')
            .select('setting_value')
            .eq('setting_key', 'developer_email')
            .single();

        if (devEmail?.setting_value) {
            await supabase.from('notification_logs').insert({
                notification_type: 'payment_proof_uploaded',
                recipient_email: devEmail.setting_value,
                subject: 'Payment Proof Uploaded - Verification Required',
                message: `Payment proof uploaded by ${username} (${email}) for $${amount}. Transaction ID: ${transactionId || 'N/A'}. Device HWID: ${deviceHwid}. Please verify the payment and approve device access.`,
                payment_id: payment.id,
                status: 'pending'
            });
        }

        // Log the upload
        await supabase.from('logs').insert({
            log_type: 'payment',
            level: 'info',
            message: 'Payment proof uploaded',
            details: { 
                username,
                email,
                amount,
                payment_method: paymentMethod || 'manual',
                transaction_id: transactionId,
                file_size: file.content.length,
                file_type: fileType
            },
            ip_address: event.headers['x-forwarded-for'] || event.headers['x-real-ip'],
            user_agent: event.headers['user-agent']
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Payment proof uploaded successfully. Your payment will be verified and device approved within 24 hours.',
                paymentId: payment.id,
                amount: amount,
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

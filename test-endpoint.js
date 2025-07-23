// Test script to check what getMainLoaderSimple actually returns
const fetch = require('node-fetch');

async function testEndpoint() {
    try {
        console.log('Testing getMainLoaderSimple endpoint...');
        
        const response = await fetch('https://wrongnumber.netlify.app/.netlify/functions/getMainLoaderSimple', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: 'testuser',
                hwid: 'test-hwid',
                fingerprint: 'test-fingerprint'
            })
        });
        
        console.log('Status:', response.status);
        console.log('Headers:', Object.fromEntries(response.headers.entries()));
        
        const responseText = await response.text();
        console.log('Response length:', responseText.length);
        console.log('First 200 chars:', responseText.substring(0, 200));
        console.log('Contains DOCTYPE?', responseText.includes('<!DOCTYPE'));
        console.log('Contains <html?', responseText.includes('<html'));
        
        if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
            console.log('❌ PROBLEM: Response contains HTML instead of JavaScript!');
        } else {
            console.log('✅ Response looks like JavaScript');
        }
        
    } catch (error) {
        console.error('Error testing endpoint:', error);
    }
}

testEndpoint();

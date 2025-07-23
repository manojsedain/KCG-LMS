// Fix for admin panel date display issues
// This provides a helper function to format dates properly

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Helper function to format dates properly
    const formatDate = (dateString) => {
        try {
            if (!dateString) return 'Unknown';
            
            const date = new Date(dateString);
            
            // Check if date is valid
            if (isNaN(date.getTime())) {
                return 'Invalid Date';
            }
            
            // Format as readable date
            return date.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short'
            });
        } catch (error) {
            console.error('Date formatting error:', error);
            return 'Date Error';
        }
    };

    // Test the date from your uploaded script
    const testDate = "2025-07-23T19:05:36.810983+00:00";
    const formattedDate = formatDate(testDate);

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            message: 'Date formatting test',
            originalDate: testDate,
            formattedDate: formattedDate,
            jsCode: `
// JavaScript code to fix date display in admin panel
function formatDate(dateString) {
    try {
        if (!dateString) return 'Unknown';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Invalid Date';
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });
    } catch (error) {
        return 'Date Error';
    }
}

// Use this function when displaying script dates:
// const displayDate = formatDate(script.created_at);
            `
        })
    };
};

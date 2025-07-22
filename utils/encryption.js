// utils/encryption.js - AES encryption with Japanese character support
const crypto = require('crypto');

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16; // 128 bits

class EncryptionUtils {
    /**
     * Generate a random AES key
     * @returns {string} Base64 encoded key
     */
    static generateKey() {
        return crypto.randomBytes(KEY_LENGTH).toString('base64');
    }

    /**
     * Generate a random initialization vector
     * @returns {Buffer} IV buffer
     */
    static generateIV() {
        return crypto.randomBytes(IV_LENGTH);
    }

    /**
     * Encrypt text with AES-256-GCM (supports Japanese characters)
     * @param {string} text - Text to encrypt (supports UTF-8/Japanese)
     * @param {string} key - Base64 encoded key
     * @returns {string} Base64 encoded encrypted data with IV and tag
     */
    static encrypt(text, key) {
        try {
            // Convert key from base64
            const keyBuffer = Buffer.from(key, 'base64');
            
            // Generate random IV
            const iv = this.generateIV();
            
            // Create cipher
            const cipher = crypto.createCipher(ALGORITHM, keyBuffer);
            cipher.setAutoPadding(true);
            
            // Convert text to UTF-8 buffer to properly handle Japanese characters
            const textBuffer = Buffer.from(text, 'utf8');
            
            // Encrypt
            let encrypted = cipher.update(textBuffer);
            const final = cipher.final();
            encrypted = Buffer.concat([encrypted, final]);
            
            // Get authentication tag
            const tag = cipher.getAuthTag();
            
            // Combine IV + tag + encrypted data
            const combined = Buffer.concat([iv, tag, encrypted]);
            
            // Return as base64
            return combined.toString('base64');
        } catch (error) {
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    /**
     * Decrypt text with AES-256-GCM (supports Japanese characters)
     * @param {string} encryptedData - Base64 encoded encrypted data
     * @param {string} key - Base64 encoded key
     * @returns {string} Decrypted text (UTF-8)
     */
    static decrypt(encryptedData, key) {
        try {
            // Convert key from base64
            const keyBuffer = Buffer.from(key, 'base64');
            
            // Convert encrypted data from base64
            const combined = Buffer.from(encryptedData, 'base64');
            
            // Extract IV, tag, and encrypted data
            const iv = combined.slice(0, IV_LENGTH);
            const tag = combined.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
            const encrypted = combined.slice(IV_LENGTH + TAG_LENGTH);
            
            // Create decipher
            const decipher = crypto.createDecipher(ALGORITHM, keyBuffer);
            decipher.setAuthTag(tag);
            
            // Decrypt
            let decrypted = decipher.update(encrypted);
            const final = decipher.final();
            decrypted = Buffer.concat([decrypted, final]);
            
            // Convert back to UTF-8 string
            return decrypted.toString('utf8');
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    /**
     * Hash password using SHA-256
     * @param {string} password - Password to hash
     * @param {string} salt - Optional salt (auto-generated if not provided)
     * @returns {object} {hash, salt}
     */
    static hashPassword(password, salt = null) {
        if (!salt) {
            salt = crypto.randomBytes(16).toString('hex');
        }
        
        const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
        
        return { hash, salt };
    }

    /**
     * Verify password against hash
     * @param {string} password - Password to verify
     * @param {string} hash - Stored hash
     * @param {string} salt - Stored salt
     * @returns {boolean} True if password matches
     */
    static verifyPassword(password, hash, salt) {
        const { hash: newHash } = this.hashPassword(password, salt);
        return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(newHash, 'hex'));
    }

    /**
     * Generate HWID from system information
     * @param {object} systemInfo - System information object
     * @returns {string} Hardware ID
     */
    static generateHWID(systemInfo) {
        const {
            userAgent,
            screen,
            timezone,
            language,
            platform,
            hardwareConcurrency,
            deviceMemory,
            colorDepth
        } = systemInfo;

        const hwString = [
            userAgent || '',
            screen ? `${screen.width}x${screen.height}x${screen.colorDepth}` : '',
            timezone || '',
            language || '',
            platform || '',
            hardwareConcurrency || '',
            deviceMemory || '',
            colorDepth || ''
        ].join('|');

        return crypto.createHash('sha256').update(hwString).digest('hex');
    }

    /**
     * Generate browser fingerprint
     * @param {object} browserInfo - Browser information object
     * @returns {string} Browser fingerprint
     */
    static generateFingerprint(browserInfo) {
        const {
            userAgent,
            language,
            languages,
            platform,
            cookieEnabled,
            doNotTrack,
            plugins,
            mimeTypes,
            screen,
            timezone,
            touchSupport,
            fonts,
            canvas,
            webgl
        } = browserInfo;

        const fingerprintString = [
            userAgent || '',
            language || '',
            (languages || []).join(','),
            platform || '',
            cookieEnabled ? '1' : '0',
            doNotTrack || '',
            (plugins || []).map(p => p.name).join(','),
            (mimeTypes || []).map(m => m.type).join(','),
            screen ? `${screen.width}x${screen.height}x${screen.colorDepth}` : '',
            timezone || '',
            touchSupport ? '1' : '0',
            (fonts || []).join(','),
            canvas || '',
            webgl || ''
        ].join('|');

        return crypto.createHash('sha256').update(fingerprintString).digest('hex');
    }

    /**
     * Create secure token with expiration
     * @param {object} payload - Token payload
     * @param {string} secret - Secret key
     * @param {number} expiresIn - Expiration time in seconds
     * @returns {string} JWT-like token
     */
    static createToken(payload, secret, expiresIn = 3600) {
        const header = {
            alg: 'HS256',
            typ: 'JWT'
        };

        const tokenPayload = {
            ...payload,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + expiresIn
        };

        const headerEncoded = Buffer.from(JSON.stringify(header)).toString('base64url');
        const payloadEncoded = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
        
        const signature = crypto
            .createHmac('sha256', secret)
            .update(`${headerEncoded}.${payloadEncoded}`)
            .digest('base64url');

        return `${headerEncoded}.${payloadEncoded}.${signature}`;
    }

    /**
     * Verify and decode token
     * @param {string} token - Token to verify
     * @param {string} secret - Secret key
     * @returns {object|null} Decoded payload or null if invalid
     */
    static verifyToken(token, secret) {
        try {
            const [headerEncoded, payloadEncoded, signature] = token.split('.');
            
            if (!headerEncoded || !payloadEncoded || !signature) {
                return null;
            }

            // Verify signature
            const expectedSignature = crypto
                .createHmac('sha256', secret)
                .update(`${headerEncoded}.${payloadEncoded}`)
                .digest('base64url');

            if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
                return null;
            }

            // Decode payload
            const payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString());

            // Check expiration
            if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
                return null;
            }

            return payload;
        } catch (error) {
            return null;
        }
    }

    /**
     * Generate random string for various purposes
     * @param {number} length - Length of random string
     * @param {string} charset - Character set to use
     * @returns {string} Random string
     */
    static generateRandomString(length = 32, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
        let result = '';
        const bytes = crypto.randomBytes(length);
        
        for (let i = 0; i < length; i++) {
            result += charset[bytes[i] % charset.length];
        }
        
        return result;
    }

    /**
     * Create checksum for file integrity
     * @param {string|Buffer} data - Data to checksum
     * @returns {string} SHA-256 checksum
     */
    static createChecksum(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Verify checksum
     * @param {string|Buffer} data - Data to verify
     * @param {string} expectedChecksum - Expected checksum
     * @returns {boolean} True if checksum matches
     */
    static verifyChecksum(data, expectedChecksum) {
        const actualChecksum = this.createChecksum(data);
        return crypto.timingSafeEqual(Buffer.from(actualChecksum), Buffer.from(expectedChecksum));
    }
}

module.exports = EncryptionUtils;

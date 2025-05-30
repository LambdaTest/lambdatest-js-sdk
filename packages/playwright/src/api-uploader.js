const https = require('https');
const http = require('http');
const { URL } = require('url');
const { logger } = require('./logger');

class ApiUploader {
    constructor(options = {}) {
        this.apiEndpoint = options.apiEndpoint || 'https://stage-api.lambdatestinternal.com/insights/api/v3/queue';
        
        // Get auth credentials from environment variables or options
        this.username = options.username || process.env.LT_USERNAME;
        this.accessKey = options.accessKey || process.env.LT_ACCESS_KEY;
        
        // Create Basic auth token from username and access key
        this.authToken = this.createBasicAuthToken(this.username, this.accessKey);
        
        this.timeout = options.timeout || 30000; // 30 seconds timeout
        this.retryAttempts = options.retryAttempts || 3;
        this.retryDelay = options.retryDelay || 1000; // 1 second initial delay
    }

    /**
     * Create Basic authentication token from username and access key
     * @param {string} username - LambdaTest username
     * @param {string} accessKey - LambdaTest access key
     * @returns {string} - Base64 encoded Basic auth token
     */
    createBasicAuthToken(username, accessKey) {
        if (!username || !accessKey) {
            return null;
        }
        
        const credentials = `${username}:${accessKey}`;
        const encodedCredentials = Buffer.from(credentials).toString('base64');
        
        logger.apiUpload(`Created Basic auth token for user: ${username}`);
        return encodedCredentials;
    }

    /**
     * Upload URL tracking results to the LambdaTest insights API
     * @param {Object} trackingData - The tracking data to upload
     * @param {string} testId - The test ID to use as keyValue
     * @returns {Promise<Object>} - API response
     */
    async uploadTrackingResults(trackingData, testId) {
        logger.apiUpload(`Uploading tracking results for test: ${testId}`);

        if (!this.authToken) {
            const error = 'No authentication credentials provided. Set LT_USERNAME and LT_ACCESS_KEY environment variables or pass username/accessKey in options.';
            logger.error(error);
            throw new Error(error);
        }

        // Prepare the payload according to the specified format
        const payload = {
            keyName: "test_id",
            keyValue: testId,
            data: {
                navigations: trackingData.navigations || []
            },
            type: "url-tracker"
        };

        let lastError = null;
        
        // Retry logic with exponential backoff
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const response = await this.makeHttpRequest(payload);
                
                logger.apiUpload('Upload successful');
                return response;
                
            } catch (error) {
                lastError = error;
                logger.error(`Upload attempt ${attempt}/${this.retryAttempts} failed: ${error.message}`);
                
                if (attempt < this.retryAttempts) {
                    const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
                    await this.sleep(delay);
                } else {
                    logger.error('All retry attempts exhausted');
                    if (error.response) {
                        logger.error(`Error Response Status: ${error.response.statusCode}`);
                    }
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Make HTTP request to the API endpoint
     * @param {Object} payload - The payload to send
     * @returns {Promise<Object>} - Response object
     */
    makeHttpRequest(payload) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.apiEndpoint);
            const isHttps = url.protocol === 'https:';
            const httpModule = isHttps ? https : http;
            
            const postData = JSON.stringify(payload);
            
            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${this.authToken}`,
                    'Content-Length': Buffer.byteLength(postData),
                    'User-Agent': 'LambdaTest-Playwright-SDK/1.0.0'
                },
                timeout: this.timeout
            };

            const req = httpModule.request(options, (res) => {
                let responseBody = '';
                
                res.on('data', (chunk) => {
                    responseBody += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const parsedBody = responseBody ? JSON.parse(responseBody) : {};
                        
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve({
                                statusCode: res.statusCode,
                                headers: res.headers,
                                body: parsedBody
                            });
                        } else {
                            const error = new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`);
                            error.response = {
                                statusCode: res.statusCode,
                                headers: res.headers,
                                body: parsedBody
                            };
                            reject(error);
                        }
                    } catch (parseError) {
                        const error = new Error(`Failed to parse response body: ${parseError.message}`);
                        error.response = {
                            statusCode: res.statusCode,
                            headers: res.headers,
                            body: responseBody
                        };
                        reject(error);
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Request timeout after ${this.timeout}ms`));
            });

            // Write the payload
            req.write(postData);
            req.end();
        });
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Extract test ID from test metadata or generate a fallback
     * @param {Object} testMetadata - Test metadata object
     * @param {Object} options - URL tracker options
     * @returns {string} - Test ID
     */
    static extractTestId(testMetadata, options) {
        // Try to get test ID from various sources
        if (testMetadata) {
            // Check for session_id, build_id, or test_id in metadata
            const testId = testMetadata.session_id || 
                          testMetadata.build_id || 
                          testMetadata.test_id ||
                          (testMetadata.data && testMetadata.data.session_id) ||
                          (testMetadata.data && testMetadata.data.build_id) ||
                          (testMetadata.data && testMetadata.data.test_id);
            
            if (testId) {
                return testId;
            }
        }
        
        // Fallback to generating test ID from test name and timestamp
        const testName = options.testName || 'unknown_test';
        const timestamp = Date.now();
        const fallbackId = `${testName}_${timestamp}`;
        
        return fallbackId;
    }

    /**
     * Validate tracking data before upload
     * @param {Object} trackingData - The tracking data to validate
     * @returns {boolean} - Whether the data is valid
     */
    static validateTrackingData(trackingData) {
        if (!trackingData) {
            logger.warn('No tracking data provided');
            return false;
        }

        if (!trackingData.navigations || !Array.isArray(trackingData.navigations)) {
            logger.warn('Tracking data missing navigations array');
            return false;
        }

        if (trackingData.navigations.length === 0) {
            logger.warn('No navigation entries to upload');
            return false;
        }

        // Validate each navigation entry has required fields
        const requiredFields = ['spec_file', 'test_name', 'previous_url', 'current_url', 'timestamp', 'navigation_type'];
        const invalidEntries = trackingData.navigations.filter(nav => {
            return !requiredFields.every(field => nav.hasOwnProperty(field));
        });

        if (invalidEntries.length > 0) {
            logger.warn(`Found ${invalidEntries.length} invalid navigation entries missing required fields`);
        }

        return true;
    }
}

module.exports = ApiUploader; 
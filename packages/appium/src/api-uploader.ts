import { logger } from './logger';

// Declare Node.js modules and globals
declare const require: (name: string) => any;
declare const Buffer: {
    from(data: string): { toString(encoding: string): string };
    byteLength(data: string): number;
};

// Get Node.js modules
const https = require('https');
const http = require('http');
const { URL } = require('url');

interface ApiUploaderOptions {
    apiEndpoint?: string;
    username?: string;
    accessKey?: string;
    timeout?: number;
    retryAttempts?: number;
    retryDelay?: number;
}

interface TrackingData {
    navigations: Navigation[];
}

interface Navigation {
    spec_file: string;
    test_name: string;
    previous_screen: string;
    current_screen: string;
    timestamp: string;
    navigation_type: string;
}

interface ApiPayload {
    keyName: string;
    keyValue: string;
    data: TrackingData;
    type: string;
}

interface ApiResponse {
    statusCode: number;
    headers: any;
    body: any;
}

declare const process: {
    env?: { [key: string]: string | undefined };
};

class ApiUploader {
    private apiEndpoint: string;
    private username: string | undefined;
    private accessKey: string | undefined;
    private authToken: string | null;
    private timeout: number;
    private retryAttempts: number;
    private retryDelay: number;

    constructor(options: ApiUploaderOptions = {}) {
        this.apiEndpoint = options.apiEndpoint || 'https://stage-api.lambdatestinternal.com/insights/api/v3/queue';
        
        // Get auth credentials from environment variables or options
        this.username = options.username || (process.env && process.env.LT_USERNAME);
        this.accessKey = options.accessKey || (process.env && process.env.LT_ACCESS_KEY);
        
        // Create Basic auth token from username and access key
        this.authToken = this.createBasicAuthToken(this.username, this.accessKey);
        
        this.timeout = options.timeout || 30000; // 30 seconds timeout
        this.retryAttempts = options.retryAttempts || 3;
        this.retryDelay = options.retryDelay || 1000; // 1 second initial delay
    }

    /**
     * Create Basic authentication token from username and access key
     */
    private createBasicAuthToken(username?: string, accessKey?: string): string | null {
        if (!username || !accessKey) {
            return null;
        }
        
        const credentials = `${username}:${accessKey}`;
        const encodedCredentials = Buffer.from(credentials).toString('base64');
        
        logger.apiUpload(`Created Basic auth token for user: ${username}`);
        return encodedCredentials;
    }

    /**
     * Upload navigation tracking results to the LambdaTest insights API
     */
    async uploadTrackingResults(trackingData: TrackingData, testId: string): Promise<ApiResponse> {
        logger.apiUpload(`Uploading tracking results for test: ${testId}`);

        if (!this.authToken) {
            const error = 'No authentication credentials provided. Set LT_USERNAME and LT_ACCESS_KEY environment variables or pass username/accessKey in options.';
            logger.error(error);
            throw new Error(error);
        }

        // Prepare the payload according to the specified format
        const payload: ApiPayload = {
            keyName: "test_id",
            keyValue: testId,
            data: {
                navigations: trackingData.navigations || []
            },
            type: "mobile-navigation-tracker"
        };

        let lastError: Error | null = null;
        
        // Retry logic with exponential backoff
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                const response = await this.makeHttpRequest(payload);
                
                logger.apiUpload('Upload successful');
                return response;
                
            } catch (error) {
                lastError = error as Error;
                logger.error(`Upload attempt ${attempt}/${this.retryAttempts} failed: ${lastError.message}`);
                
                if (attempt < this.retryAttempts) {
                    const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
                    await this.sleep(delay);
                } else {
                    logger.error('All retry attempts exhausted');
                    if ((error as any).response) {
                        logger.error(`Error Response Status: ${(error as any).response.statusCode}`);
                    }
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Make HTTP request to the API endpoint
     */
    private makeHttpRequest(payload: ApiPayload): Promise<ApiResponse> {
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
                    'User-Agent': 'LambdaTest-Appium-SDK/1.0.0'
                },
                timeout: this.timeout
            };

            const req = httpModule.request(options, (res: any) => {
                let responseBody = '';
                
                res.on('data', (chunk: any) => {
                    responseBody += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const parsedBody = responseBody ? JSON.parse(responseBody) : {};
                        
                        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                            resolve({
                                statusCode: res.statusCode,
                                headers: res.headers,
                                body: parsedBody
                            });
                        } else {
                            const error = new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`) as any;
                            error.response = {
                                statusCode: res.statusCode,
                                headers: res.headers,
                                body: parsedBody
                            };
                            reject(error);
                        }
                    } catch (parseError) {
                        const error = new Error(`Failed to parse response body: ${(parseError as Error).message}`) as any;
                        error.response = {
                            statusCode: res.statusCode,
                            headers: res.headers,
                            body: responseBody
                        };
                        reject(error);
                    }
                });
            });

            req.on('error', (error: any) => {
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
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Extract test ID from test metadata or generate a fallback
     */
    static extractTestId(testMetadata: any, options: any): string {
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
     */
    static validateTrackingData(trackingData: TrackingData): boolean {
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
        const requiredFields = ['spec_file', 'test_name', 'previous_screen', 'current_screen', 'timestamp', 'navigation_type'];
        const invalidEntries = trackingData.navigations.filter(nav => {
            return !requiredFields.every(field => (nav as any).hasOwnProperty(field));
        });

        if (invalidEntries.length > 0) {
            logger.warn(`Found ${invalidEntries.length} invalid navigation entries missing required fields`);
        }

        return true;
    }
}

export { ApiUploader, ApiUploaderOptions, TrackingData, Navigation, ApiResponse }; 
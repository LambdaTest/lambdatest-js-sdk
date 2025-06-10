const https = require("https");
const http = require("http");
const { URL } = require("url");
const { logger } = require("./logger");

/**
 * Framework-agnostic API uploader for LambdaTest Insights
 * Supports multiple tracking types: mobile-navigation-tracker, url-tracker
 */
class ApiUploader {
  constructor(options = {}) {
    console.log("ApiUploader constructor called");
    this.apiEndpoint =
      options.apiEndpoint ||
      "https://stage-api.lambdatestinternal.com/insights/api/v3/queue";

    // Get auth credentials from environment variables or options
    this.username = options.username || process.env.LT_USERNAME;
    this.accessKey = options.accessKey || process.env.LT_ACCESS_KEY;

    // Create Basic auth token from username and access key
    this.authToken = this.createBasicAuthToken(this.username, this.accessKey);

    this.timeout = options.timeout || 30000; // 30 seconds timeout
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000; // 1 second initial delay

    // Default tracking type (can be overridden per upload)
    this.defaultTrackingType = options.trackingType || "url-tracker";

    // Check for verbose mode
    this.verboseMode = this.checkVerboseMode();

    if (this.verboseMode) {
      logger.apiUpload(
        "Verbose mode enabled - detailed API responses will be logged"
      );
    }
  }

  /**
   * Check if verbose mode is enabled through various methods
   * @returns {boolean} - Whether verbose mode is enabled
   */
  checkVerboseMode() {
    let verboseReasons = [];

    // Check command line arguments in multiple ways
    if (typeof process !== "undefined" && process.argv) {
      // Direct check for --verbose flag
      if (process.argv.includes("--verbose") || process.argv.includes("-v")) {
        verboseReasons.push("command line --verbose or -v flag");
      }

      // Check for npm run script with --verbose
      const argv = process.argv.join(" ");
      if (
        argv.includes("--verbose") ||
        argv.includes(" -v ") ||
        argv.includes(" -v")
      ) {
        verboseReasons.push("command line arguments contain verbose");
      }

      // Check for playwright test with --verbose
      if (argv.includes("playwright") && argv.includes("verbose")) {
        verboseReasons.push("playwright verbose in command line");
      }
    }

    // Check environment variables (multiple variations)
    if (typeof process !== "undefined" && process.env) {
      const envChecks = [
        "VERBOSE",
        "DEBUG_API_UPLOADER",
        "API_VERBOSE",
        "DEBUG",
        "PLAYWRIGHT_DEBUG",
        "DEBUG_URL_TRACKER",
      ];

      for (const envVar of envChecks) {
        if (process.env[envVar] === "true" || process.env[envVar] === "1") {
          verboseReasons.push(
            `environment variable ${envVar}=${process.env[envVar]}`
          );
        }
      }

      // Special check for NODE_ENV
      if (process.env.NODE_ENV === "debug") {
        verboseReasons.push("NODE_ENV=debug");
      }

      // Check for any debug-related environment variables
      const debugVars = Object.keys(process.env).filter(
        (key) =>
          key.toLowerCase().includes("verbose") ||
          key.toLowerCase().includes("debug")
      );

      for (const key of debugVars) {
        if (process.env[key] === "true" || process.env[key] === "1") {
          verboseReasons.push(
            `dynamic debug env var ${key}=${process.env[key]}`
          );
        }
      }
    }

    // Check if npm was called with --verbose by looking at npm config
    try {
      if (typeof process !== "undefined" && process.env.npm_config_loglevel) {
        if (
          process.env.npm_config_loglevel === "verbose" ||
          process.env.npm_config_loglevel === "silly"
        ) {
          verboseReasons.push(
            `npm config loglevel: ${process.env.npm_config_loglevel}`
          );
        }
      }

      // Check npm_config_verbose specifically
      if (process.env.npm_config_verbose === "true") {
        verboseReasons.push("npm_config_verbose=true");
      }
    } catch (e) {
      // Ignore errors in npm config check
    }

    const isVerbose = verboseReasons.length > 0;

    // Always log the verbose mode detection result for debugging
    console.log(`[ApiUploader] Verbose mode detection:`);
    console.log(`  Result: ${isVerbose}`);
    if (isVerbose) {
      console.log(`  Enabled by: ${verboseReasons.join(", ")}`);
    } else {
      console.log(`  No verbose flags detected`);
      console.log(
        `  Checked environment variables: ${
          Object.keys(process.env || {})
            .filter((k) => k.includes("DEBUG") || k.includes("VERBOSE"))
            .join(", ") || "none"
        }`
      );
      console.log(
        `  Command line args: ${process.argv ? process.argv.join(" ") : "none"}`
      );
    }

    return isVerbose;
  }

  /**
   * Manually enable verbose mode
   * @param {boolean} enabled - Whether to enable verbose mode
   */
  setVerboseMode(enabled) {
    this.verboseMode = enabled;
    if (enabled) {
      logger.apiUpload("Verbose mode manually enabled");
    }
  }

  /**
   * Create Basic authentication token from username and access key
   * @param {string} username - LambdaTest username
   * @param {string} accessKey - LambdaTest access key
   * @returns {string|null} - Base64 encoded Basic auth token
   */
  createBasicAuthToken(username, accessKey) {
    if (!username || !accessKey) {
      return null;
    }

    const credentials = `${username}:${accessKey}`;
    const encodedCredentials = Buffer.from(credentials).toString("base64");

    logger.apiUpload(`Created Basic auth token for user: ${username}`);
    return encodedCredentials;
  }

  /**
   * Upload tracking results to the LambdaTest insights API
   * @param {Object} trackingData - The tracking data to upload
   * @param {string} testId - The test ID to use as keyValue
   * @param {Object} options - Upload options
   * @param {string} options.trackingType - Type of tracking ('url-tracker', 'mobile-navigation-tracker')
   * @param {string} options.framework - Framework name for user agent
   * @returns {Promise<Object>} - API response
   */
  async uploadTrackingResults(trackingData, testId, options = {}) {
    const trackingType = options.trackingType || this.defaultTrackingType;
    const framework = options.framework || "SDK";

    // ENHANCED DEBUG: Always log entry to this method
    console.log(`[ApiUploader] uploadTrackingResults called`);
    console.log(`  Test ID: ${testId}`);
    console.log(`  Tracking Type: ${trackingType}`);
    console.log(`  Framework: ${framework}`);
    console.log(`  Has tracking data: ${!!trackingData}`);
    console.log(
      `  Navigation count: ${
        trackingData && trackingData.navigations
          ? trackingData.navigations.length
          : 0
      }`
    );
    console.log(`  Verbose mode: ${this.verboseMode}`);
    console.log(`  Auth token available: ${!!this.authToken}`);

    logger.apiUpload(`Uploading ${trackingType} results for test: ${testId}`);

    if (this.verboseMode) {
      logger.apiUpload(`Upload configuration:`);
      logger.apiUpload(`  Tracking Type: ${trackingType}`);
      logger.apiUpload(`  Framework: ${framework}`);
      logger.apiUpload(`  Test ID: ${testId}`);
      logger.apiUpload(`  API Endpoint: ${this.apiEndpoint}`);
      logger.apiUpload(
        `  Navigation Count: ${
          trackingData.navigations ? trackingData.navigations.length : 0
        }`
      );
      logger.apiUpload(`  Retry Attempts: ${this.retryAttempts}`);
      logger.apiUpload(`  Timeout: ${this.timeout}ms`);
    }

    if (!this.authToken) {
      const error =
        "No authentication credentials provided. Set LT_USERNAME and LT_ACCESS_KEY environment variables or pass username/accessKey in options.";
      console.log(`[ApiUploader] AUTH ERROR: ${error}`);
      logger.error(error);
      throw new Error(error);
    }

    // Prepare the payload according to the specified format
    const payload = {
      keyName: "test_id",
      keyValue: testId,
      data: {
        navigations: trackingData.navigations || [],
      },
      type: trackingType,
    };

    console.log(
      `[ApiUploader] Prepared payload with ${payload.data.navigations.length} navigations`
    );

    let lastError = null;

    // Retry logic with exponential backoff
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        console.log(
          `[ApiUploader] Making API request - attempt ${attempt}/${this.retryAttempts}`
        );

        if (this.verboseMode && attempt > 1) {
          logger.apiUpload(`Retry attempt ${attempt}/${this.retryAttempts}`);
        }

        const response = await this.makeHttpRequest(payload, framework);

        console.log(
          `[ApiUploader] API request successful on attempt ${attempt}`
        );
        logger.apiUpload("Upload successful");
        if (this.verboseMode) {
          logger.apiUpload(
            `✅ Upload completed on attempt ${attempt}/${this.retryAttempts}`
          );
        }
        return response;
      } catch (error) {
        lastError = error;
        console.log(
          `[ApiUploader] Upload attempt ${attempt}/${this.retryAttempts} failed: ${error.message}`
        );
        logger.error(
          `Upload attempt ${attempt}/${this.retryAttempts} failed: ${error.message}`
        );

        if (this.verboseMode) {
          logger.apiUpload(
            `❌ Attempt ${attempt} failed with error: ${error.message}`
          );
          if (error.response) {
            logger.apiUpload(`Response status: ${error.response.statusCode}`);
            logger.apiUpload(
              `Response body: ${JSON.stringify(error.response.body, null, 2)}`
            );
          }
        }

        if (attempt < this.retryAttempts) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`[ApiUploader] Waiting ${delay}ms before retry...`);
          if (this.verboseMode) {
            logger.apiUpload(`⏳ Waiting ${delay}ms before retry...`);
          }
          await this.sleep(delay);
        } else {
          console.log(`[ApiUploader] All retry attempts exhausted`);
          logger.error("All retry attempts exhausted");
          if (error.response) {
            logger.error(`Error Response Status: ${error.response.statusCode}`);
            if (this.verboseMode) {
              logger.apiUpload(
                `Final error response: ${JSON.stringify(
                  error.response,
                  null,
                  2
                )}`
              );
            }
          }
        }
      }
    }

    console.log(
      `[ApiUploader] Upload failed after all retries: ${lastError.message}`
    );
    throw lastError;
  }

  /**
   * Make HTTP request to the API endpoint
   * @param {Object} payload - The payload to send
   * @param {string} framework - Framework name for user agent
   * @returns {Promise<Object>} - Response object
   */
  makeHttpRequest(payload, framework = "SDK") {
    return new Promise((resolve, reject) => {
      const url = new URL(this.apiEndpoint);
      const isHttps = url.protocol === "https:";
      const httpModule = isHttps ? https : http;

      const postData = JSON.stringify(payload);

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${this.authToken}`,
          "Content-Length": Buffer.byteLength(postData),
          "User-Agent": `LambdaTest-${framework}-SDK/1.0.0`,
        },
        timeout: this.timeout,
      };

      // Log request details in verbose mode
      if (this.verboseMode) {
        logger.apiUpload(`Making API request to: ${this.apiEndpoint}`);
        logger.apiUpload(`Request method: ${options.method}`);
        logger.apiUpload(
          `Request headers: ${JSON.stringify(
            {
              ...options.headers,
              Authorization: "Basic [HIDDEN]", // Hide auth token for security
            },
            null,
            2
          )}`
        );
        logger.apiUpload(
          `Request payload: ${JSON.stringify(payload, null, 2)}`
        );
      }

      const req = httpModule.request(options, (res) => {
        let responseBody = "";

        res.on("data", (chunk) => {
          responseBody += chunk;
        });

        res.on("end", () => {
          try {
            const parsedBody = responseBody ? JSON.parse(responseBody) : {};

            // Log detailed response in verbose mode
            if (this.verboseMode) {
              logger.apiUpload(`API Response Details:`);
              logger.apiUpload(
                `  Status: ${res.statusCode} ${res.statusMessage}`
              );
              logger.apiUpload(
                `  Headers: ${JSON.stringify(res.headers, null, 2)}`
              );
              logger.apiUpload(
                `  Response Body: ${JSON.stringify(parsedBody, null, 2)}`
              );
            }

            if (res.statusCode >= 200 && res.statusCode < 300) {
              if (this.verboseMode) {
                logger.apiUpload("✅ API request completed successfully");
              }
              resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body: parsedBody,
              });
            } else {
              if (this.verboseMode) {
                logger.apiUpload(
                  `❌ API request failed with status ${res.statusCode}`
                );
                logger.apiUpload(
                  `Error details: ${JSON.stringify(parsedBody, null, 2)}`
                );
              }
              const error = new Error(
                `HTTP ${res.statusCode}: ${res.statusMessage}`
              );
              error.response = {
                statusCode: res.statusCode,
                headers: res.headers,
                body: parsedBody,
              };
              reject(error);
            }
          } catch (parseError) {
            if (this.verboseMode) {
              logger.apiUpload(
                `❌ Failed to parse API response: ${parseError.message}`
              );
              logger.apiUpload(`Raw response body: ${responseBody}`);
            }
            const error = new Error(
              `Failed to parse response body: ${parseError.message}`
            );
            error.response = {
              statusCode: res.statusCode,
              headers: res.headers,
              body: responseBody,
            };
            reject(error);
          }
        });
      });

      req.on("error", (error) => {
        if (this.verboseMode) {
          logger.apiUpload(`❌ Request error: ${error.message}`);
          logger.apiUpload(
            `Error details: ${JSON.stringify(
              error,
              Object.getOwnPropertyNames(error),
              2
            )}`
          );
        }
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on("timeout", () => {
        if (this.verboseMode) {
          logger.apiUpload(`❌ Request timeout after ${this.timeout}ms`);
        }
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
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Extract test ID from test metadata or generate a fallback
   * @param {Object} testMetadata - Test metadata object
   * @param {Object} options - Tracker options
   * @returns {string} - Test ID
   */
  static extractTestId(testMetadata, options = {}) {
    // Try to get test ID from various sources
    if (testMetadata) {
      // Check for session_id, build_id, or test_id in metadata
      const testId =
        testMetadata.session_id ||
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
    const testName = options.testName || "unknown_test";
    const timestamp = Date.now();
    const fallbackId = `${testName}_${timestamp}`;

    return fallbackId;
  }

  /**
   * Validate tracking data before upload (framework-agnostic)
   * @param {Object} trackingData - The tracking data to validate
   * @param {string} trackingType - Type of tracking to validate for
   * @returns {boolean} - Whether the data is valid
   */
  static validateTrackingData(trackingData, trackingType = "url-tracker") {
    if (!trackingData) {
      logger.warn("No tracking data provided");
      return false;
    }

    if (!trackingData.navigations || !Array.isArray(trackingData.navigations)) {
      logger.warn("Tracking data missing navigations array");
      return false;
    }

    if (trackingData.navigations.length === 0) {
      logger.warn("No navigation entries to upload");
      return false;
    }

    // Define required fields based on tracking type
    let requiredFields;
    if (trackingType === "mobile-navigation-tracker") {
      // Appium mobile navigation fields
      requiredFields = [
        "spec_file",
        "test_name",
        "previous_screen",
        "current_screen",
        "timestamp",
        "navigation_type",
      ];
    } else {
      // URL tracking fields (Playwright/WebDriverIO)
      requiredFields = [
        "spec_file",
        "test_name",
        "previous_url",
        "current_url",
        "timestamp",
        "navigation_type",
      ];
    }

    // Validate each navigation entry has required fields
    const invalidEntries = trackingData.navigations.filter((nav) => {
      return !requiredFields.every((field) => nav.hasOwnProperty(field));
    });

    if (invalidEntries.length > 0) {
      logger.warn(
        `Found ${invalidEntries.length} invalid navigation entries missing required fields for ${trackingType}`
      );
      logger.debug(`Required fields: ${requiredFields.join(", ")}`, true);
    }

    return true;
  }

  /**
   * Create an instance configured for Appium mobile navigation tracking
   * @param {Object} options - ApiUploader options
   * @returns {ApiUploader} - Configured instance
   */
  static forAppium(options = {}) {
    const instance = new ApiUploader({
      ...options,
      trackingType: "mobile-navigation-tracker",
    });

    // Allow manual verbose override
    if (options.verbose === true) {
      instance.setVerboseMode(true);
    }

    return instance;
  }

  /**
   * Create an instance configured for Playwright URL tracking
   * @param {Object} options - ApiUploader options
   * @returns {ApiUploader} - Configured instance
   */
  static forPlaywright(options = {}) {
    const instance = new ApiUploader({
      ...options,
      trackingType: "url-tracker",
    });

    // Allow manual verbose override
    if (options.verbose === true) {
      instance.setVerboseMode(true);
    }

    return instance;
  }

  /**
   * Create an instance configured for WebDriverIO URL tracking
   * @param {Object} options - ApiUploader options
   * @returns {ApiUploader} - Configured instance
   */
  static forWebDriverIO(options = {}) {
    const instance = new ApiUploader({
      ...options,
      trackingType: "url-tracker",
    });

    // Allow manual verbose override
    if (options.verbose === true) {
      instance.setVerboseMode(true);
    }

    return instance;
  }
}

module.exports = ApiUploader;

const { smartuiSnapshot } = require('./src/smartui');
const UrlTrackerPlugin = require('./src/insights/url-tracker');
const { createUrlTrackerFixture, performGlobalUrlTrackerCleanup } = require('./src/insights/url-tracker');
const { logger, UrlTrackerLogger } = require('../sdk-utils/src/insights/insights-logger');

// Import ApiUploader with error handling to avoid initialization issues
let ApiUploader = null;
try {
    ApiUploader = require('../sdk-utils/src/insights/api-uploader');
} catch (e) {
    console.warn('ApiUploader not available:', e.message);
}
const { enableVerboseMode: universalEnableVerbose, runDebugScript } = require('../sdk-utils');

/**
 * Helper function to enable verbose mode for API uploads
 * This can be called before running tests to enable detailed logging
 */
function enableVerboseMode() {
    universalEnableVerbose();
    logger.info('Verbose mode enabled for LambdaTest Playwright driver');
    logger.info('API uploads will now show detailed request/response information');
}

/**
 * Create URL tracker fixture with verbose option
 * Note: specFile is automatically detected from command line arguments - no need to specify manually
 */
function createVerboseUrlTrackerFixture(options = {}) {
    return createUrlTrackerFixture({
        ...options,
        verbose: true,
        enableApiUpload: options.enableApiUpload !== false // Default to true unless explicitly disabled
    });
}

/**
 * Run universal debug script for Playwright
 */
function runPlaywrightDebugScript() {
    return runDebugScript('playwright');
}

module.exports = {
    smartuiSnapshot,
    UrlTrackerPlugin,
    createUrlTrackerFixture,
    createVerboseUrlTrackerFixture,
    performGlobalUrlTrackerCleanup,
    ApiUploader,
    logger,
    UrlTrackerLogger,
    enableVerboseMode,
    runPlaywrightDebugScript
}
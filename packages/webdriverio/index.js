const { smartuiSnapshot } = require('./src/smartui');
const UrlTracker = require('./src/insights/url-tracker');
const UrlTrackerService = require('./src/insights/url-tracker-service');
const { enhanceConfigWithUrlTracking } = require('./src/insights/hooks');
const { ApiUploader } = require('../sdk-utils/src/insights/api-uploader');
const { logger, UrlTrackerLogger } = require('../sdk-utils/src/insights/insights-logger');
const { enableVerboseMode: universalEnableVerbose, runDebugScript } = require('../sdk-utils');

/**
 * Helper function to enable verbose mode for WebDriverIO
 */
function enableVerboseMode() {
    universalEnableVerbose();
    logger.info('Verbose mode enabled for LambdaTest WebDriverIO driver');
    logger.info('API uploads will now show detailed request/response information');
}

/**
 * Run universal debug script for WebDriverIO
 */
function runWebDriverIODebugScript() {
    return runDebugScript('webdriverio');
}

module.exports = {
    smartuiSnapshot,
    UrlTracker,
    UrlTrackerService,
    enhanceConfigWithUrlTracking,
    ApiUploader,
    logger,
    UrlTrackerLogger,
    enableVerboseMode,
    runWebDriverIODebugScript
}

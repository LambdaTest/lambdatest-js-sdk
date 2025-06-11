const { smartuiSnapshot } = require('./src/smartui');
const UrlTracker = require('./src/insights/url-tracker');
const UrlTrackerService = require('./src/insights/url-tracker-service');
const { enhanceConfigWithUrlTracking } = require('./src/insights/hooks');
const { logger, UrlTrackerLogger, ApiUploader } = require('@lambdatest/sdk-utils');

// Import HTML reporters from sdk-utils
const { HtmlReporter, EnhancedHtmlReporter, ReportCLI } = require('../sdk-utils');

const { enableVerboseMode: universalEnableVerbose, runDebugScript } = require('../sdk-utils');

/**
 * Helper function to enable verbose mode for WebDriverIO
 */
function enableVerboseMode() {
    universalEnableVerbose();
    logger.info('Verbose mode enabled for LambdaTest WebDriverIO driver');
    logger.info('API uploads will now show detailed request/response information');
    logger.info('Enhanced HTML reporter with GitHub Primer UI is available');
}

/**
 * Run universal debug script for WebDriverIO
 */
function runWebDriverIODebugScript() {
    return runDebugScript('webdriverio');
}

/**
 * Generate enhanced HTML report for WebDriverIO URL tracking results
 * @param {Object} options - Report options
 * @returns {string} Path to generated report
 */
function generateEnhancedReport(options = {}) {
    const defaultOptions = {
        theme: 'light',
        enhanced: true,
        enableSearch: true,
        enableFilters: true,
        showMetrics: true,
        showTimeline: true,
        title: 'LambdaTest WebDriverIO URL Tracking Report'
    };
    
    return EnhancedHtmlReporter.generateFromFiles({
        ...defaultOptions,
        ...options
    });
}

module.exports = {
    smartuiSnapshot,
    UrlTracker,
    UrlTrackerService,
    enhanceConfigWithUrlTracking,
    ApiUploader,
    logger,
    UrlTrackerLogger,
    // Enhanced HTML reporting
    HtmlReporter,
    EnhancedHtmlReporter,
    ReportCLI,
    generateEnhancedReport,
    enableVerboseMode,
    runWebDriverIODebugScript
}

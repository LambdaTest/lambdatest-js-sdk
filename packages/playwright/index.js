const { smartuiSnapshot } = require('./src/smartui');
const UrlTrackerPlugin = require('./src/insights/url-tracker');
const { createUrlTrackerFixture, performGlobalUrlTrackerCleanup } = require('./src/insights/url-tracker');
const { logger, UrlTrackerLogger } = require('@lambdatest/sdk-utils');

// Import ApiUploader with error handling to avoid initialization issues
let ApiUploader = null;
try {
    ApiUploader = require('@lambdatest/sdk-utils');
} catch (e) {
    console.warn('ApiUploader not available:', e.message);
}

// Import HTML reporters from sdk-utils
const { HtmlReporter, EnhancedHtmlReporter, ReportCLI } = require('../sdk-utils');

const { enableVerboseMode: universalEnableVerbose, runDebugScript } = require('../sdk-utils');

/**
 * Helper function to enable verbose mode for API uploads
 * This can be called before running tests to enable detailed logging
 */
function enableVerboseMode() {
    universalEnableVerbose();
    logger.info('Verbose mode enabled for LambdaTest Playwright driver');
    logger.info('API uploads will now show detailed request/response information');
    logger.info('Enhanced HTML reporter with GitHub Primer UI is available');
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

/**
 * Generate enhanced HTML report for Playwright URL tracking results with auto-open
 * This provides the same experience as Playwright's native HTML reporter
 * @param {Object} options - Report options
 * @returns {string} Path to generated report
 */
function generateEnhancedReport(options = {}) {
    const defaultOptions = {
        theme: 'dark', // Default to dark theme
        enhanced: true,
        enableSearch: true,
        enableFilters: true,
        showMetrics: true,
        showTimeline: true,
        autoOpen: true, // Auto-open like Playwright does
        enableKeyboardShortcut: true,
        title: 'LambdaTest Playwright URL Tracking Report'
    };
    
    const reportPath = EnhancedHtmlReporter.generateFromFiles({
        ...defaultOptions,
        ...options
    });
    
    if (reportPath) {
        // Show enhanced report notification (like Playwright does)
        setTimeout(() => {
            console.log('\n🎉 Enhanced URL Tracking Report Ready!');
            console.log(`📄 Report: ${reportPath}`);
            console.log('🔍 Features: GitHub Primer UI, Search, Filters, Metrics Dashboard');
            console.log('\n🌐 Report opened in your browser automatically!');
            console.log('   Press Ctrl+C to exit or continue with your tests...\n');
        }, 100);
    }
    
    return reportPath;
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
    // Enhanced HTML reporting
    HtmlReporter,
    EnhancedHtmlReporter,
    ReportCLI,
    generateEnhancedReport,
    enableVerboseMode,
    runPlaywrightDebugScript
}
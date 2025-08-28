const {
  isSmartUIRunning,
  fetchDOMSerializer,
  postSnapshot,
} = require("./src/smartui");
const logger = require("./src/lib/logger");
const { HtmlReporter, EnhancedHtmlReporter } = require("./src/insights/html-reporter");
const ApiUploader = require("./src/insights/api-uploader");
const { loggerInsights } = require("./src/insights/insights-logger");

// Helper function to enable verbose mode for all frameworks
function enableVerboseMode() {
  process.env.API_VERBOSE = "true";
  process.env.DEBUG_API_UPLOADER = "true";
  process.env.VERBOSE = "true";
  process.env.DEBUG_URL_TRACKER = "true";
  logger.info("Universal verbose mode enabled for all LambdaTest frameworks");
  logger.verboseMode = true;
  logger.info('Enhanced HTML reporter with Playwright-style UI is now the default');
}

// Helper function to run debug script programmatically
function runDebugScript(framework = "all") {
  const validFrameworks = ["appium", "playwright", "webdriverio", "all"];
  if (!validFrameworks.includes(framework)) {
    logger.error(
      `Invalid framework: ${framework}. Valid options: ${validFrameworks.join(
        ", "
      )}`
    );
    return false;
  }

  try {
    // Set the framework as command line argument for the debug script
    process.argv[2] = framework;
    require("./src/insights/debug-verbose");
    return true;
  } catch (error) {
    logger.error(`Error running debug script: ${error.message}`);
    return false;
  }
}
const { isSmartUIRunning, fetchDOMSerializer, postSnapshot, getSnapshotStatus } = require('./src/smartui');
const logger = require('./src/lib/logger'); 

module.exports = {
    logger,
    fetchDOMSerializer,
    postSnapshot,
    isSmartUIRunning,
    getSnapshotStatus,
    loggerInsights,
    HtmlReporter,
    ApiUploader,
    EnhancedHtmlReporter,
    ReportCLI: require('./src/insights/report-cli'),
    enableVerboseMode,
    runDebugScript,
};

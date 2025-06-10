const {
  isSmartUIRunning,
  fetchDOMSerializer,
  postSnapshot,
} = require("./src/smartui");
const logger = require("./src/lib/logger");
const HtmlReporter = require("./src/insights/html-reporter");
const ApiUploader = require("./src/insights/api-uploader");
const { UrlTrackerLogger } = require("./src/insights/logger");

// Helper function to enable verbose mode for all frameworks
function enableVerboseMode() {
  process.env.API_VERBOSE = "true";
  process.env.DEBUG_API_UPLOADER = "true";
  process.env.VERBOSE = "true";
  process.env.DEBUG_URL_TRACKER = "true";
  logger.info("Universal verbose mode enabled for all LambdaTest frameworks");
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

module.exports = {
  logger,
  UrlTrackerLogger,
  fetchDOMSerializer,
  postSnapshot,
  isSmartUIRunning,
  HtmlReporter,
  ApiUploader,
  enableVerboseMode,
  runDebugScript,
};

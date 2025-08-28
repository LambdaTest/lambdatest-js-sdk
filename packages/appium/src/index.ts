export { NavigationTracker } from './insights/NavigationTracker';
// Re-export logger, UrlTrackerLogger and ApiUploader from common sdk-utils
const { logger, UrlTrackerLogger, ApiUploader } = require('@lambdatest/sdk-utils');
const { enableVerboseMode: universalEnableVerbose, runDebugScript } = require('@lambdatest/sdk-utils');


/**
 * Helper function to enable verbose mode for Appium
 */
export function enableVerboseMode() {
    universalEnableVerbose();
    logger.info('Verbose mode enabled for LambdaTest Appium driver');
    logger.info('API uploads will now show detailed request/response information');
}

/**
 * Run universal debug script for Appium
 */
export function runAppiumDebugScript() {
    return runDebugScript('appium');
}

export { logger, UrlTrackerLogger };
export { ApiUploader };
export { WebDriverIONavigationTracker, createWebDriverIOTracker, NavigationTrackerOptions } from './insights/WebDriverIONavigationTracker';

// Re-export both HTML reporters from common sdk-utils
const { HtmlReporter, EnhancedHtmlReporter } = require('../../sdk-utils/src/insights/html-reporter');
export { HtmlReporter, EnhancedHtmlReporter };

// Export CLI for generating reports
const { ReportCLI } = require('../../sdk-utils');
export { ReportCLI };

export interface ApiUploaderOptions {
  apiEndpoint?: string;
  username?: string;
  accessKey?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  trackingType?: string;
  verbose?: boolean;
}

export interface TrackingData {
  navigations: Array<{
    previous_screen: string;
    current_screen: string;
    timestamp: string;
    navigation_type: string;
    spec_file: string;
    test_name: string;
  }>;
}

export interface Navigation {
  previous_screen: string;
  current_screen: string;
  timestamp: string;
  navigation_type: string;
  spec_file: string;
  test_name: string;
}

export interface ApiResponse {
  statusCode: number;
  headers: any;
  body: any;
} 
import { Page } from 'playwright';

/**
 * The format of a URL tracking entry
 */
export interface UrlTrackingEntry {
  /**
   * The spec file that generated this navigation
   */
  spec_file: string;
  
  /**
   * The test name that generated this navigation
   */
  test_name: string;
  
  /**
   * The URL before navigation
   */
  previous_url: string;
  
  /**
   * The URL after navigation
   */
  current_url: string;
  
  /**
   * Timestamp in ISO format
   */
  timestamp: string;
  
  /**
   * Type of navigation (goto, navigation, hashchange, pushState, replaceState, etc)
   */
  navigation_type: string;
}

/**
 * Options for configuring the UrlTrackerPlugin
 */
export interface UrlTrackerOptions {
  /**
   * Enable/disable URL tracking
   * @default true
   */
  enabled?: boolean;
  
  /**
   * Track hash changes in URLs
   * @default true
   */
  trackHashChanges?: boolean;
  
  /**
   * Test name for identification in tracking results
   * @default 'unknown'
   */
  testName?: string;
  
  /**
   * Spec file name for identification in tracking results
   * @default 'unknown'
   */
  specFile?: string;
  
  /**
   * Preserve navigation history after destroy
   * @default true
   */
  preserveHistory?: boolean;
  
  /**
   * Enable automatic API upload of tracking results
   * @default true
   */
  enableApiUpload?: boolean;
  
  /**
   * Custom API endpoint for uploading results
   * @default 'https://stage-api.lambdatestinternal.com/insights/api/v3/queue'
   */
  apiEndpoint?: string;
  
  /**
   * LambdaTest username for API authentication (can also be set via LT_USERNAME env var)
   */
  username?: string;
  
  /**
   * LambdaTest access key for API authentication (can also be set via LT_ACCESS_KEY env var)
   */
  accessKey?: string;
}

/**
 * Options for configuring the ApiUploader
 */
export interface ApiUploaderOptions {
  /**
   * API endpoint URL
   * @default 'https://stage-api.lambdatestinternal.com/insights/api/v3/queue'
   */
  apiEndpoint?: string;
  
  /**
   * LambdaTest username (can also be set via LT_USERNAME env var)
   */
  username?: string;
  
  /**
   * LambdaTest access key (can also be set via LT_ACCESS_KEY env var)
   */
  accessKey?: string;
  
  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;
  
  /**
   * Number of retry attempts on failure
   * @default 3
   */
  retryAttempts?: number;
  
  /**
   * Initial retry delay in milliseconds
   * @default 1000
   */
  retryDelay?: number;
}

/**
 * API response structure
 */
export interface ApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
}

/**
 * Tracking data structure for API upload
 */
export interface TrackingData {
  navigations: UrlTrackingEntry[];
}

/**
 * API payload structure
 */
export interface ApiPayload {
  keyName: string;
  keyValue: string;
  data: TrackingData;
  type: string;
}

/**
 * ApiUploader class for uploading tracking results to LambdaTest insights API
 */
export declare class ApiUploader {
  constructor(options?: ApiUploaderOptions);
  
  /**
   * Upload URL tracking results to the API
   * @param trackingData The tracking data to upload
   * @param testId The test ID to use as keyValue
   * @returns Promise resolving to API response
   */
  uploadTrackingResults(trackingData: TrackingData, testId: string): Promise<ApiResponse>;
  
  /**
   * Extract test ID from test metadata or generate fallback
   * @param testMetadata Test metadata object
   * @param options URL tracker options
   * @returns Test ID string
   */
  static extractTestId(testMetadata: any, options: UrlTrackerOptions): string;
  
  /**
   * Validate tracking data before upload
   * @param trackingData The tracking data to validate
   * @returns Whether the data is valid
   */
  static validateTrackingData(trackingData: TrackingData): boolean;
}

/**
 * UrlTrackerPlugin class for tracking page navigations
 */
export declare class UrlTrackerPlugin {
  constructor(page: Page, options?: UrlTrackerOptions);
  
  /**
   * Initialize the URL tracker
   */
  init(): Promise<void>;
  
  /**
   * Get navigation history
   */
  getNavigationHistory(): Array<{url: string, type: string, timestamp: number}>;
  
  /**
   * Get current URL
   */
  getCurrentUrl(): string;
  
  /**
   * Get tracking results in the new format
   */
  getTrackingResults(): UrlTrackingEntry[];
  
  /**
   * Export results to JSON file
   * @param outputPath Optional output file path
   */
  exportResults(outputPath?: string): void;
  
  /**
   * Clear navigation history
   */
  clearHistory(): void;
  
  /**
   * Clean up and upload results (includes API upload if enabled)
   */
  cleanup(): Promise<void>;
  
  /**
   * Destroy the tracker
   */
  destroy(): Promise<void>;
}

declare module '@playwright/test' {
  interface Page {
    /**
     * Manually records the current page URL as a navigation event.
     * This is useful when automatic tracking doesn't capture all navigation events,
     * especially in single-page applications (SPAs).
     * 
     * @param url Optional URL to record instead of the current page URL
     * @returns Promise that resolves when the navigation has been recorded
     * 
     * @example
     * ```typescript
     * // Record the current page URL
     * await page.recordNavigation();
     * 
     * // Record a specific URL
     * await page.recordNavigation('https://example.com/specific-path');
     * ```
     */
    recordNavigation(url?: string): Promise<void>;
  }
}

/**
 * Logger utility for URL Tracker with teal color and logo prefix
 */
export declare class UrlTrackerLogger {
  constructor();
  
  /**
   * Log info message in teal
   */
  info(message: string): void;
  
  /**
   * Log success message in bright teal
   */
  success(message: string): void;
  
  /**
   * Log warning message in yellow
   */
  warn(message: string): void;
  
  /**
   * Log error message in red
   */
  error(message: string): void;
  
  /**
   * Log debug message in gray (only if debug is enabled)
   */
  debug(message: string, debugEnabled?: boolean): void;
  
  /**
   * Log API upload related messages with special formatting
   */
  apiUpload(message: string): void;
  
  /**
   * Log navigation related messages
   */
  navigation(message: string): void;
  
  /**
   * Log initialization messages
   */
  init(message: string): void;
  
  /**
   * Log cleanup messages
   */
  cleanup(message: string): void;
  
  /**
   * Log export messages
   */
  export(message: string): void;
  
  /**
   * Log metadata messages
   */
  metadata(message: string): void;
  
  /**
   * Create a child logger with a specific context
   */
  child(context: string): ContextLogger;
}

/**
 * Context logger for specific components
 */
export declare class ContextLogger {
  constructor(parentLogger: UrlTrackerLogger, context: string);
  
  info(message: string): void;
  success(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string, debugEnabled?: boolean): void;
  apiUpload(message: string): void;
  navigation(message: string): void;
  init(message: string): void;
  cleanup(message: string): void;
  export(message: string): void;
  metadata(message: string): void;
}

/**
 * Singleton logger instance
 */
export declare const logger: UrlTrackerLogger;

/**
 * Options for the URL tracker fixture
 */
export interface UrlTrackerFixtureOptions extends UrlTrackerOptions {
  // Inherits all options from UrlTrackerOptions
}

/**
 * URL tracker fixture return type
 */
export interface UrlTrackerFixture {
  beforeEach: (context: { page: Page }, testInfo: any) => Promise<void>;
  afterEach: (context: { page: Page }, testInfo: any) => Promise<void>;
}

/**
 * Create a self-contained URL tracker fixture for Playwright tests
 * This fixture handles all setup and cleanup automatically, requiring no user configuration
 * 
 * @param options Configuration options for the URL tracker
 * @returns Playwright fixture object with beforeEach and afterEach handlers
 * 
 * @example
 * ```typescript
 * import { test } from '@playwright/test';
 * import { createUrlTrackerFixture } from '@lambdatest/playwright-driver';
 * 
 * // Create the fixture - this is all you need!
 * const urlTrackerFixture = createUrlTrackerFixture({
 *   enabled: true,
 *   trackHashChanges: true,
 *   enableApiUpload: true
 * });
 * 
 * // Use the fixture in your tests
 * test.use(urlTrackerFixture);
 * 
 * test('should track URLs automatically', async ({ page }) => {
 *   await page.goto('https://example.com');
 *   // Tracking and cleanup happen automatically!
 * });
 * ```
 */
export declare function createUrlTrackerFixture(options?: UrlTrackerFixtureOptions): UrlTrackerFixture;

/**
 * Perform global cleanup of all URL trackers
 * This function is called automatically by process handlers, but can be called manually if needed
 * 
 * @returns Promise that resolves when cleanup is complete
 * 
 * @example
 * ```typescript
 * import { performGlobalUrlTrackerCleanup } from '@lambdatest/playwright-driver';
 * 
 * // Manually trigger global cleanup (usually not needed)
 * await performGlobalUrlTrackerCleanup();
 * ```
 */
export declare function performGlobalUrlTrackerCleanup(): Promise<void>; 
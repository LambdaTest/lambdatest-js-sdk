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
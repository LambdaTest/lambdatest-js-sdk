// Import logger and ApiUploader from the common SDK utils
const { logger } = require('../../../sdk-utils/src/insights/logger');
const { ApiUploader } = require('../../../sdk-utils/src/insights/api-uploader');

// Declare Node.js modules and globals
declare const require: (name: string) => any;
declare const process: {
  cwd(): string;
};
declare const global: any;

// Get Node.js modules
const fs = require('fs');
const path = require('path');

// Import HTML Reporter from common SDK utils
const { HtmlReporter } = require('../../../sdk-utils/src/insights/html-reporter');

interface Navigation {
  previous_screen: string;
  current_screen: string;
  timestamp: string;
  navigation_type: string;
  spec_file: string;
  test_name: string;
}

interface TestResult {
  spec_file: string;
  test_name: string;
  session_id: string;
  navigations: Navigation[];
  timestamp: string;
  save_timestamp: string;
  navigation_count: number;
}

interface ElementInfo {
  id?: string;
  text?: string;
  className?: string;
}

interface NavigationTrackerOptions {
  enableApiUpload?: boolean;
  apiUploadOptions?: ApiUploaderOptions;
  verbose?: boolean;
}

// Add type definitions for test framework globals
declare global {
  namespace NodeJS {
    interface Global {
      currentTest?: { title: string };
      expect?: any;
      test?: any;
      jasmine?: {
        getEnv: () => {
          currentSpec?: {
            description: string;
          }
        }
      };
    }
  }
}

// Local type definitions for the imported ApiUploader
interface ApiUploaderOptions {
  apiEndpoint?: string;
  username?: string;
  accessKey?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  trackingType?: string;
  verbose?: boolean;
}

interface TrackingData {
  navigations: Navigation[];
}

export class NavigationTracker {
  private driver: any; // Appium driver instance
  private currentScreen: string = '';
  private navigations: Navigation[] = [];
  private testName: string = '';
  private specFile: string = '';
  private sessionId: string = '';
  private resultsDir: string;
  private isAndroid: boolean = false;
  private isIOS: boolean = false;
  private platformName: string = 'unknown';
  private lastCheckTime: number = 0;
  private minCheckInterval: number = 300; // Minimum ms between checks
  private options: NavigationTrackerOptions;
  private apiUploader?: any;
  
  // For tracking UI changes
  private lastPageSourceHash: string = '';
  
  // For tracking user interactions
  private lastAction: string = '';
  private actionScreenMap: Map<string, string> = new Map();
  
  // Known screen elements to detect
  private knownScreens: { [key: string]: string[] } = {
    'Home': ['color', 'Text', 'toast', 'notification', 'geoLocation', 'speedTest', 'webview'],
    'Color': ['colorSelection', 'Back'],
    'Text': ['textInput', 'Back'],
    'Toast': ['showToast', 'Back'],
    'Notification': ['showNotification', 'Back'],
    'Geolocation': ['gpsLocation', 'Back'],
    'SpeedTest': ['startTest', 'Back'],
    'WebView': ['url', 'find']
  };

  constructor(driver: any, options: NavigationTrackerOptions = {}) {
    this.driver = driver;
    this.options = options;
    this.resultsDir = path.join(process.cwd(), 'test-results');
    
    // Initialize API uploader if enabled
    if (this.options.enableApiUpload) {
      const uploaderOptions = this.options.apiUploadOptions || {};
      // Check for verbose mode in options
      if (options.verbose || uploaderOptions.verbose) {
        uploaderOptions.verbose = true;
      }
      this.apiUploader = ApiUploader.forAppium(uploaderOptions);
      logger.init('API upload enabled');
    }
    
    // Extract sessionId from driver
    this.extractSessionId();
    
            logger.verbose('Initializing NavigationTracker with driver');
        
        // Reset test-results directory
        this.resetResultsDirectory();
        
        // Detect platform immediately (synchronous check)
        this.detectPlatformSync();
        
        // Initialize action to screen mapping
        this.initializeActionScreenMap();
  }

  /**
   * Extract session ID from the driver instance
   */
  private extractSessionId() {
    try {
      // Try different ways to get the session ID based on the driver implementation
      if (this.driver.sessionId) {
        this.sessionId = this.driver.sessionId;
      } else if (this.driver.session && this.driver.session.id) {
        this.sessionId = this.driver.session.id;
      } else if (this.driver.caps && this.driver.caps.sessionId) {
        this.sessionId = this.driver.caps.sessionId;
      } else {
        // Generate a timestamp-based session ID as fallback
        this.sessionId = `session_${Date.now()}`;
      }
      
      logger.verbose(`Session ID: ${this.sessionId}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error extracting session ID: ${errorMsg}`);
      
      // Fallback to timestamp-based ID
      this.sessionId = `session_${Date.now()}`;
    }
  }

  private resetResultsDirectory() {
    // Remove test-results directory if it exists
    if (fs.existsSync(this.resultsDir)) {
      logger.cleanup('Resetting test-results directory');
      fs.rmSync(this.resultsDir, { recursive: true, force: true });
    }
    // Create fresh test-results directory
    fs.mkdirSync(this.resultsDir, { recursive: true });

    // Add initial navigation
    this.addNavigation('', 'App Start', 'test_start');
  }

  /**
   * Fast synchronous detection based on driver properties
   */
  private detectPlatformSync() {
    try {
      // Most drivers store platform info in capabilities or settings
      const capabilities = this.driver.capabilities || this.driver.caps || {};
      const automationName = capabilities.automationName || '';
      const platformName = capabilities.platformName || '';

      this.isAndroid = automationName.toLowerCase().includes('android') || 
                      platformName.toLowerCase() === 'android';
                      
      this.isIOS = automationName.toLowerCase().includes('ios') || 
                   automationName.toLowerCase().includes('xcuitest') ||
                   platformName.toLowerCase() === 'ios';
      
      this.platformName = this.isAndroid ? 'Android' : this.isIOS ? 'iOS' : 'Unknown';
      
      logger.verbose(`Platform detected: ${this.platformName}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error in platform detection: ${errorMsg}`);
    }
  }

  /**
   * Initialize a mapping of action elements to screen names
   * This helps us track navigation based on user interactions
   */
  private initializeActionScreenMap() {
    // Map element IDs to screens they lead to
    this.actionScreenMap.set('color', 'Color Screen');
    this.actionScreenMap.set('Text', 'Text Screen');
    this.actionScreenMap.set('toast', 'Toast Screen');
    this.actionScreenMap.set('notification', 'Notification Screen');
    this.actionScreenMap.set('geoLocation', 'Geolocation Screen');
    this.actionScreenMap.set('buttonPage', 'Home Screen');
    this.actionScreenMap.set('speedTest', 'Speed Test Screen');
    this.actionScreenMap.set('webview', 'WebView Screen');
    this.actionScreenMap.set('find', 'Browser Content Screen');
    this.actionScreenMap.set('Back', 'Home Screen');
    
    // Set initial screen
    this.currentScreen = 'Home Screen';
    logger.verbose('Action to screen mapping initialized');
  }

  /**
   * Get the current executing test file path
   * This attempts to find the spec file that's currently running by examining the call stack
   */
  private getCallingSpecFile(): string {
    try {
      // Get the call stack
      const stackTrace = new Error().stack || '';
      const stackLines = stackTrace.split('\n');
      
      // Look for a line that contains a test file path (typically contains "spec.js" or "test.js")
      for (const line of stackLines) {
        const match = line.match(/\((.+?)(spec|test)\.(js|ts):/i);
        if (match) {
          const fullPath = match[1] + match[2] + '.' + match[3];
          return path.basename(fullPath);
        }
      }

      // If we can't find a specific test file, try to get any file from the test directory
      for (const line of stackLines) {
        const match = line.match(/\((.+?)\/test(s)?\/(.+?)\.(js|ts):/i);
        if (match) {
          const fullPath = match[0].replace(/^\(|\)$/g, '').split(':')[0];
          return path.basename(fullPath);
        }
      }

      // Additional pattern for mocha/jasmine test files that might not have "test" or "spec" in the name
      for (const line of stackLines) {
        // Look for any JS/TS file in a test-related directory
        const match = line.match(/\((.+?)\/(tests?|specs?|e2e)\/(.+?)\.(js|ts):/i);
        if (match) {
          const fullPath = match[0].replace(/^\(|\)$/g, '').split(':')[0];
          return path.basename(fullPath);
        }
      }

      // Fallback: Return unknown if we couldn't determine
      return 'unknown_spec_file';
    } catch (error) {
      logger.error(`Error getting spec file name: ${error}`);
      return 'error_determining_spec_file';
    }
  }

  /**
   * Get the current executing test name
   * This attempts to find the test name that's currently running by examining global objects
   */
  private getTestName(): string {
    try {
      // Try to detect from global context
      // For Mocha
      if ((global as any).currentTest?.title) {
        return (global as any).currentTest.title;
      }
      
      // For Jest
      if ((global as any).expect && typeof (global as any).test === 'function') {
        // Try to get Jest's current test description if available
        if ((global as any).expect.getState && typeof (global as any).expect.getState === 'function') {
          const state = (global as any).expect.getState();
          if (state && state.currentTestName) {
            return state.currentTestName;
          }
        }
        return `test_${Date.now()}`;
      }

      // For Jasmine
      if ((global as any).jasmine) {
        const jasmineEnv = (global as any).jasmine.getEnv();
        const currentSpec = jasmineEnv.currentSpec;
        if (currentSpec && currentSpec.description) {
          return currentSpec.description;
        }
      }

      // For WebdriverIO
      if ((global as any).browser && (global as any).browser.config) {
        const config = (global as any).browser.config;
        if (config.currentTest) {
          return config.currentTest;
        }
      }

      // Try to extract from Error stack
      const stack = new Error().stack || '';
      const lines = stack.split('\n');
      
      // Look for lines that might contain test names from common test frameworks
      for (const line of lines) {
        // Look for "it" or "test" function calls which usually define test cases
        const match = line.match(/\s+(it|test)\s*\(\s*['"](.+?)['"]/i);
        if (match) {
          return match[2]; // Return the test description
        }
      }

      // Fallback: Generate a timestamp-based name
      return `test_${new Date().toISOString().replace(/[:.]/g, '_')}`;
    } catch (error) {
      logger.error(`Error getting test name: ${error}`);
      return `test_${Date.now()}`;
    }
  }

  /**
   * Simple hash function for string comparison
   */
  private hashString(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }

  /**
   * Record user action for screen tracking
   * This allows us to know what screen we're on based on the elements interacted with
   */
  public async recordUserAction(elementId: string) {
    this.lastAction = elementId;
    logger.verbose(`User action recorded: ${elementId}`);
    
    // Update current screen based on element interaction
    if (this.actionScreenMap.has(elementId)) {
      const newScreen = this.actionScreenMap.get(elementId) || '';
      if (newScreen && newScreen !== this.currentScreen) {
        await this.addNavigation(this.currentScreen, newScreen, 'user_interaction');
      }
    }
  }

  private async addNavigation(previousScreen: string, currentScreen: string, navigationType: string) {
    // Don't add if it's the same as the last one
    if (this.navigations.length > 0 && 
        this.navigations[this.navigations.length - 1].current_screen === currentScreen) {
      return;
    }
    
    // Get current test context
    const testName = this.getTestName();
    const specFile = this.getCallingSpecFile();
    
    const navigation: Navigation = {
      previous_screen: previousScreen,
      current_screen: currentScreen,
      timestamp: new Date().toISOString(),
      navigation_type: navigationType,
      spec_file: specFile,
      test_name: testName
    };
    
    this.navigations.push(navigation);
    this.currentScreen = currentScreen;
    
    // Only log navigation captures in non-verbose mode for essential info
    if (!logger.verboseMode) {
      logger.navigation(`${previousScreen} → ${currentScreen}`);
    } else {
      logger.verbose(`Navigation added: ${previousScreen} -> ${currentScreen} (${navigationType})`);
    }
  }

  public async trackNavigation() {
    try {
      // Skip frequent calls using throttling
      const now = Date.now();
      if (now - this.lastCheckTime < this.minCheckInterval) {
        logger.debug('Skipping navigation check (throttled)', true);
        return;
      }
      
      this.lastCheckTime = now;
      
      // Get current screen name using multiple approaches
      const currentScreen = await this.getCurrentScreenName();
      
      // Only record navigation if screen has changed
      if (currentScreen && currentScreen !== this.currentScreen) {
        await this.addNavigation(this.currentScreen, currentScreen, 'navigation_detected');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error tracking navigation: ${errorMsg}`);
    }
  }

  /**
   * Track navigation based on a page source analysis
   * Uses a hybrid of direct analysis and context inference
   */
  private async getCurrentScreenName(): Promise<string> {
    try {
      // If we've recently recorded a user action that led to a known screen, prefer that
      if (this.lastAction && this.actionScreenMap.has(this.lastAction)) {
        const inferredScreen = this.actionScreenMap.get(this.lastAction);
        if (inferredScreen) {
          // Reset lastAction to not repeat this inference next time
          this.lastAction = '';
          return inferredScreen;
        }
      }
      
      // Try to identify screen based on visible elements
      let pageSource = '';
      try {
        pageSource = await this.driver.getPageSource();
      } catch (e) {
        logger.debug('Could not get page source', true);
      }
      
      if (pageSource) {
        // Calculate hash to check if screen has changed
        const sourceHash = this.hashString(pageSource);
        
        // If page source hasn't changed, we're still on the same screen
        if (sourceHash === this.lastPageSourceHash) {
          return this.currentScreen;
        }
        
        this.lastPageSourceHash = sourceHash;
        
        // Identify screen by looking for known elements
        const detectedScreen = this.identifyScreenFromPageSource(pageSource);
        if (detectedScreen) {
          return detectedScreen;
        }
      }
      
      // Use current URL for WebViews
      try {
        if (pageSource && (pageSource.includes('WebView') || pageSource.includes('webview'))) {
          const url = await this.driver.getCurrentUrl();
          if (url && typeof url === 'string') {
            return `WebView: ${url.split('/').pop() || url}`;
          }
        }
      } catch (e) {
        logger.debug('Could not get current URL', true);
      }
      
      // If we've made it here, fallback to descriptive screen ID based on timestamp
      const now = new Date();
      const screenId = `Screen at ${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;
      return screenId;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error in getCurrentScreenName: ${errorMsg}`);
      return this.currentScreen || 'Unknown Screen';
    }
  }

  /**
   * Analyze page source to identify the current screen
   */
  private identifyScreenFromPageSource(pageSource: string): string | null {
    try {
      // Generic detection patterns for common screens
      if (pageSource.includes('id="color"') && 
          pageSource.includes('id="Text"') && 
          pageSource.includes('id="toast"')) {
        return 'Home Screen';
      }
      
      if (pageSource.includes('id="url"') && pageSource.includes('id="find"')) {
        return 'WebView Screen';
      }
      
      if (pageSource.includes('id="Back"')) {
        // This is a detail screen, try to identify which one
        if (pageSource.includes('id="colorSelection"')) {
          return 'Color Screen';
        }
        if (pageSource.includes('id="textInput"')) {
          return 'Text Screen';
        }
        if (pageSource.includes('id="showToast"')) {
          return 'Toast Screen';
        }
        if (pageSource.includes('id="showNotification"')) {
          return 'Notification Screen';
        }
        if (pageSource.includes('id="gpsLocation"')) {
          return 'Geolocation Screen';
        }
        if (pageSource.includes('id="startTest"')) {
          return 'Speed Test Screen';
        }
      }
      
      // Look for specific text content
      if (pageSource.includes('>Color<') || pageSource.includes('"Color"')) {
        return 'Color Screen';
      }
      
      if (pageSource.includes('>Geolocation<') || pageSource.includes('"Geolocation"')) {
        return 'Geolocation Screen';
      }
      
      if (pageSource.includes('>Speed Test<') || pageSource.includes('"Speed Test"')) {
        return 'Speed Test Screen';
      }
      
      // Try to infer from URL display in webview
      if (pageSource.includes('www.lambdatest.com')) {
        return 'LambdaTest Website';
      }
      
      return null;
    } catch (error) {
      logger.debug('Error identifying screen from page source', true);
      return null;
    }
  }

  /**
   * Hook to inject into a click method to track navigation
   * @param elementId The element ID being clicked
   */
  public async beforeClick(elementId: string) {
    if (elementId && this.actionScreenMap.has(elementId)) {
      this.lastAction = elementId;
    }
  }

  /**
   * Hook to inject after a click to check for navigation changes
   */
  public async afterClick() {
    // Add a small delay to wait for navigation
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Track screen after clicking
    await this.trackNavigation();
  }

  public async saveResults() {
    try {
      logger.verbose('Saving navigation results...');
      logger.verbose(`Total navigation events: ${this.navigations.length}`);
      
      // Dynamically get test name and spec file if they weren't provided
      const testName = this.getTestName();
      const specFile = this.getCallingSpecFile();
      
      const result: TestResult = {
        spec_file: specFile,
        test_name: testName,
        session_id: this.sessionId,
        navigations: this.navigations,
        timestamp: new Date().toISOString(),
        save_timestamp: new Date().toISOString(),
        navigation_count: this.navigations.length
      };

      // Ensure directory exists
      if (!fs.existsSync(this.resultsDir)) {
        fs.mkdirSync(this.resultsDir, { recursive: true });
      }

      const filePath = path.join(this.resultsDir, 'navigation-tracking.json');
      logger.verbose(`Saving results to: ${filePath}`);
      logger.verbose(`Test: ${testName}, Spec: ${specFile}`);
      
      fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
      logger.export('Results saved successfully');

              // Upload to API if enabled
        if (this.apiUploader && this.navigations.length > 0) {
          try {
            logger.verbose('Attempting to upload navigation data to LambdaTest API...');
            
            // Prepare tracking data for API
            const trackingData: TrackingData = {
              navigations: this.navigations
            };
            
            // Validate data before upload
            if (ApiUploader.validateTrackingData(trackingData, 'mobile-navigation-tracker')) {
              const testId = ApiUploader.extractTestId({ session_id: this.sessionId }, { testName });
              await this.apiUploader.uploadTrackingResults(trackingData, testId, { 
                trackingType: 'mobile-navigation-tracker',
                framework: 'Appium'
              });
              logger.apiUpload('Upload completed successfully');
            } else {
              logger.warn('Skipping API upload due to invalid tracking data');
            }
          } catch (uploadError) {
            const errorMsg = uploadError instanceof Error ? uploadError.message : String(uploadError);
            logger.error(`API upload failed: ${errorMsg}`);
            // Don't throw here, as local save was successful
          }
        }

              // Generate HTML report
        if (this.navigations.length > 0) {
          try {
            logger.verbose('Generating HTML report...');
            
            const htmlReporter = new HtmlReporter({
              outputDir: this.resultsDir,
              title: 'LambdaTest Appium Navigation Report',
              theme: 'dark',
              enableKeyboardShortcut: false // Disable in test environment
            });
            
            const htmlReportPath = htmlReporter.generateReport(result, 'appium');
            logger.success(`HTML report generated: ${htmlReportPath}`);
            
            // Show keyboard shortcut info only in verbose mode
            if (logger.verboseMode) {
              logger.info('📊 HTML Report Available!');
              logger.info(`   File: ${htmlReportPath}`);
              logger.info('   Command: npx lt-report --open');
              logger.info('   Or manually open the HTML file in your browser');
            }
            
          } catch (htmlError) {
            const errorMsg = htmlError instanceof Error ? htmlError.message : String(htmlError);
            logger.warn(`Failed to generate HTML report: ${errorMsg}`);
            // Don't throw here, as JSON save was successful
          }
        }
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error in saveResults: ${errorMsg}`);
      
      // Try one more time with a simpler approach
      try {
        // Dynamically get spec file if it wasn't provided
        const specFile = this.getCallingSpecFile();
        
        const simpleResult = {
          spec_file: specFile,
          navigations: this.navigations,
          timestamp: new Date().toISOString()
        };
        
        if (!fs.existsSync(this.resultsDir)) {
          fs.mkdirSync(this.resultsDir, { recursive: true });
        }
        
        fs.writeFileSync(
          path.join(this.resultsDir, 'navigation-tracking-backup.json'), 
          JSON.stringify(simpleResult, null, 2)
        );
        logger.success('Backup results saved successfully');
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        logger.error(`Failed to save backup results: ${errorMsg}`);
      }
    }
  }
} 
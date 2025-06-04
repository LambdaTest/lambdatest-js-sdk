/**
 * Basic usage example for LambdaTest Appium Navigation Tracker
 * with integrated logger and API uploader
 */

const { NavigationTracker, logger } = require('../dist/index.js');

async function basicExample() {
  // Mock driver for demonstration (replace with your actual Appium driver)
  const mockDriver = {
    sessionId: 'demo-session-123',
    capabilities: {
      platformName: 'Android',
      automationName: 'UiAutomator2'
    },
    getPageSource: async () => {
      return '<android.widget.LinearLayout id="main"><android.widget.Button id="color">Color</android.widget.Button></android.widget.LinearLayout>';
    },
    getCurrentUrl: async () => {
      return 'https://example.com';
    }
  };

  logger.info('Starting basic navigation tracking example');

  // Initialize tracker with API upload enabled
  const tracker = new NavigationTracker(mockDriver, {
    enableApiUpload: true,
    apiUploadOptions: {
      // Credentials can be provided here or via environment variables
      // username: 'your-username',
      // accessKey: 'your-access-key',
      timeout: 10000,
      retryAttempts: 2
    }
  });

  logger.info('NavigationTracker initialized');

  try {
    // Simulate some user interactions and navigation tracking
    logger.navigation('Simulating user interactions...');

    // Record user action
    await tracker.recordUserAction('color');
    
    // Track navigation changes
    await tracker.trackNavigation();
    
    // Simulate clicking on an element
    await tracker.beforeClick('submitButton');
    // ... in real scenario, you would perform the actual click here
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate delay
    await tracker.afterClick();
    
    // Track more navigation
    await tracker.trackNavigation();
    
    logger.success('Navigation tracking completed');
    
    // Save results (will also upload to API if configured)
    await tracker.saveResults();
    
    logger.success('Example completed successfully!');
    
  } catch (error) {
    logger.error(`Example failed: ${error.message}`);
  }
}

// Run the example
if (require.main === module) {
  basicExample().catch(console.error);
}

module.exports = { basicExample }; 
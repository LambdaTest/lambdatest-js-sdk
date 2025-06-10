/**
 * WebDriverIO usage example for LambdaTest Appium Navigation Tracker
 */

const { createWebDriverIOTracker, logger } = require('../dist/index.js');

async function webdriverIOExample() {
  // Mock WebDriverIO browser object for demonstration
  const mockBrowser = {
    sessionId: 'wdio-session-123',
    capabilities: {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'lt:options': {
        name: 'WebDriverIO Navigation Test',
        build: 'WebDriverIO Build'
      }
    },
    getPageSource: async () => {
      return '<android.widget.LinearLayout><android.widget.Button id="loginButton">Login</android.widget.Button></android.widget.LinearLayout>';
    },
    getUrl: async () => {
      return 'https://example.com/mobile-app';
    },
    $: (selector) => ({
      click: async () => console.log(`Clicked element: ${selector}`),
      setValue: async (value) => console.log(`Set value ${value} on element: ${selector}`)
    })
  };

  logger.info('Starting WebDriverIO navigation tracking example');

  try {
    // Create WebDriverIO-specific tracker
    const tracker = createWebDriverIOTracker(mockBrowser, {
      enableApiUpload: true,
      apiUploadOptions: {
        timeout: 10000,
        retryAttempts: 2
      }
    });

    logger.info('WebDriverIO NavigationTracker initialized');

    // Set current test context
    tracker.setCurrentTest('Login Flow Test');

    // Use WebDriverIO-specific convenience methods
    await tracker.clickAndTrack('~loginButton', 'Login Button');
    
    await tracker.setValueAndTrack('~usernameInput', 'testuser@example.com', 'Username Input');
    
    await tracker.setValueAndTrack('~passwordInput', 'password123', 'Password Input');
    
    await tracker.clickAndTrack('~submitButton', 'Submit Button');

    // Regular navigation tracking
    await tracker.trackNavigation();

    // Get WebDriverIO session info
    const sessionInfo = tracker.getWebDriverIOSessionInfo();
    logger.info(`Session Info: ${JSON.stringify(sessionInfo, null, 2)}`);

    // Save results
    await tracker.saveResults();

    logger.success('WebDriverIO example completed successfully!');

  } catch (error) {
    logger.error(`WebDriverIO example failed: ${error.message}`);
  }
}

// Alternative usage with standard NavigationTracker
async function standardExample() {
  const { NavigationTracker } = require('../dist/index.js');
  
  // Mock browser with WebDriverIO URL method compatibility
  const mockBrowser = {
    sessionId: 'wdio-session-456',
    capabilities: {
      platformName: 'iOS',
      'appium:automationName': 'XCUITest'
    },
    getPageSource: async () => '<iOS XML>',
    // WebDriverIO uses getUrl() instead of getCurrentUrl()
    getUrl: async () => 'https://example.com/ios-app'
  };

  logger.info('Testing standard NavigationTracker with WebDriverIO browser');

  try {
    // This should work with the compatibility fixes we added
    const tracker = new NavigationTracker(mockBrowser);
    await tracker.trackNavigation();
    await tracker.saveResults();
    
    logger.success('Standard NavigationTracker works with WebDriverIO!');
  } catch (error) {
    logger.error(`Standard NavigationTracker failed: ${error.message}`);
  }
}

// Run both examples
if (require.main === module) {
  webdriverIOExample()
    .then(() => standardExample())
    .catch(console.error);
}

module.exports = { webdriverIOExample, standardExample }; 
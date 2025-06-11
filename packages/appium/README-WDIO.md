# LambdaTest Navigation Tracker for WebdriverIO Mobile Testing

This guide shows how to integrate the LambdaTest Navigation Tracker with WebdriverIO for mobile app testing on Android and iOS devices.

## Features

- **Seamless WDIO Integration**: Works with WebdriverIO v7+ and v8+
- **Mobile-First Design**: Optimized for Android and iOS mobile applications
- **Real-time Navigation Tracking**: Automatically track screen transitions and user interactions
- **LambdaTest Cloud Integration**: Upload navigation data directly to LambdaTest Insights
- **Framework Agnostic**: Works with Mocha, Jasmine, and Cucumber test frameworks
- **Visual Reports**: Generate beautiful HTML reports with navigation flow visualization

## Installation

```bash
npm install @lambdatest/appium-navigation-tracker --save-dev
```

## WebDriverIO-Specific Features

This package now includes a WebDriverIO-specific wrapper that handles WebDriverIO's unique method signatures and provides enhanced convenience methods:

- **Automatic Method Translation**: Translates WebDriverIO's `getUrl()` to Appium's `getCurrentUrl()`
- **Enhanced Element Detection**: Supports WebDriverIO selector formats (`~`, `#`, attribute selectors)
- **Convenience Methods**: `clickAndTrack()` and `setValueAndTrack()` for common operations
- **Session Management**: Better session ID and capabilities detection for WebDriverIO

## Quick Start

### 1. Basic WDIO Configuration

First, update your `wdio.conf.js` to include the navigation tracker:

```javascript
// wdio.conf.js
const { createWebDriverIOTracker } = require('@lambdatest/appium-navigation-tracker');
// Alternative: const { NavigationTracker } = require('@lambdatest/appium-navigation-tracker');

exports.config = {
    // ... your existing config
    
    // LambdaTest Hub configuration
    hostname: 'mobile-hub.lambdatest.com',
    port: 80,
    path: '/wd/hub',
    
    capabilities: [{
        platformName: 'Android',
        'appium:platformVersion': '12',
        'appium:deviceName': 'Galaxy S21',
        'appium:app': 'lt://APP_ID', // Your LambdaTest app ID
        'appium:automationName': 'UiAutomator2',
        'appium:newCommandTimeout': 300,
        
        // LambdaTest specific capabilities
        'lt:options': {
            username: process.env.LT_USERNAME,
            accessKey: process.env.LT_ACCESS_KEY,
            build: 'Navigation Tracking Build',
            name: 'Mobile Navigation Test',
            platformName: 'Android'
        }
    }],

    // Global setup for navigation tracker
    onPrepare: function (config, capabilities) {
        global.navigationTrackers = new Map();
    },

    beforeSession: function (config, capabilities, specs) {
        // This will be called before each session starts
    },

    before: function (capabilities, specs) {
        // Create WebDriverIO-specific navigation tracker for this session
        const tracker = createWebDriverIOTracker(browser, {
            enableApiUpload: true,
            apiUploadOptions: {
                username: process.env.LT_USERNAME,
                accessKey: process.env.LT_ACCESS_KEY,
                timeout: 30000
            }
        });
        
        global.navigationTrackers.set(browser.sessionId, tracker);
        global.currentTracker = tracker;
    },

    afterTest: function (test, context, { error, result, duration, passed, retries }) {
        // Track navigation after each test
        if (global.currentTracker) {
            global.currentTracker.trackNavigation();
        }
    },

    after: function (result, capabilities, specs) {
        // Save results after session
        if (global.currentTracker) {
            return global.currentTracker.saveResults();
        }
    }
};
```

### 2. Enhanced WebDriverIO Test Implementation

Using the WebDriverIO-specific tracker with convenience methods:

```javascript
// test/specs/navigation-enhanced.test.js
describe('Mobile App Navigation (Enhanced)', () => {
    
    beforeEach(async () => {
        // Set current test context for better tracking
        if (global.currentTracker) {
            global.currentTracker.setCurrentTest('Enhanced Navigation Test');
            await global.currentTracker.trackNavigation();
        }
    });

    it('should use enhanced WebDriverIO tracking methods', async () => {
        // Wait for app to load
        await browser.pause(3000);
        
        // Use convenience methods that automatically track actions
        await global.currentTracker.clickAndTrack('~loginButton', 'Login Button');
        
        // Set values with automatic tracking
        await global.currentTracker.setValueAndTrack('~usernameInput', 'test@example.com', 'Username');
        await global.currentTracker.setValueAndTrack('~passwordInput', 'password123', 'Password');
        
        // Submit and track
        await global.currentTracker.clickAndTrack('~submitButton', 'Submit Button');
        
        // Get session information
        const sessionInfo = global.currentTracker.getWebDriverIOSessionInfo();
        console.log('Session Info:', sessionInfo);
        
        // Verify navigation
        const welcomeScreen = await $('~welcomeScreen');
        await expect(welcomeScreen).toBeDisplayed();
    });
});
```

### 3. Standard Test Implementation

```javascript
// test/specs/navigation.test.js
describe('Mobile App Navigation', () => {
    
    beforeEach(async () => {
        // Track navigation before each test
        if (global.currentTracker) {
            await global.currentTracker.trackNavigation();
        }
    });

    it('should navigate through app screens', async () => {
        // Wait for app to load
        await browser.pause(3000);
        
        // Find login button and track the interaction
        const loginButton = await $('~loginButton');
        
        // Record the user action before clicking
        if (global.currentTracker) {
            await global.currentTracker.recordUserAction('loginButton');
            await global.currentTracker.beforeClick('loginButton');
        }
        
        await loginButton.click();
        
        // Track navigation after click
        if (global.currentTracker) {
            await global.currentTracker.afterClick();
        }
        
        // Continue with your test logic...
        const welcomeScreen = await $('~welcomeScreen');
        await expect(welcomeScreen).toBeDisplayed();
    });

    it('should track form interactions', async () => {
        // Navigate to form screen
        const formButton = await $('~formButton');
        
        if (global.currentTracker) {
            await global.currentTracker.recordUserAction('formButton');
            await global.currentTracker.beforeClick('formButton');
        }
        
        await formButton.click();
        
        if (global.currentTracker) {
            await global.currentTracker.afterClick();
        }
        
        // Fill form and track interactions
        const emailInput = await $('~emailInput');
        await emailInput.setValue('test@example.com');
        
        if (global.currentTracker) {
            await global.currentTracker.recordUserAction('emailInput');
        }
        
        // Submit form
        const submitButton = await $('~submitButton');
        
        if (global.currentTracker) {
            await global.currentTracker.beforeClick('submitButton');
        }
        
        await submitButton.click();
        
        if (global.currentTracker) {
            await global.currentTracker.afterClick();
        }
    });
});
```

## Advanced Configuration

### Multi-Device Testing

```javascript
// wdio.conf.js for parallel mobile testing
exports.config = {
    capabilities: [
        {
            // Android configuration
            platformName: 'Android',
            'appium:platformVersion': '12',
            'appium:deviceName': 'Galaxy S21',
            'appium:app': 'lt://APP_ID',
            'lt:options': {
                username: process.env.LT_USERNAME,
                accessKey: process.env.LT_ACCESS_KEY,
                build: 'Android Navigation Test',
                name: 'Android Navigation Flow'
            }
        },
        {
            // iOS configuration
            platformName: 'iOS',
            'appium:platformVersion': '15.0',
            'appium:deviceName': 'iPhone 13',
            'appium:app': 'lt://APP_ID',
            'appium:automationName': 'XCUITest',
            'lt:options': {
                username: process.env.LT_USERNAME,
                accessKey: process.env.LT_ACCESS_KEY,
                build: 'iOS Navigation Test',
                name: 'iOS Navigation Flow'
            }
        }
    ],

    before: function (capabilities, specs) {
        const platform = capabilities.platformName;
        const deviceName = capabilities['appium:deviceName'] || capabilities.deviceName;
        
        const tracker = new NavigationTracker(browser, {
            enableApiUpload: true,
            apiUploadOptions: {
                username: process.env.LT_USERNAME,
                accessKey: process.env.LT_ACCESS_KEY,
                timeout: 30000
            }
        });
        
        // Store tracker with platform-specific key
        const trackerId = `${platform}_${deviceName}_${browser.sessionId}`;
        global.navigationTrackers.set(trackerId, tracker);
        global.currentTracker = tracker;
        
        console.log(`Navigation tracker initialized for ${platform} ${deviceName}`);
    }
};
```

### Custom Screen Detection

```javascript
// utils/customTracker.js
const { NavigationTracker } = require('@lambdatest/appium-navigation-tracker');

class CustomMobileTracker extends NavigationTracker {
    constructor(driver, options) {
        super(driver, options);
        
        // Define your app-specific screen patterns
        this.customScreenPatterns = {
            'LoginScreen': ['id=loginButton', 'id=passwordInput', 'text=Sign In'],
            'HomeScreen': ['id=homeTab', 'id=profileTab', 'text=Welcome'],
            'ProfileScreen': ['id=editProfile', 'id=logout', 'text=Profile'],
            'SettingsScreen': ['id=notifications', 'id=privacy', 'text=Settings']
        };
    }
    
    async detectCustomScreen() {
        const pageSource = await this.driver.getPageSource();
        
        for (const [screenName, patterns] of Object.entries(this.customScreenPatterns)) {
            const matchedPatterns = patterns.filter(pattern => {
                if (pattern.startsWith('id=')) {
                    return pageSource.includes(`id="${pattern.substring(3)}"`);
                } else if (pattern.startsWith('text=')) {
                    return pageSource.includes(pattern.substring(5));
                }
                return false;
            });
            
            // If 2 or more patterns match, consider it this screen
            if (matchedPatterns.length >= 2) {
                return screenName;
            }
        }
        
        return null;
    }
}

module.exports = { CustomMobileTracker };
```

### Page Object Model Integration

```javascript
// pageobjects/base.page.js
const { logger } = require('@lambdatest/appium-navigation-tracker');

class BasePage {
    constructor() {
        this.tracker = global.currentTracker;
    }
    
    async clickElement(selector, elementName) {
        const element = await $(selector);
        
        if (this.tracker) {
            await this.tracker.recordUserAction(elementName);
            await this.tracker.beforeClick(elementName);
        }
        
        await element.click();
        
        if (this.tracker) {
            await this.tracker.afterClick();
        }
        
        logger.navigation(`Clicked ${elementName}`);
    }
    
    async navigateAndTrack(selector, elementName, expectedScreen) {
        await this.clickElement(selector, elementName);
        
        // Wait for navigation to complete
        await browser.pause(1000);
        
        if (this.tracker) {
            await this.tracker.trackNavigation();
        }
        
        logger.success(`Navigated to ${expectedScreen}`);
    }
}

module.exports = BasePage;
```

```javascript
// pageobjects/login.page.js
const BasePage = require('./base.page');

class LoginPage extends BasePage {
    get loginButton() { return $('~loginButton'); }
    get usernameInput() { return $('~usernameInput'); }
    get passwordInput() { return $('~passwordInput'); }
    
    async login(username, password) {
        await this.usernameInput.setValue(username);
        
        if (this.tracker) {
            await this.tracker.recordUserAction('usernameInput');
        }
        
        await this.passwordInput.setValue(password);
        
        if (this.tracker) {
            await this.tracker.recordUserAction('passwordInput');
        }
        
        await this.navigateAndTrack('~loginButton', 'loginButton', 'HomeScreen');
    }
}

module.exports = new LoginPage();
```

## Environment Configuration

Create a `.env` file in your project root:

```bash
# LambdaTest Credentials
LT_USERNAME=your_lambdatest_username
LT_ACCESS_KEY=your_lambdatest_access_key

# Debug Configuration
DEBUG_URL_TRACKER=true

# App Configuration
ANDROID_APP_ID=lt://your_android_app_id
IOS_APP_ID=lt://your_ios_app_id
```

## Running Tests

```bash
# Run all mobile tests with navigation tracking
npm run wdio

# Run specific test suite
npx wdio run wdio.conf.js --spec=test/specs/navigation.test.js

# Run tests with debug output
DEBUG_URL_TRACKER=true npx wdio run wdio.conf.js

# Generate and open HTML report
npx lt-report --open
```

## Best Practices

### 1. Strategic Tracking Points

```javascript
describe('E-commerce App Flow', () => {
    it('should track complete purchase journey', async () => {
        // Track major navigation points
        const checkpoints = [
            { element: '~categoryButton', name: 'categoryButton', screen: 'CategoryScreen' },
            { element: '~productButton', name: 'productButton', screen: 'ProductScreen' },
            { element: '~addToCartButton', name: 'addToCartButton', screen: 'CartScreen' },
            { element: '~checkoutButton', name: 'checkoutButton', screen: 'CheckoutScreen' }
        ];
        
        for (const checkpoint of checkpoints) {
            const element = await $(checkpoint.element);
            
            if (global.currentTracker) {
                await global.currentTracker.recordUserAction(checkpoint.name);
                await global.currentTracker.beforeClick(checkpoint.name);
            }
            
            await element.click();
            
            if (global.currentTracker) {
                await global.currentTracker.afterClick();
            }
            
            // Wait for navigation and verify screen
            await browser.pause(2000);
            
            if (global.currentTracker) {
                await global.currentTracker.trackNavigation();
            }
            
            console.log(`Successfully navigated to ${checkpoint.screen}`);
        }
    });
});
```

### 2. Error Handling

```javascript
// utils/trackerWrapper.js
class TrackerWrapper {
    constructor(tracker) {
        this.tracker = tracker;
    }
    
    async safeTrackNavigation() {
        try {
            if (this.tracker) {
                await this.tracker.trackNavigation();
            }
        } catch (error) {
            console.warn('Navigation tracking failed:', error.message);
        }
    }
    
    async safeRecordAction(elementId) {
        try {
            if (this.tracker) {
                await this.tracker.recordUserAction(elementId);
            }
        } catch (error) {
            console.warn('Action recording failed:', error.message);
        }
    }
}

module.exports = TrackerWrapper;
```

### 3. Custom Hooks

```javascript
// wdio.conf.js - Advanced hooks
exports.config = {
    // ... other config
    
    beforeSuite: function (suite) {
        console.log(`Starting test suite: ${suite.title}`);
        if (global.currentTracker) {
            global.currentTracker.recordUserAction(`suite_start_${suite.title}`);
        }
    },
    
    beforeTest: function (test, context) {
        console.log(`Starting test: ${test.title}`);
        if (global.currentTracker) {
            global.currentTracker.recordUserAction(`test_start_${test.title}`);
        }
    },
    
    afterTest: function (test, context, { error, result, duration, passed }) {
        console.log(`Test ${test.title} ${passed ? 'passed' : 'failed'}`);
        
        if (global.currentTracker) {
            global.currentTracker.recordUserAction(`test_end_${test.title}_${passed ? 'passed' : 'failed'}`);
            global.currentTracker.trackNavigation();
        }
    },
    
    onComplete: function (exitCode, config, capabilities, results) {
        console.log('All tests completed');
        
        // Generate summary report
        if (global.navigationTrackers && global.navigationTrackers.size > 0) {
            console.log(`Generated navigation reports for ${global.navigationTrackers.size} sessions`);
        }
    }
};
```

## Troubleshooting

### Common Issues

1. **Tracker not initialized**
   ```javascript
   // Add null checks
   if (global.currentTracker) {
       await global.currentTracker.trackNavigation();
   }
   ```

2. **Session ID conflicts in parallel execution**
   ```javascript
   // Use unique keys for each session
   const trackerId = `${capabilities.platformName}_${browser.sessionId}`;
   global.navigationTrackers.set(trackerId, tracker);
   ```

3. **API upload failures**
   ```bash
   # Check credentials
   echo $LT_USERNAME
   echo $LT_ACCESS_KEY
   
   # Enable debug logging
   DEBUG_URL_TRACKER=true npx wdio
   ```

### Debug Mode

Enable detailed logging:

```javascript
// wdio.conf.js
const { logger } = require('@lambdatest/appium-navigation-tracker');

exports.config = {
    // ... config
    
    before: function (capabilities, specs) {
        // Enable debug mode
        process.env.DEBUG_URL_TRACKER = 'true';
        
        logger.info('Debug mode enabled for navigation tracking');
        
        const tracker = new NavigationTracker(browser, {
            enableApiUpload: true,
            apiUploadOptions: {
                username: process.env.LT_USERNAME,
                accessKey: process.env.LT_ACCESS_KEY,
                timeout: 30000,
                retryAttempts: 3
            }
        });
        
        global.currentTracker = tracker;
    }
};
```

## Reports and Analytics

The navigation tracker generates comprehensive reports:

### Local Reports

- **JSON Report**: `test-results/navigation-tracking.json`
- **HTML Report**: `test-results/tracking-report.html`

### LambdaTest Cloud Reports

Navigation data is automatically uploaded to LambdaTest Insights where you can:

- View navigation flows in timeline format
- Analyze user interaction patterns
- Compare navigation paths across different test runs
- Export data for further analysis

### CLI Commands

```bash
# Generate HTML report
npx lt-report

# Open report in browser
npx lt-report --open

# Generate with specific theme
npx lt-report --theme light

# Watch for changes
npx lt-report --watch
```

## Example Project Structure

```
mobile-automation/
├── test/
│   ├── specs/
│   │   ├── login.test.js
│   │   ├── navigation.test.js
│   │   └── checkout.test.js
│   └── pageobjects/
│       ├── base.page.js
│       ├── login.page.js
│       └── home.page.js
├── utils/
│   ├── trackerWrapper.js
│   └── customTracker.js
├── test-results/
│   ├── navigation-tracking.json
│   └── tracking-report.html
├── wdio.conf.js
├── package.json
└── .env
```

## Support

For issues and questions:

- **Documentation**: [LambdaTest Docs](https://www.lambdatest.com/support/docs/)
- **Community**: [LambdaTest Community](https://community.lambdatest.com/)
- **Support**: [Contact Support](https://www.lambdatest.com/support/)

## License

MIT License - see LICENSE file for details. 
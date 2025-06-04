# LambdaTest JavaScript SDK

The LambdaTest JavaScript SDK is a comprehensive collection of packages that enable you to integrate LambdaTest's testing capabilities with your testing frameworks. This SDK provides two main functionalities:

1. **SmartUI** - Visual regression testing through snapshot capture
2. **LT Insights Navigation Insights** - URL tracking and navigation monitoring with automatic API upload

## Available Packages

This monorepo contains SDKs for the following testing frameworks:

- **Playwright** - `@lambdatest/playwright-driver`
- **Cypress** - `@lambdatest/cypress-driver` 
- **Selenium** - `@lambdatest/selenium-driver`
- **Puppeteer** - `@lambdatest/puppeteer-driver`
- **WebdriverIO** - `@lambdatest/wdio-driver`
- **TestCafe** - `@lambdatest/testcafe-driver`
- **Appium** - `appium-navigation-tracker` (Navigation tracking for mobile apps)

## Prerequisites

- Node.js (v12 or higher)
- LambdaTest account with SmartUI and LT Insights access
- Respective testing framework installed (Playwright, Cypress, etc.)

## Global Configuration

Before using any SDK, set up your LambdaTest credentials as environment variables:

```bash
export LT_USERNAME="your_username"
export LT_ACCESS_KEY="your_access_key"
```

For SmartUI functionality, start the Smart UI server:

```bash
npx smartui start
```

For LT Insights Navigation Insights, the URL tracking works automatically with API upload - no additional server setup required.

---

## Playwright SDK

### Installation

```bash
npm install @lambdatest/playwright-driver
```

### SmartUI Usage

```javascript
const { smartuiSnapshot } = require('@lambdatest/playwright-driver');

test('should capture homepage snapshot', async ({ page }) => {
  await page.goto('https://your-app.com');
  await smartuiSnapshot(page, 'homepage');
});
```

### LT Insights Navigation Insights (URL Tracking)

```javascript
const { test } = require('@playwright/test');
const { createUrlTrackerFixture } = require('@lambdatest/playwright-driver');

// Create the URL tracker fixture with automatic API upload
const urlTrackerFixture = createUrlTrackerFixture({
  enabled: true,
  trackHashChanges: true,
  preserveHistory: true,
  enableApiUpload: true  // Automatically uploads to LT Insights
});

// Use the fixture in your tests
test.use(urlTrackerFixture);

test('should track navigation insights', async ({ page }) => {
  // Navigate normally - tracking happens automatically
  await page.goto('https://your-app.com');
  await page.goto('https://your-app.com/about');
  await page.goto('https://your-app.com/contact');
  
  // All navigation data is automatically captured and uploaded to LT Insights
});
```

---

## Cypress SDK

### Installation

```bash
npm install @lambdatest/cypress-driver
```

### SmartUI Usage

The Cypress SDK automatically adds the `smartuiSnapshot` command:

```javascript
describe('Visual Testing', () => {
  it('should capture homepage snapshot', () => {
    cy.visit('https://your-app.com');
    cy.smartuiSnapshot('homepage');
  });
});
```

### LT Insights Navigation Insights

Cypress navigation tracking is built into the SmartUI functionality and automatically captures navigation data during test execution.

---

## Selenium SDK

### Installation

```bash
npm install @lambdatest/selenium-driver
```

### SmartUI Usage

```javascript
const { smartuiSnapshot } = require('@lambdatest/selenium-driver');
const { Builder } = require('selenium-webdriver');

async function test() {
  let driver = await new Builder().forBrowser('chrome').build();
  
  try {
    await driver.get('https://your-app.com');
    await smartuiSnapshot(driver, 'homepage');
  } finally {
    await driver.quit();
  }
}
```

---

## Puppeteer SDK

### Installation

```bash
npm install @lambdatest/puppeteer-driver
```

### SmartUI Usage

```javascript
const { smartuiSnapshot } = require('@lambdatest/puppeteer-driver');
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.goto('https://your-app.com');
  await smartuiSnapshot(page, 'homepage');
  
  await browser.close();
})();
```

---

## WebdriverIO SDK

### Installation

```bash
npm install @lambdatest/wdio-driver
```

### SmartUI Usage

```javascript
const { smartuiSnapshot } = require('@lambdatest/wdio-driver');

describe('Visual Testing', () => {
  it('should capture homepage snapshot', async () => {
    await browser.url('https://your-app.com');
    await smartuiSnapshot(browser, 'homepage');
  });
});
```

### LT Insights Navigation Insights (URL Tracking)

```javascript
const { UrlTracker, UrlTrackerService, enhanceConfigWithUrlTracking } = require('@lambdatest/wdio-driver');

// Method 1: Using the service (recommended)
exports.config = {
  services: [
    ['@lambdatest/wdio-driver/src/url-tracker-service', {
      enableApiUpload: true,
      outputDirectory: 'test-results'
    }]
  ],
  // other configuration
};

// Method 2: Enhance existing config
exports.config = enhanceConfigWithUrlTracking({
  // your existing WebdriverIO configuration
  services: [...],
  capabilities: [...],
  // URL tracking will be automatically added
});

// Method 3: Manual usage
describe('Navigation Testing', () => {
  let urlTracker;
  
  before(async () => {
    urlTracker = new UrlTracker(browser, {
      enableApiUpload: true,
      trackHistory: true
    });
    await urlTracker.init();
  });
  
  it('should track navigation', async () => {
    await browser.url('https://your-app.com');
    await browser.url('https://your-app.com/about');
    // Navigation is automatically tracked
  });
  
  after(async () => {
    await urlTracker.cleanup(); // Uploads to LT Insights API
  });
});
```

---

## TestCafe SDK

### Installation

```bash
npm install @lambdatest/testcafe-driver
```

### SmartUI Usage

```javascript
const { smartuiSnapshot } = require('@lambdatest/testcafe-driver');

test('Homepage visual test', async t => {
  await t.navigateTo('https://your-app.com');
  await smartuiSnapshot(t, 'homepage');
});
```

---

## Appium SDK (Navigation Tracker)

### Installation

```bash
npm install appium-navigation-tracker
```

### LT Insights Navigation Tracking

The Appium SDK focuses on navigation tracking for mobile applications with comprehensive API upload:

```javascript
const { NavigationTracker, logger } = require('appium-navigation-tracker');

async function mobileTest() {
  // Your Appium driver setup
  const driver = await new Builder()
    .forBrowser('')
    .withCapabilities(capabilities)
    .build();

  // Initialize tracker with LT Insights API upload
  const tracker = new NavigationTracker(driver, {
    enableApiUpload: true,
    apiUploadOptions: {
      timeout: 10000,
      retryAttempts: 2
    }
  });

  // Record user actions and track navigation
  await tracker.recordUserAction('button-id');
  await tracker.trackNavigation();
  
  // Save results and upload to LT Insights
  await tracker.saveResults();
}
```

---

## LT Insights Navigation Insights Features

The URL tracking functionality across frameworks provides:

### Automatic Navigation Monitoring
- **Page navigations** (goto, back, forward, reload)
- **SPA route changes** (pushState, replaceState)
- **Hash changes** (#fragment changes)
- **Link clicks** and form submissions
- **Redirect tracking**

### Data Captured
- Previous and current URLs
- Navigation types and timestamps
- Test context (spec file, test name)
- Session information

### API Upload
- Automatic upload to LT Insights API
- Retry mechanism with exponential backoff
- Comprehensive error reporting
- Session-based data organization

### Reporting
- JSON reports for local analysis
- HTML reports with interactive visualization
- API upload status reports
- Navigation timeline analysis

---

## Advanced SmartUI Configuration Options

All SmartUI SDKs (except Appium) support the same advanced configuration options:

### Element Selection Options

```javascript
await smartuiSnapshot(pageOrDriver, 'homepage', {
  // Ignore specific elements from the snapshot
  ignoreElements: [
    '.dynamic-content',
    '#temporary-banner'
  ],
  
  // Capture only specific elements
  captureElements: [
    '.main-content',
    '#header'
  ]
});
```

### Viewport and Display Options

```javascript
await smartuiSnapshot(pageOrDriver, 'homepage', {
  // Set the viewport size for the snapshot
  viewport: {
    width: 1920,
    height: 1080
  },
  
  // Set the device scale factor
  deviceScaleFactor: 2,
  
  // Set the snapshot background color
  backgroundColor: '#ffffff'
});
```

### Image Quality Options

```javascript
await smartuiSnapshot(pageOrDriver, 'homepage', {
  // Set the snapshot quality (0-100)
  quality: 90,
  
  // Set the snapshot format (png or jpeg)
  format: 'png',
  
  // Set the snapshot compression level (0-9)
  compression: 6
});
```

### Region Control Options

```javascript
await smartuiSnapshot(pageOrDriver, 'homepage', {
  // Set the snapshot clip region
  clip: {
    x: 0,
    y: 0,
    width: 800,
    height: 600
  },
  
  // Set the snapshot mask regions
  mask: [
    {
      x: 100,
      y: 100,
      width: 200,
      height: 200
    }
  ],
  
  // Set the snapshot overlay regions
  overlay: [
    {
      x: 300,
      y: 300,
      width: 100,
      height: 100,
      color: '#ff0000'
    }
  ]
});
```

### Annotation Options

```javascript
await smartuiSnapshot(pageOrDriver, 'homepage', {
  // Set the snapshot annotations
  annotations: [
    {
      type: 'text',
      text: 'Important Section',
      x: 400,
      y: 400
    }
  ]
});
```

### Performance Options

```javascript
await smartuiSnapshot(pageOrDriver, 'homepage', {
  // Set the snapshot timeout (in milliseconds)
  timeout: 30000
});
```

---

## URL Tracking Configuration Options

For frameworks that support URL tracking, you can configure:

### Basic Options

```javascript
{
  enabled: true,                    // Enable/disable tracking
  trackHashChanges: true,           // Track hash changes
  preserveHistory: true,            // Keep history after cleanup
  enableApiUpload: true,            // Enable API upload to LT Insights
  testName: 'custom-test-name',     // Custom test name
  specFile: 'custom-spec.js'        // Custom spec file name
}
```

### API Upload Options

```javascript
{
  enableApiUpload: true,
  apiEndpoint: 'custom-endpoint',   // Custom API endpoint
  username: 'custom-username',      // Custom username (or use LT_USERNAME env)
  accessKey: 'custom-access-key'    // Custom access key (or use LT_ACCESS_KEY env)
}
```

---

## Error Handling

### SmartUI Errors
The SmartUI SDKs will throw errors in the following cases:
- If the required driver/page object is not provided
- If the snapshot name is not provided or is not a string (except Cypress which can use test title)
- If the Smart UI server is not running
- If there are any issues during the snapshot capture process

### URL Tracking Errors
The URL tracking functionality includes:
- Automatic retry mechanisms for API uploads
- Graceful degradation when API is unavailable
- Comprehensive error logging and reporting
- Fallback to local file storage when needed

---

## Framework-Specific Notes

### Playwright
- **SmartUI**: Full support with all advanced options
- **URL Tracking**: Complete fixture-based solution with automatic cleanup and API upload
- **Best Practice**: Use `createUrlTrackerFixture()` for seamless integration

### Cypress
- **SmartUI**: Auto-registered `cy.smartuiSnapshot()` command with test title fallback
- **URL Tracking**: Built into SmartUI functionality
- **Note**: Disabled in interactive mode by default (use `cypress run`)

### WebdriverIO
- **SmartUI**: Full support with all advanced options  
- **URL Tracking**: Multiple integration methods (service, config enhancement, manual)
- **Additional Features**: `UrlTracker`, `UrlTrackerService`, and `enhanceConfigWithUrlTracking`

### Selenium
- **SmartUI**: Full support with session ID integration
- **URL Tracking**: Currently focused on SmartUI functionality

### Puppeteer
- **SmartUI**: Full support with all advanced options
- **URL Tracking**: Currently focused on SmartUI functionality

### TestCafe
- **SmartUI**: Full support with TestCafe's test context
- **URL Tracking**: Currently focused on SmartUI functionality

### Appium
- **SmartUI**: Not applicable (mobile-focused)
- **Navigation Tracking**: Comprehensive mobile app navigation monitoring with API upload
- **Features**: User action recording, navigation tracking, API upload with retry logic

---

## Getting Started

1. **Choose your testing framework** and install the corresponding package
2. **Set up credentials** using environment variables
3. **For SmartUI**: Start the SmartUI server and use `smartuiSnapshot()`
4. **For URL Tracking**: Use the framework-specific URL tracking setup (automatic API upload included)
5. **For Both**: Many frameworks support using both features simultaneously

## Support

For any issues or questions, please:
1. Check the [documentation](https://www.lambdatest.com/support/docs/)
2. Contact LambdaTest support
3. Open an issue on the [GitHub repository](https://github.com/LambdaTest/lambdatest-js-sdk/issues)

## License

This project is licensed under the MIT License - see the LICENSE file for details.
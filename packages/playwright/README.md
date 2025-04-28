# LambdaTest Playwright SDK

This package provides integration between Playwright and LambdaTest, including SmartUI and URL tracking capabilities.

## Installation

```bash
npm install @lambdatest/playwright-driver
```

## URL Tracking

The SDK includes a comprehensive URL tracker plugin that captures and monitors all page navigations in your Playwright tests.

### Basic Setup

Import and initialize the UrlTrackerPlugin in your test files:

```javascript
const { chromium } = require('playwright');
const { UrlTrackerPlugin } = require('@lambdatest/playwright-driver');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Create the URL tracker with options
  const urlTracker = new UrlTrackerPlugin(page, {
    enabled: true,
    trackHashChanges: true,
    testName: 'my-test',
    preserveHistory: true
  });
  
  // Initialize the tracker
  await urlTracker.init();
  
  // Your test code here...
  await page.goto('https://example.com');
  
  // Get navigation history
  const history = urlTracker.getNavigationHistory();
  console.log('Navigation history:', history);
  
  // Export results to a JSON file
  urlTracker.exportResults('./url-results.json');
  
  // Clean up
  await urlTracker.destroy();
  await browser.close();
})();
```

### Global Configuration Setup

You can configure the URL tracker globally in your Playwright configuration to automatically track URLs across all tests:

```javascript
// playwright.config.js
const { UrlTrackerPlugin } = require('@lambdatest/playwright-driver');
const path = require('path');

module.exports = {
  testDir: './tests',
  // Other Playwright config...
  
  // Define global setup/teardown files
  globalSetup: './global-setup.js',
  globalTeardown: './global-teardown.js',
  
  // Add URL tracker to page fixtures
  use: {
    // Other browser options...
    
    // Store URL tracker in context to make it available in tests
    contextOptions: {
      storageState: {}
    }
  }
};
```

Then in your global setup file:

```javascript
// global-setup.js
const { UrlTrackerPlugin } = require('@lambdatest/playwright-driver');

module.exports = async (config) => {
  // Setup global URL tracking state
  global.urlTrackerState = {
    results: [],
    instances: new Map()
  };
  
  // Add page fixture to create URL tracker for each page
  const originalPage = config.fixtures.page;
  config.fixtures.page = async (params, runTest) => {
    const page = await originalPage(params);
    
    // Create URL tracker for this page
    const testInfo = params.testInfo;
    const urlTracker = new UrlTrackerPlugin(page, {
      enabled: true,
      testName: testInfo.title,
      preserveHistory: true
    });
    
    // Initialize URL tracker
    await urlTracker.init();
    
    // Store tracker instance for this test
    global.urlTrackerState.instances.set(testInfo.title, urlTracker);
    
    return page;
  };
};
```

And in your global teardown:

```javascript
// global-teardown.js
const fs = require('fs');
const path = require('path');

module.exports = async (config) => {
  // Export all URL tracking results
  if (global.urlTrackerState) {
    const results = [];
    
    // Collect results from all test instances
    for (const [testName, tracker] of global.urlTrackerState.instances) {
      results.push(...tracker.getTrackingResults());
      await tracker.destroy();
    }
    
    // Save consolidated results
    const outputPath = path.join(process.cwd(), 'url-tracking-results.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    
    console.log(`URL tracking results saved to ${outputPath}`);
  }
};
```

### Accessing Tracking Results

You can access URL tracking results in several ways:

#### 1. During Test Execution

```javascript
test('should navigate correctly', async ({ page }) => {
  // Get the URL tracker instance for this test
  const testInfo = test.info();
  const urlTracker = global.urlTrackerState.instances.get(testInfo.title);
  
  await page.goto('https://example.com');
  await page.click('a.nav-link');
  
  // Get current navigation history
  const history = urlTracker.getNavigationHistory();
  console.log('Navigation paths:', history.map(entry => entry.url));
  
  // Assert on navigation behavior
  expect(history.length).toBeGreaterThan(1);
  expect(history[history.length - 1].url).toContain('example.com/page');
});
```

#### 2. From JSON Output File

After your tests complete, you can analyze the consolidated JSON output file:

```javascript
const fs = require('fs');

// Read the results file
const results = JSON.parse(fs.readFileSync('./url-tracking-results.json', 'utf-8'));

// Filter results by test
const loginTestResults = results.filter(entry => entry.testName === 'login test');

// Analyze navigation patterns
const navigationSequence = loginTestResults.map(entry => ({
  from: entry.fromUrl,
  to: entry.toUrl,
  type: entry.navigationType
}));

console.log('Navigation sequence:', navigationSequence);
```

The output JSON has this structure:

```json
[
  {
    "testName": "login test",
    "navigationType": "navigation",
    "fromUrl": "null",
    "toUrl": "https://example.com/login"
  },
  {
    "testName": "login test",
    "navigationType": "pushstate",
    "fromUrl": "https://example.com/login",
    "toUrl": "https://example.com/dashboard"
  }
]
```

### Advanced Configuration

The UrlTrackerPlugin accepts the following options:

```javascript
const options = {
  enabled: true,           // Enable/disable tracking (default: true)
  trackHashChanges: true,  // Track hash changes in URLs (default: true)
  testName: 'my-test',     // Identify test in tracking results (default: 'unknown')
  preserveHistory: true    // Keep history after destroy() (default: true)
};

const urlTracker = new UrlTrackerPlugin(page, options);
```

### Features

The URL tracker provides these key features:

- Tracks all page navigations including direct navigations, redirects, and back/forward buttons
- Captures history API changes (pushState, replaceState)
- Monitors hash changes in URLs (optional)
- Normalizes URLs for consistent tracking
- Provides navigation history with timestamps and navigation types
- Exports results to JSON for analysis
- Emits events for URL changes that you can listen to

### Event Listening

You can listen for URL change events:

```javascript
urlTracker.on('urlChange', ({ oldUrl, newUrl }) => {
  console.log(`URL changed from ${oldUrl} to ${newUrl}`);
});

urlTracker.on('hashChange', ({ oldURL, newURL }) => {
  console.log(`Hash changed from ${oldURL} to ${newURL}`);
});
```

### API Reference

- `init()` - Initialize the tracker and begin monitoring
- `getNavigationHistory()` - Get all navigation entries
- `getCurrentUrl()` - Get the current URL
- `getTrackingResults()` - Get all tracking results
- `exportResults(filepath)` - Save tracking data to JSON
- `clearHistory()` - Clear navigation history
- `destroy()` - Remove all listeners and clean up
- `cleanup()` - Preserve history and clean up

## SmartUI Integration

For SmartUI integration, see the [SmartUI documentation](https://www.lambdatest.com/support/docs/smartui-integration-with-playwright/).
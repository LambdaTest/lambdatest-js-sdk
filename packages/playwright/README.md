# LambdaTest Playwright SDK

This package provides integration between Playwright and LambdaTest, including SmartUI and URL tracking capabilities.

## Installation

```bash
npm install @lambdatest/playwright-driver
```

## URL Tracking

The SDK includes a comprehensive URL tracker plugin that captures and monitors all page navigations in your Playwright tests. **The URL tracker is now completely self-contained and requires no setup files or configuration!**

### Quick Start (Recommended)

The easiest way to use URL tracking is with the self-contained fixture approach:

```javascript
const { test, expect } = require('@playwright/test');
const { createUrlTrackerFixture } = require('@lambdatest/playwright-driver');

// Set up authentication for API upload (optional)
process.env.LT_USERNAME = 'your-lambdatest-username';
process.env.LT_ACCESS_KEY = 'your-lambdatest-access-key';

// Create the URL tracker fixture - this is ALL you need!
const urlTrackerFixture = createUrlTrackerFixture({
    enabled: true,
    trackHashChanges: true,
    preserveHistory: true,
    enableApiUpload: true  // Default: true
});

// Use the fixture in your tests
test.use(urlTrackerFixture);

test.describe('My Tests', () => {
    test('should track URLs automatically', async ({ page }) => {
        // Just navigate normally - tracking happens automatically
        await page.goto('https://example.com');
        await page.goto('https://example.com/about');
        await page.goto('https://example.com/contact');
        
        // No manual cleanup needed - it's all automatic!
        // API upload and reporting happen automatically
    });
});
```

**That's it!** The URL tracker will automatically:
- ✅ Initialize for each test
- ✅ Track all navigation events (goto, back, forward, reload, SPA routes, hash changes)
- ✅ Clean up after each test with API upload
- ✅ Generate a comprehensive API upload report at the end
- ✅ Handle process termination gracefully
- ✅ Create output files in both `tests-results/` and `test-results/` directories

### What You Get Automatically

#### 1. **Zero Configuration Required**
- No `globalSetup` or `globalTeardown` files needed
- No manual cleanup in `afterEach` hooks
- No process handlers in your code
- No directory creation or file management

#### 2. **Comprehensive Navigation Tracking**
- Direct navigation (`page.goto()`)
- Browser navigation (back, forward, reload)
- SPA route changes (`history.pushState`, `history.replaceState`)
- Hash changes (`window.location.hash`)
- Form submissions and redirects
- Link clicks and popstate events

#### 3. **Automatic API Upload**
- Uploads tracking results to LambdaTest insights API after each test
- Retry logic with exponential backoff
- Detailed success/failure reporting
- Graceful degradation if upload fails

#### 4. **Robust Error Handling**
- Multiple cleanup triggers for maximum reliability
- Process termination handlers (SIGINT, SIGTERM, uncaught exceptions)
- Timeout-based fallback cleanup
- Comprehensive error logging and reporting

#### 5. **Detailed Reporting**
At the end of your test run, you'll see a comprehensive report:

```
🔗 URL TRACKER - API UPLOAD REPORT
============================================================
✅ Successful uploads: 8
   ✓ login_test (2024-01-15T10:30:25.123Z)
   ✓ checkout_test (2024-01-15T10:31:15.456Z)
   ...

❌ Failed uploads: 0
============================================================
```

### Advanced Usage

#### Accessing Tracking Results During Tests

```javascript
test('should provide access to tracking results', async ({ page }, testInfo) => {
    await page.goto('https://example.com');
    await page.goto('https://example.com/products');
    
    // Access the URL tracker instance
    const urlTracker = testInfo.urlTracker;
    if (urlTracker) {
        const trackingResults = urlTracker.getTrackingResults();
        console.log(`Generated ${trackingResults.length} tracking results`);
        
        // Make assertions on tracking results
        expect(trackingResults.length).toBeGreaterThan(0);
        
        const lastResult = trackingResults[trackingResults.length - 1];
        expect(lastResult.current_url).toContain('products');
        expect(lastResult.navigation_type).toBeDefined();
    }
});
```

#### Custom Configuration

```javascript
const urlTrackerFixture = createUrlTrackerFixture({
    enabled: true,                    // Enable/disable tracking
    trackHashChanges: true,           // Track hash changes
    preserveHistory: true,            // Keep history after cleanup
    enableApiUpload: true,            // Enable API upload
    apiEndpoint: 'custom-endpoint',   // Custom API endpoint
    username: 'custom-username',      // Custom username
    accessKey: 'custom-access-key'    // Custom access key
});
```

#### Manual Global Cleanup (Optional)

If you need to trigger global cleanup manually:

```javascript
const { performGlobalUrlTrackerCleanup } = require('@lambdatest/playwright-driver');

// Manually trigger global cleanup (usually not needed)
await performGlobalUrlTrackerCleanup();
```

### Basic Setup (Alternative)

If you prefer manual control, you can still use the UrlTrackerPlugin directly. **Note: As of version 1.0.6+, automatic cleanup is now built-in even for manual usage!**

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
    preserveHistory: true,
    // API upload options
    enableApiUpload: true,
    username: process.env.LT_USERNAME,
    accessKey: process.env.LT_ACCESS_KEY
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
  
  // Cleanup is now AUTOMATIC! You can still call it manually if needed:
  // await urlTracker.cleanup();
  
  await browser.close();
  // The tracker will automatically clean up and upload results when the page/browser closes
})();
```

**Automatic Cleanup Features (NEW):**
- ✅ Cleanup triggers automatically when page closes
- ✅ Cleanup triggers automatically when browser context closes  
- ✅ Cleanup triggers on process exit (SIGINT, SIGTERM)
- ✅ Fallback timeout-based cleanup after 5 minutes
- ✅ API upload happens automatically during cleanup
- ✅ No manual cleanup() call required anymore

## SmartUI Integration

For SmartUI integration, see the [SmartUI documentation](https://www.lambdatest.com/support/docs/smartui-integration-with-playwright/).

## Logging and Reporting

### Minimal Logging
The URL tracker now uses minimal logging to reduce noise in test output. Only essential events are logged:

- Tracker initialization and cleanup
- Navigation events (only when they occur)
- API upload status (success/failure)
- Critical errors

### API Upload Reporting
After all tests complete, a comprehensive API upload report is generated that shows:

- ✅ **Successful uploads**: Number of tests that successfully uploaded tracking data
- ❌ **Failed uploads**: Number of tests that failed to upload, with error details
- **Test run failure**: If any API uploads fail, the entire test run will fail with a detailed error report

Example API upload report:
```
🔗 URL TRACKER - API UPLOAD REPORT
============================================================
✅ Successful uploads: 8
   ✓ login_test (2024-01-15T10:30:25.123Z)
   ✓ checkout_test (2024-01-15T10:31:15.456Z)
   ...

❌ Failed uploads: 2
   ✗ payment_test: Request timeout after 30000ms (2024-01-15T10:32:05.789Z)
   ✗ profile_test: HTTP 401: Unauthorized (2024-01-15T10:32:45.012Z)

============================================================
⚠️  API UPLOAD FAILURES DETECTED - TEST RUN FAILED
============================================================
```

If API uploads fail, a detailed error report is saved to `api-upload-error-report.json` in your project root.

### Error Handling
- **API upload failures are mandatory**: If enabled, API upload failures will cause the test run to fail
- **Graceful degradation**: File export continues even if API upload fails
- **Retry logic**: API uploads are retried up to 3 times with exponential backoff
- **Timeout protection**: API requests timeout after 30 seconds

## Troubleshooting

### No API Upload Report Generated

If you're not seeing the API upload report, check the following:

1. **URL Tracker Initialization**: Ensure the URL tracker is properly initialized in your tests
2. **Navigation Events**: The tracker only uploads data if navigation events are detected
3. **API Upload Enabled**: Check that `enableApiUpload: true` is set in your options
4. **Authentication**: Verify that `LT_USERNAME` and `LT_ACCESS_KEY` environment variables are set

### Debug URL Tracking

Run the debug example to test URL tracking:

```bash
cd packages/playwright
node examples/debug-url-tracker.js
```

This will show detailed logging of:
- URL tracker initialization
- Navigation events
- Tracking results generation
- API upload attempts

### Common Issues

**Issue**: "No API upload attempts detected"
**Solution**: 
- Check if URL tracker is initialized: Look for "Initializing URL tracker" logs
- Verify navigation occurs: Look for "Navigation detected" logs
- Check API upload settings: Look for "API upload enabled: true" logs

**Issue**: API upload fails with authentication errors
**Solution**:
- Set environment variables: `export LT_USERNAME=your-username LT_ACCESS_KEY=your-access-key`
- Or pass credentials directly in options: `{ username: 'your-username', accessKey: 'your-access-key' }`

**Issue**: No tracking results generated
**Solution**:
- Ensure you're navigating to different URLs in your tests
- Check that the page is not staying on `about:blank`
- Verify the URL tracker is enabled: `{ enabled: true }`

### Debug Logging

Enable debug logging to see detailed information:

```bash
export DEBUG_URL_TRACKER=true
```

This will show:
- Detailed navigation tracking
- API upload payload information
- Error details and stack traces
# LambdaTest Playwright SDK

This package provides integration between Playwright and LambdaTest, including SmartUI and URL tracking capabilities.

## Installation

```bash
npm install @lambdatest/playwright-driver
```

## URL Tracking

The SDK includes a URL tracker plugin that can be added to your Playwright configuration. To use it:

1. Import the plugin in your `playwright.config.js`:
```javascript
const { UrlTrackerPlugin } = require('@lambdatest/playwright-driver');

module.exports = {
    // ... other Playwright config options ...

    // Add the URL tracker plugin
    plugins: [new UrlTrackerPlugin()],

    // Configure projects for different browsers
    projects: [
        {
            name: 'chromium',
            use: {
                browserName: 'chromium',
                // ... other browser options ...
            },
        },
        // ... other projects ...
    ],
};
```

The URL tracker will automatically:
- Log all page navigations in real-time
- Log all hash changes (if enabled)
- Print a complete navigation history after each test

Example output:
```
[URL Tracker] Navigation: https://example.com -> https://example.com/page1
[URL Tracker] Hash Change: https://example.com/page1 -> https://example.com/page1#section1

[URL Tracker] Navigation History:
[1] navigation: https://example.com
[2] navigation: https://example.com/page1
[3] hashchange: https://example.com/page1#section1
```

## SmartUI Integration

For SmartUI integration, see the [SmartUI documentation](https://www.lambdatest.com/support/docs/smartui-integration-with-playwright/).
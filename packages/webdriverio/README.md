# @lambdatest/wdio-driver

WebdriverIO driver for LambdaTest platform capabilities including SmartUI and URL Tracking.

## Installation

```bash
npm install @lambdatest/wdio-driver
```

## Features

### SmartUI Screenshots

SmartUI allows you to capture screenshots for visual testing:

```javascript
const { smartuiSnapshot } = require('@lambdatest/wdio-driver');

// In your test
await smartuiSnapshot(browser, 'Screenshot Name');
```

### URL Tracking

The URL tracking functionality allows you to automatically track all URL navigations during your WebdriverIO tests, including:

- Direct navigations via browser.url()
- SPA route changes via history.pushState
- Hash changes
- Back/forward navigation
- Form submissions
- Redirects

#### Basic Setup

Add the UrlTrackerService to your wdio.conf.js:

```javascript
const { UrlTrackerService, enhanceConfigWithUrlTracking } = require('@lambdatest/wdio-driver');

// In your wdio.conf.js
let config = {
  // ... your existing config
  services: [
    [UrlTrackerService, {
      outputDirectory: 'test-results',
      outputFilename: 'url-tracking.json',
      trackHashChanges: true,
      trackPushState: true
    }]
  ],
};

// Enhanced hooks for better test info capturing
exports.config = enhanceConfigWithUrlTracking(config);
```

#### Advanced Usage

You can also use the URL tracker directly in your tests:

```javascript
// In your test file
describe('My test suite', function() {
  it('should navigate correctly', async function() {
    // Get the URL tracker instance
    const urlTracker = browser.getUrlTracker();
    
    // Normal test actions
    await browser.url('https://example.com');
    
    // Manually record a navigation if needed
    urlTracker.recordNavigation('https://example.com/custom', 'manual_record'); 
    
    // At the end of your test, the URL tracking data will be automatically saved
  });
});
```

#### Configuration Options

The URL tracker accepts the following options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| trackHistory | boolean | true | Track browser history navigation |
| trackHashChanges | boolean | true | Track URL hash changes |
| trackPushState | boolean | true | Track SPA navigations via history.pushState |
| autoTrack | boolean | true | Automatically track all navigations |
| outputDirectory | string | 'test-results' | Directory where the tracking file will be saved |
| outputFilename | string | 'url-tracking.json' | Filename for the URL tracking data |
| resetFileOnStart | boolean | true | Whether to reset the tracking file on service start |

## Output Format

The URL tracking generates a JSON file with the following structure:

```json
[
  {
    "spec_file": "my-test.spec.js",
    "test_name": "My Test Suite - should navigate correctly",
    "session_id": "123abc456def",
    "navigations": [
      {
        "previous_url": "about:blank",
        "current_url": "https://example.com/",
        "timestamp": "2023-05-05T12:34:56.789Z",
        "navigation_type": "goto"
      },
      {
        "previous_url": "https://example.com/",
        "current_url": "https://example.com/page1",
        "timestamp": "2023-05-05T12:35:01.234Z",
        "navigation_type": "spa_route"
      }
    ],
    "timestamp": "2023-05-05T12:35:10.123Z",
    "save_timestamp": "2023-05-05T12:35:10.123Z",
    "navigation_count": 2
  }
]
```

## License

MIT
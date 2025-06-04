# LambdaTest Appium Navigation Tracker

This package provides navigation tracking capabilities for Appium mobile applications with integrated logging and API upload functionality.

## Features

- **Navigation Tracking**: Automatically track screen navigations in mobile apps
- **Smart Logging**: Beautiful, colored console output with LambdaTest branding
- **API Upload**: Automatic upload of navigation data to LambdaTest Insights API
- **Platform Detection**: Automatic detection of Android/iOS platforms
- **Test Framework Integration**: Works with popular test frameworks (Mocha, Jest, Jasmine)

## Installation

```bash
npm install @lambdatest/appium-navigation-tracker
```

## Basic Usage

```typescript
import { NavigationTracker } from '@lambdatest/appium-navigation-tracker';

// Basic usage without API upload
const tracker = new NavigationTracker(driver);

// Track navigation during test
await tracker.trackNavigation();

// Record user interactions
await tracker.recordUserAction('loginButton');
await tracker.beforeClick('submitButton');
// ... perform click action ...
await tracker.afterClick();

// Save results at the end of test
await tracker.saveResults();
```

## Usage with API Upload

```typescript
import { NavigationTracker } from '@lambdatest/appium-navigation-tracker';

// Enable API upload to LambdaTest Insights
const tracker = new NavigationTracker(driver, {
  enableApiUpload: true,
  apiUploadOptions: {
    username: 'your-lt-username', // or use LT_USERNAME env var
    accessKey: 'your-lt-access-key', // or use LT_ACCESS_KEY env var
    apiEndpoint: 'https://api.lambdatest.com/insights/api/v3/queue', // optional
    timeout: 30000, // optional
    retryAttempts: 3, // optional
    retryDelay: 1000 // optional
  }
});

// Track navigation during test
await tracker.trackNavigation();

// Save results and upload to API
await tracker.saveResults();
```

## Environment Variables

You can use environment variables instead of passing credentials directly:

```bash
export LT_USERNAME="your-username"
export LT_ACCESS_KEY="your-access-key"
```

```typescript
// Credentials will be picked up automatically
const tracker = new NavigationTracker(driver, {
  enableApiUpload: true
});
```

## Logger Usage

You can also use the logger independently:

```typescript
import { logger } from '@lambdatest/appium-navigation-tracker';

logger.info('Test started');
logger.success('Operation completed successfully');
logger.warn('Warning message');
logger.error('Error occurred');
logger.navigation('User navigated to new screen');
logger.apiUpload('Uploading data to API');
```

## API Reference

### NavigationTracker

#### Constructor
```typescript
new NavigationTracker(driver: any, options?: NavigationTrackerOptions)
```

#### Methods

- `trackNavigation()`: Track current screen navigation
- `recordUserAction(elementId: string)`: Record user interaction with an element
- `beforeClick(elementId: string)`: Hook to call before clicking an element
- `afterClick()`: Hook to call after clicking an element
- `saveResults()`: Save navigation results to file and optionally upload to API

### NavigationTrackerOptions

```typescript
interface NavigationTrackerOptions {
  enableApiUpload?: boolean;
  apiUploadOptions?: ApiUploaderOptions;
}
```

### ApiUploaderOptions

```typescript
interface ApiUploaderOptions {
  apiEndpoint?: string;
  username?: string;
  accessKey?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}
```

## Example with Mocha/WebdriverIO

```typescript
import { remote } from 'webdriverio';
import { NavigationTracker } from '@lambdatest/appium-navigation-tracker';

describe('Mobile App Navigation', () => {
  let driver;
  let tracker;

  before(async () => {
    const capabilities = {
      platformName: 'Android',
      deviceName: 'emulator',
      app: '/path/to/app.apk'
    };
    
    driver = await remote({ capabilities });
    
    tracker = new NavigationTracker(driver, {
      enableApiUpload: true,
      apiUploadOptions: {
        username: process.env.LT_USERNAME,
        accessKey: process.env.LT_ACCESS_KEY
      }
    });
  });

  afterEach(async () => {
    await tracker.trackNavigation();
  });

  after(async () => {
    await tracker.saveResults();
    await driver.deleteSession();
  });

  it('should navigate through app screens', async () => {
    // Track navigation before user action
    await tracker.beforeClick('homeButton');
    
    const homeButton = await driver.$('#homeButton');
    await homeButton.click();
    
    // Track navigation after user action
    await tracker.afterClick();
    
    // Continue with test...
  });
});
```

## Output

The tracker will:

1. **Generate local JSON files** with navigation data in the `test-results` directory
2. **Display colored console output** with navigation tracking information
3. **Upload data to LambdaTest API** (if enabled) for insights and analytics

## Debug Mode

Enable debug logging:

```bash
export DEBUG_URL_TRACKER=true
```

This will show additional debug information in the console. 
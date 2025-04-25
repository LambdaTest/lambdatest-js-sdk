# LambdaTest Playwright SDK

The LambdaTest Playwright SDK enables you to integrate LambdaTest's Smart UI testing capabilities with your Playwright test suites. This SDK allows you to capture visual snapshots of your web applications for visual regression testing.

## Prerequisites

- Node.js (v12 or higher)
- Playwright (v1 or higher)
- LambdaTest account with Smart UI access

## Installation

1. Install the LambdaTest Playwright SDK using npm:

```bash
npm install @lambdatest/playwright-driver
```

Or using yarn:

```bash
yarn add @lambdatest/playwright-driver
```

## Configuration

1. Set up your LambdaTest credentials as environment variables:

```bash
export LT_USERNAME="your_username"
export LT_ACCESS_KEY="your_access_key"
```

2. Start the Smart UI server:

```bash
npx smartui start
```

## Usage

Here's how to use the SDK in your Playwright tests:

```javascript
const { smartuiSnapshot } = require('@lambdatest/playwright-driver');

test('should capture homepage snapshot', async ({ page }) => {
  // Navigate to your application
  await page.goto('https://your-app.com');
  
  // Capture a snapshot
  await smartuiSnapshot(page, 'homepage');
});
```

### Advanced Usage

The `smartuiSnapshot` function provides various options to customize your visual testing experience. These options are organized into the following categories:

#### 1. Element Selection Options
These options help you control which elements are included or excluded from your snapshots.

```javascript
await smartuiSnapshot(page, 'homepage', {
  // Ignore specific elements from the snapshot
  // Useful for excluding dynamic or temporary content
  ignoreElements: [
    '.dynamic-content',  // CSS selector
    '#temporary-banner'  // CSS selector
  ],
  
  // Capture only specific elements
  // Useful for focusing on particular components
  captureElements: [
    '.main-content',     // CSS selector
    '#header'           // CSS selector
  ]
});
```

#### 2. Viewport and Display Options
Control how your page is rendered and captured.

```javascript
await smartuiSnapshot(page, 'homepage', {
  // Set the viewport size for the snapshot
  // Useful for testing responsive designs
  viewport: {
    width: 1920,
    height: 1080
  },
  
  // Set the device scale factor
  // Useful for testing high-DPI displays
  deviceScaleFactor: 2,
  
  // Set the snapshot background color
  // Useful for transparent backgrounds
  backgroundColor: '#ffffff'
});
```

#### 3. Image Quality Options
Control the quality and format of the captured snapshots.

```javascript
await smartuiSnapshot(page, 'homepage', {
  // Set the snapshot quality (0-100)
  // Higher values mean better quality but larger file size
  quality: 90,
  
  // Set the snapshot format (png or jpeg)
  // PNG for lossless quality, JPEG for smaller file size
  format: 'png',
  
  // Set the snapshot compression level (0-9)
  // Higher values mean more compression but lower quality
  compression: 6
});
```

#### 4. Region Control Options
Define specific regions to capture or modify in your snapshots.

```javascript
await smartuiSnapshot(page, 'homepage', {
  // Set the snapshot clip region
  // Useful for capturing specific parts of the page
  clip: {
    x: 0,
    y: 0,
    width: 800,
    height: 600
  },
  
  // Set the snapshot mask regions
  // Useful for hiding sensitive information
  mask: [
    {
      x: 100,
      y: 100,
      width: 200,
      height: 200
    }
  ],
  
  // Set the snapshot overlay regions
  // Useful for highlighting specific areas
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

#### 5. Annotation Options
Add annotations to your snapshots for better documentation.

```javascript
await smartuiSnapshot(page, 'homepage', {
  // Set the snapshot annotations
  // Useful for adding notes and highlights
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

#### 6. Performance Options
Control the behavior and timing of snapshot captures.

```javascript
await smartuiSnapshot(page, 'homepage', {
  // Set the snapshot timeout (in milliseconds)
  // Useful for handling slow-loading content
  timeout: 30000
});
```

## Error Handling

The SDK will throw errors in the following cases:
- If the page object is not provided
- If the snapshot name is not provided or is not a string
- If the Smart UI server is not running
- If there are any issues during the snapshot capture process

## Support

For any issues or questions, please:
1. Check the [documentation](https://www.lambdatest.com/support/docs/)
2. Contact LambdaTest support
3. Open an issue on the [GitHub repository](https://github.com/LambdaTest/lambdatest-js-sdk/issues)

## License

This project is licensed under the MIT License - see the LICENSE file for details.
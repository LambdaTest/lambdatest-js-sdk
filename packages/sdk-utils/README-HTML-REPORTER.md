# LambdaTest Enhanced HTML Reporter

The LambdaTest Enhanced HTML Reporter generates beautiful, interactive reports for URL tracking data from Appium, Playwright, and WebDriverIO tests using GitHub Primer UI design system, similar to Playwright's native HTML reports.

## Features

- **🎨 GitHub Primer UI**: Modern, accessible design system used by GitHub
- **🔍 Real-time Search**: Search through sessions, URLs, and navigation types
- **🎛️ Advanced Filters**: Filter by framework, navigation type, test file, and date
- **📊 Metrics Dashboard**: Comprehensive statistics and insights
- **📱 Responsive Design**: Works perfectly on mobile and desktop
- **🌓 Theme Toggle**: Light and dark theme support
- **⚡ Interactive**: Collapsible sessions, hover effects, and keyboard shortcuts
- **🔗 Timeline View**: Visualize navigation flow over time

## Installation

The enhanced HTML reporter is included in all LambdaTest framework packages:

```bash
# For Appium
npm install @lambdatest/appium-navigation-tracker

# For Playwright  
npm install @lambdatest/playwright-driver

# For WebDriverIO
npm install @lambdatest/webdriverio-driver
```

## Quick Start

### CLI Usage

Generate an enhanced report from your existing tracking data:

```bash
# Auto-detect and generate enhanced report
npx lt-report

# Generate and open in browser
npx lt-report --open

# Use dark theme
npx lt-report --theme dark --open

# Disable specific features
npx lt-report --no-search --no-filters

# Use legacy simple UI
npx lt-report --legacy
```

### Programmatic Usage

#### Appium

```javascript
const { EnhancedHtmlReporter } = require('@lambdatest/appium-navigation-tracker');

// Generate enhanced report
const reporter = new EnhancedHtmlReporter({
    theme: 'light',
    enableSearch: true,
    enableFilters: true,
    showMetrics: true,
    title: 'My Appium Navigation Report'
});

const reportPath = reporter.generateReport(trackingData, 'appium');
console.log('Report generated:', reportPath);
```

#### Playwright

```javascript
const { generateEnhancedReport } = require('@lambdatest/playwright-driver');

// Generate enhanced report with custom options
const reportPath = generateEnhancedReport({
    theme: 'dark',
    enableSearch: true,
    showTimeline: true,
    autoOpen: true
});
```

#### WebDriverIO

```javascript
const { generateEnhancedReport } = require('@lambdatest/webdriverio-driver');

// Generate enhanced report
const reportPath = generateEnhancedReport({
    title: 'WebDriverIO URL Tracking Report',
    theme: 'light',
    enableFilters: true
});
```

## Configuration Options

### Enhanced Reporter Options

```javascript
const options = {
    // Basic options
    outputDir: 'test-results',           // Output directory
    reportName: 'url-tracking-report.html', // Report filename
    title: 'URL Tracking Report',       // Report title
    theme: 'light',                     // 'light' or 'dark'
    autoOpen: false,                    // Auto-open in browser
    
    // Enhanced features
    enhanced: true,                     // Use enhanced UI (default)
    enableSearch: true,                 // Real-time search
    enableFilters: true,                // Advanced filters
    showMetrics: true,                  // Metrics dashboard
    showTimeline: true,                 // Timeline view
    
    // Keyboard shortcuts
    enableKeyboardShortcut: true        // Enable keyboard shortcuts
};

const reporter = new EnhancedHtmlReporter(options);
```

### CLI Options

```bash
# Report Style
--enhanced              # Use enhanced Playwright-style UI (default)
--legacy               # Use legacy simple UI

# Appearance  
--theme light          # Light theme (default)
--theme dark           # Dark theme

# Features
--no-search            # Disable search functionality
--no-filters           # Disable filter controls
--no-metrics           # Disable metrics dashboard
--no-timeline          # Disable timeline view

# Output
--output <dir>         # Output directory (default: test-results)
--title <title>        # Custom report title
--open                 # Open report in browser after generation

# Development
--watch                # Watch for changes and auto-regenerate
```

## Framework Integration

### Appium Integration

The enhanced HTML reporter works seamlessly with Appium navigation tracking:

```javascript
const { NavigationTracker, EnhancedHtmlReporter } = require('@lambdatest/appium-navigation-tracker');

// In your test
const tracker = new NavigationTracker(driver, {
    enableApiUpload: true
});

// Track navigation during test
await tracker.trackNavigation();
await tracker.recordUserAction('loginButton');

// At the end of your test suite
await tracker.saveResults();

// Generate enhanced HTML report
const reporter = new EnhancedHtmlReporter({
    title: 'Appium Navigation Report',
    theme: 'light'
});

// Auto-detect tracking files and generate report
const reportPath = EnhancedHtmlReporter.generateFromFiles();
```

### Playwright Integration

For Playwright tests, the enhanced reporter integrates with the URL tracker fixture:

```javascript
// playwright.config.js
const { createUrlTrackerFixture } = require('@lambdatest/playwright-driver');

const config = {
    // ... other config
    
    use: {
        ...createUrlTrackerFixture({
            enableApiUpload: true,
            // Enhanced reporting will be generated automatically
        })
    }
};

module.exports = config;
```

Generate report manually:

```javascript
const { generateEnhancedReport } = require('@lambdatest/playwright-driver');

// After tests complete
const reportPath = generateEnhancedReport({
    title: 'Playwright URL Tracking Report',
    theme: 'dark',
    autoOpen: true
});
```

### WebDriverIO Integration

For WebDriverIO tests with the URL tracker service:

```javascript
// wdio.conf.js
const { UrlTrackerService, generateEnhancedReport } = require('@lambdatest/webdriverio-driver');

exports.config = {
    // ... other config
    
    services: [
        ['@lambdatest/webdriverio-driver', {
            enableApiUpload: true
        }]
    ],
    
    onComplete: function(exitCode, config, capabilities, results) {
        // Generate enhanced HTML report after all tests
        const reportPath = generateEnhancedReport({
            title: 'WebDriverIO URL Tracking Report',
            autoOpen: exitCode === 0 // Only open if tests passed
        });
        
        console.log('Enhanced report generated:', reportPath);
    }
};
```

## Report Features

### 1. Summary Dashboard

The report includes a comprehensive metrics dashboard:

- **Total Sessions**: Number of test sessions
- **Total Navigations**: Total navigation events tracked
- **Unique URLs**: Number of unique URLs visited
- **Average Navigation/Session**: Navigation efficiency metric
- **Average Duration**: Average test duration
- **Test Files**: Number of test files executed

### 2. Interactive Search

Real-time search across:
- Test session names
- Spec file names
- URLs and navigation paths
- Navigation types
- Error messages

**Keyboard Shortcut**: `Ctrl/Cmd + K` to focus search

### 3. Advanced Filtering

Filter results by:
- **Framework**: Appium, Playwright, WebDriverIO
- **Navigation Type**: goto, navigation, back, forward, etc.
- **Test File**: Filter by specific spec files
- **Date Range**: Filter by test execution date

### 4. Session Management

Each test session displays:
- **Collapsible Interface**: Click to expand/collapse session details
- **Session Metadata**: Test name, spec file, session ID, duration
- **Navigation Timeline**: Chronological list of all navigations
- **Framework Badge**: Visual framework identification

### 5. Navigation Details

Each navigation event shows:
- **Type Badge**: Color-coded navigation type indicator
- **URL Flow**: Previous URL → Current URL with truncation
- **Timestamp**: Precise time of navigation
- **Hover Effects**: Smooth interactions and tooltips

### 6. Responsive Design

- **Mobile-Friendly**: Adapts to mobile screens with stacked layouts
- **Touch Support**: Optimized for touch interactions
- **Performance**: Efficient rendering for large datasets

## Keyboard Shortcuts

When the report is open:

- **`Ctrl/Cmd + K`**: Focus search input
- **`Escape`**: Clear search and reset filters
- **`Click Session Header`**: Toggle session expansion
- **`Theme Toggle Button`**: Switch between light/dark themes

When using CLI watch mode:

- **`o`**: Open report in browser
- **`Ctrl + C`**: Exit watch mode

## Customization

### Custom Themes

The reporter uses CSS custom properties for easy theming:

```css
/* Light Theme Variables */
:root[data-color-mode="light"] {
    --color-canvas-default: #ffffff;
    --color-canvas-subtle: #f6f8fa;
    --color-fg-default: #24292f;
    --color-fg-muted: #656d76;
    /* ... more variables */
}

/* Dark Theme Variables */
:root[data-color-mode="dark"] {
    --color-canvas-default: #0d1117;
    --color-canvas-subtle: #161b22;
    --color-fg-default: #f0f6fc;
    --color-fg-muted: #8b949e;
    /* ... more variables */
}
```

### Custom Navigation Type Colors

Navigation types are color-coded using GitHub Primer's semantic color system:

- **Navigation**: Success green
- **Page Load (goto)**: Accent blue  
- **Back/Forward**: Attention yellow
- **Refresh**: Severe orange
- **Error**: Danger red

## Comparison with Playwright Native Reports

The enhanced HTML reporter provides a similar experience to Playwright's native HTML reports:

| Feature | Playwright Native | LambdaTest Enhanced | 
|---------|------------------|-------------------|
| GitHub Primer UI | ✅ | ✅ |
| Light/Dark Themes | ✅ | ✅ |
| Real-time Search | ✅ | ✅ |
| Advanced Filters | ✅ | ✅ |
| Responsive Design | ✅ | ✅ |
| Keyboard Shortcuts | ✅ | ✅ |
| Framework Support | Playwright only | Appium, Playwright, WebDriverIO |
| Navigation Tracking | ❌ | ✅ |
| Cross-framework | ❌ | ✅ |

## Best Practices

### 1. Performance Optimization

For large test suites:

```javascript
// Generate report only for failed tests
const reportPath = generateEnhancedReport({
    // Add custom filtering logic in your implementation
    filterFailedOnly: true
});
```

### 2. CI/CD Integration

```yaml
# GitHub Actions example
- name: Generate Enhanced Report
  run: npx lt-report --theme light
  
- name: Upload Report
  uses: actions/upload-artifact@v3
  with:
    name: enhanced-tracking-report
    path: test-results/url-tracking-report.html
```

### 3. Team Sharing

```javascript
// Generate report with team-friendly settings
const reportPath = generateEnhancedReport({
    title: `${process.env.CI_PIPELINE_ID} - Navigation Report`,
    theme: 'light', // Better for sharing
    enableSearch: true,
    enableFilters: true
});
```

## Troubleshooting

### Common Issues

1. **No tracking data found**
   ```bash
   # Check for tracking files
   ls test-results/*.json
   
   # Generate with specific file
   npx lt-report path/to/tracking.json
   ```

2. **Report not opening**
   ```javascript
   // Install open dependency
   npm install open
   
   // Or specify browser manually
   const reportPath = generateEnhancedReport({ autoOpen: false });
   // Then open manually
   ```

3. **Theme not applying**
   ```bash
   # Clear browser cache or try incognito mode
   npx lt-report --theme dark --open
   ```

### Debug Mode

Enable verbose logging:

```bash
DEBUG_URL_TRACKER=true npx lt-report --open
```

## Migration from Legacy Reporter

To migrate from the legacy HTML reporter:

```javascript
// Before (Legacy)
const { HtmlReporter } = require('@lambdatest/sdk-utils');
const reporter = new HtmlReporter({ theme: 'dark' });

// After (Enhanced)  
const { EnhancedHtmlReporter } = require('@lambdatest/sdk-utils');
const reporter = new EnhancedHtmlReporter({ 
    theme: 'dark',
    enhanced: true  // Explicitly enable enhanced features
});

// Or use the new convenience methods
const { generateEnhancedReport } = require('@lambdatest/playwright-driver');
const reportPath = generateEnhancedReport({ theme: 'dark' });
```

## Examples

See the `examples/` directory in each framework package for complete working examples:

- `packages/appium/examples/html-report-demo.js`
- `packages/playwright/examples/enhanced-report-demo.js`
- `packages/webdriverio/examples/enhanced-report-demo.js`

## Support

For issues with the enhanced HTML reporter:

1. Check the [troubleshooting section](#troubleshooting)
2. Enable debug mode for detailed logs
3. Create an issue with sample tracking data
4. Include browser console errors if applicable

## License

MIT License - see individual package LICENSE files for details. 
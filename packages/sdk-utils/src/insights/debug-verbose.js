/**
 * Universal Debug script to test verbose mode and API upload functionality across all frameworks
 * Run with: node debug-verbose.js [framework]
 * Frameworks: appium, playwright, webdriverio, all (default)
 */

console.log('🔧 LambdaTest Universal Debug Tool for URL Tracking & Navigation...\n');

// Get the framework from command line arguments
const framework = process.argv[2] || 'all';
const validFrameworks = ['appium', 'playwright', 'webdriverio', 'all'];

if (!validFrameworks.includes(framework)) {
    console.error(`❌ Invalid framework: ${framework}`);
    console.error(`Valid options: ${validFrameworks.join(', ')}`);
    process.exit(1);
}

console.log(`🎯 Testing framework(s): ${framework}\n`);

// Test 1: Check current environment variables
console.log('📋 Current Environment Variables:');
console.log(`  VERBOSE: ${process.env.VERBOSE}`);
console.log(`  API_VERBOSE: ${process.env.API_VERBOSE}`);
console.log(`  DEBUG_API_UPLOADER: ${process.env.DEBUG_API_UPLOADER}`);
console.log(`  DEBUG: ${process.env.DEBUG}`);
console.log(`  DEBUG_URL_TRACKER: ${process.env.DEBUG_URL_TRACKER}`);
console.log(`  LT_USERNAME: ${process.env.LT_USERNAME ? 'SET' : 'NOT SET'}`);
console.log(`  LT_ACCESS_KEY: ${process.env.LT_ACCESS_KEY ? 'SET' : 'NOT SET'}`);
console.log();

// Test 2: Check command line arguments
console.log('📋 Command Line Arguments:');
console.log(`  process.argv: ${JSON.stringify(process.argv)}`);
console.log();

// Helper function to enable verbose mode
function enableVerboseMode() {
    process.env.API_VERBOSE = 'true';
    process.env.DEBUG_API_UPLOADER = 'true';
    process.env.VERBOSE = 'true';
    process.env.DEBUG_URL_TRACKER = 'true';
}

// Test 3: Enable verbose mode and check
console.log('🔧 Enabling verbose mode...');
enableVerboseMode();
console.log('✅ Verbose mode enabled\n');

// Test 4: Check environment variables after enableVerboseMode
console.log('📋 Environment Variables After enableVerboseMode():');
console.log(`  VERBOSE: ${process.env.VERBOSE}`);
console.log(`  API_VERBOSE: ${process.env.API_VERBOSE}`);
console.log(`  DEBUG_API_UPLOADER: ${process.env.DEBUG_API_UPLOADER}`);
console.log(`  DEBUG_URL_TRACKER: ${process.env.DEBUG_URL_TRACKER}`);
console.log();

// Test 5: Test API uploader verbose detection directly
console.log('🧪 Testing API uploader verbose detection...');
const { ApiUploader } = require('./api-uploader');

const testUploader = new ApiUploader({
    username: 'test-user',
    accessKey: 'test-key'
});

console.log(`  Verbose mode detected: ${testUploader.verboseMode}`);
console.log();

// Test 6: Framework-specific testing
async function testFrameworkSpecific() {
    if (framework === 'playwright' || framework === 'all') {
        console.log('🧪 Testing Playwright URL Tracker...');
        try {
            // Try to load Playwright package
            const playwrightPackage = require('../../playwright/index.js');
            
            if (playwrightPackage.enableVerboseMode) {
                playwrightPackage.enableVerboseMode();
                console.log('✅ Playwright verbose mode enabled');
            }
            
            if (playwrightPackage.createVerboseUrlTrackerFixture) {
                const fixture = playwrightPackage.createVerboseUrlTrackerFixture({
                    enableApiUpload: true,
                    testName: 'debug-test-playwright',
                    verbose: true
                });
                console.log('✅ Playwright verbose fixture created successfully');
                console.log(`  Fixture has beforeEach: ${typeof fixture.beforeEach === 'function'}`);
                console.log(`  Fixture has afterEach: ${typeof fixture.afterEach === 'function'}`);
            }
        } catch (error) {
            console.error('❌ Error testing Playwright:', error.message);
        }
        console.log();
    }

    if (framework === 'appium' || framework === 'all') {
        console.log('🧪 Testing Appium Navigation Tracker...');
        try {
            // Try to load Appium package
            const appiumPackage = require('../../appium/dist/index.js');
            
            // Test NavigationTracker initialization
            if (appiumPackage.NavigationTracker) {
                console.log('✅ Appium NavigationTracker available');
                
                // Mock driver for testing
                const mockDriver = {
                    sessionId: 'debug-session-appium',
                    capabilities: { platformName: 'Android', automationName: 'UiAutomator2' },
                    getPageSource: () => Promise.resolve('<mock>page source</mock>'),
                    getCurrentUrl: () => Promise.resolve('https://example.com')
                };
                
                const tracker = new appiumPackage.NavigationTracker(mockDriver, {
                    enableApiUpload: true,
                    apiUploadOptions: {
                        username: 'test-user',
                        accessKey: 'test-key',
                        verbose: true
                    }
                });
                console.log('✅ Appium NavigationTracker created with verbose mode');
            }
            
            if (appiumPackage.logger) {
                appiumPackage.logger.info('Debug test for Appium logger');
                console.log('✅ Appium logger working');
            }
        } catch (error) {
            console.error('❌ Error testing Appium:', error.message);
            console.error('Note: Make sure Appium package is built with "npm run build"');
        }
        console.log();
    }

    if (framework === 'webdriverio' || framework === 'all') {
        console.log('🧪 Testing WebDriverIO URL Tracker...');
        try {
            // Try to load WebDriverIO package
            const webdriverioPackage = require('../../webdriverio/index.js');
            
            if (webdriverioPackage.UrlTracker) {
                // Mock browser for testing
                const mockBrowser = {
                    sessionId: 'debug-session-wdio',
                    capabilities: { platformName: 'Android' }
                };
                
                const tracker = new webdriverioPackage.UrlTracker(mockBrowser, {
                    enableApiUpload: true,
                    username: 'test-user',
                    accessKey: 'test-key',
                    verbose: true
                });
                console.log('✅ WebDriverIO UrlTracker created with verbose mode');
                
                // Test initialization
                await tracker.init();
                console.log('✅ WebDriverIO UrlTracker initialized');
                
                // Test cleanup
                await tracker.cleanup();
                console.log('✅ WebDriverIO UrlTracker cleanup completed');
            }
            
            if (webdriverioPackage.UrlTrackerService) {
                console.log('✅ WebDriverIO UrlTrackerService available');
            }
        } catch (error) {
            console.error('❌ Error testing WebDriverIO:', error.message);
        }
        console.log();
    }
}

// Run framework-specific tests
testFrameworkSpecific().then(() => {
    console.log('🎯 Universal Usage Guide:');
    console.log('');
    console.log('='.repeat(60));
    console.log('🔧 APPIUM NAVIGATION TRACKER');
    console.log('='.repeat(60));
    console.log('');
    console.log('Option 1 - Basic Usage:');
    console.log('  const { NavigationTracker } = require("@lambdatest/appium-navigation-tracker");');
    console.log('  const tracker = new NavigationTracker(driver, { enableApiUpload: true });');
    console.log('');
    console.log('Option 2 - WebDriverIO Integration:');
    console.log('  const { createWebDriverIOTracker } = require("@lambdatest/appium-navigation-tracker");');
    console.log('  const tracker = createWebDriverIOTracker(browser, { enableApiUpload: true });');
    console.log('');
    console.log('='.repeat(60));
    console.log('🌐 PLAYWRIGHT URL TRACKER');
    console.log('='.repeat(60));
    console.log('');
    console.log('Option 1 - Use verbose fixture (Easiest):');
    console.log('  const { createVerboseUrlTrackerFixture } = require("@lambdatest/playwright-driver");');
    console.log('  const fixture = createVerboseUrlTrackerFixture({ enableApiUpload: true });');
    console.log('  test.use(fixture);');
    console.log('');
    console.log('Option 2 - Enable verbose mode manually:');
    console.log('  const { enableVerboseMode, createUrlTrackerFixture } = require("@lambdatest/playwright-driver");');
    console.log('  enableVerboseMode(); // Call this before creating fixtures');
    console.log('  const fixture = createUrlTrackerFixture({ enableApiUpload: true, verbose: true });');
    console.log('  test.use(fixture);');
    console.log('');
    console.log('='.repeat(60));
    console.log('🔄 WEBDRIVERIO URL TRACKER');
    console.log('='.repeat(60));
    console.log('');
    console.log('Option 1 - Service Integration:');
    console.log('  const { UrlTrackerService } = require("@lambdatest/webdriverio-driver");');
    console.log('  // Add to wdio.conf.js services: [["UrlTrackerService", { enableApiUpload: true }]]');
    console.log('');
    console.log('Option 2 - Manual Usage:');
    console.log('  const { UrlTracker } = require("@lambdatest/webdriverio-driver");');
    console.log('  const tracker = new UrlTracker(browser, { enableApiUpload: true });');
    console.log('  await tracker.init();');
    console.log('');
    console.log('='.repeat(60));
    console.log('🔍 DEBUGGING');
    console.log('='.repeat(60));
    console.log('');
    console.log('Environment Variables:');
    console.log('  PowerShell: $env:DEBUG_API_UPLOADER="true"; npm run test');
    console.log('  CMD: set DEBUG_API_UPLOADER=true && npm run test');
    console.log('  Bash: DEBUG_API_UPLOADER=true npm run test');
    console.log('');
    console.log('Run this debug script:');
    console.log('  node node_modules/@lambdatest/sdk-utils/src/insights/debug-verbose.js');
console.log('  node node_modules/@lambdatest/sdk-utils/src/insights/debug-verbose.js playwright');
console.log('  node node_modules/@lambdatest/sdk-utils/src/insights/debug-verbose.js appium');
console.log('  node node_modules/@lambdatest/sdk-utils/src/insights/debug-verbose.js webdriverio');
    console.log('');
    console.log('🔍 Debugging Tips:');
    console.log('1. Look for [ApiUploader] verbose mode detection logs in your test output');
    console.log('2. Look for [UrlTracker] === CLEANUP START === messages');
    console.log('3. Look for [ApiUploader] uploadTrackingResults called messages');
    console.log('4. Check that test-results/ directory contains tracking files');
    console.log('5. Use verbose fixtures/options for the easiest setup');
    console.log('');
    console.log('🚨 COMMON TROUBLESHOOTING:');
    console.log('');
    console.log('ISSUE: "No URL tracking events found"');
    console.log('SOLUTIONS:');
    console.log('1. Ensure you are using the correct fixture/service for your framework');
    console.log('2. Check that your tests are actually navigating to URLs');
    console.log('3. Look for cleanup logs in your test output');
    console.log('4. Verify that tracking files are being created in test-results/');
    console.log('5. Make sure API credentials are set correctly');
    console.log('');
    console.log('ISSUE: API upload failures');
    console.log('SOLUTIONS:');
    console.log('1. Check LT_USERNAME and LT_ACCESS_KEY environment variables');
    console.log('2. Enable verbose mode to see detailed API request/response logs');
    console.log('3. Check network connectivity to LambdaTest API');
    console.log('4. Verify that tracking data is being generated correctly');
    console.log('');
    console.log('✅ Debug script completed successfully!');
}).catch(error => {
    console.error('💥 Debug script failed:', error);
    process.exit(1);
}); 
/**
 * Complete working WebDriverIO configuration with NavigationTracker
 * This shows both approaches - WebDriverIO-specific and standard
 */

// Approach 1: Using WebDriverIO-specific tracker (preferred)
// const { createWebDriverIOTracker } = require('@lambdatest/appium-navigation-tracker');

// Approach 2: Using standard tracker (fallback - works with WebDriverIO)
const { NavigationTracker } = require('@lambdatest/appium-navigation-tracker');

exports.config = {
    // Test runner services
    runner: 'local',
    
    // Specify test files
    specs: [
        './test/specs/**/*.js'
    ],
    
    // Capabilities
    capabilities: [{
        platformName: 'Android',
        'appium:platformVersion': '12',
        'appium:deviceName': 'Galaxy S21',
        'appium:app': 'lt://proverbial_android', // Replace with your app ID
        'appium:automationName': 'UiAutomator2',
        'appium:newCommandTimeout': 300,
        'appium:connectHardwareKeyboard': true,
        
        // LambdaTest Options
        'lt:options': {
            username: process.env.LT_USERNAME,
            accessKey: process.env.LT_ACCESS_KEY,
            build: 'WebDriverIO Navigation Test',
            name: 'Android Navigation Tracking',
            platformName: 'Android'
        }
    }],

    // Test configurations
    logLevel: 'info',
    bail: 0,
    baseUrl: 'http://localhost',
    waitforTimeout: 10000,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,
    framework: 'mocha',
    
    // Reporter
    reporters: ['spec'],
    
    // Mocha options
    mochaOpts: {
        ui: 'bdd',
        timeout: 60000
    },

    // LambdaTest Hub
    protocol: 'https',
    hostname: 'mobile-hub.lambdatest.com',
    port: 443,
    path: '/wd/hub',

    // ====================
    // Navigation Tracker Hooks
    // ====================
    
    onPrepare: function (config, capabilities) {
        // Initialize global tracker storage
        global.navigationTrackers = new Map();
        console.log('🚀 Navigation tracking initialized');
    },

    before: function (capabilities, specs) {
        try {
            console.log('📱 Setting up navigation tracker for session:', browser.sessionId);
            
            // OPTION 1: WebDriverIO-specific tracker (use this when available)
            // const tracker = createWebDriverIOTracker(browser, {
            //     enableApiUpload: true,
            //     apiUploadOptions: {
            //         username: process.env.LT_USERNAME,
            //         accessKey: process.env.LT_ACCESS_KEY,
            //         timeout: 30000
            //     }
            // });
            
            // OPTION 2: Standard tracker (works with WebDriverIO)
            const tracker = new NavigationTracker(browser, {
                enableApiUpload: true,
                apiUploadOptions: {
                    username: process.env.LT_USERNAME,
                    accessKey: process.env.LT_ACCESS_KEY,
                    timeout: 30000,
                    retryAttempts: 3
                }
            });
            
            // Store tracker globally
            global.navigationTrackers.set(browser.sessionId, tracker);
            global.currentTracker = tracker;
            
            console.log('✅ Navigation tracker ready for', capabilities.platformName);
            
        } catch (error) {
            console.error('❌ Failed to initialize navigation tracker:', error.message);
            // Don't fail the test if tracker setup fails
        }
    },

    beforeTest: function (test, context) {
        try {
            if (global.currentTracker) {
                // Set test context for better tracking
                const testName = `${test.parent} - ${test.title}`;
                console.log(`🧪 Starting test: ${testName}`);
                
                // If using WebDriverIO tracker, you can set context
                // global.currentTracker.setCurrentTest(testName);
            }
        } catch (error) {
            console.warn('⚠️ Failed to set test context:', error.message);
        }
    },

    afterTest: function (test, context, { error, result, duration, passed, retries }) {
        try {
            if (global.currentTracker) {
                console.log(`📊 Test ${passed ? 'passed' : 'failed'}: ${test.title}`);
                // Track navigation after each test
                global.currentTracker.trackNavigation();
            }
        } catch (trackingError) {
            console.warn('⚠️ Failed to track navigation after test:', trackingError.message);
        }
    },

    after: function (result, capabilities, specs) {
        try {
            if (global.currentTracker) {
                console.log('💾 Saving navigation results...');
                return global.currentTracker.saveResults();
            }
        } catch (error) {
            console.error('❌ Failed to save navigation results:', error.message);
        }
    },

    onComplete: function (exitCode, config, capabilities, results) {
        const trackerCount = global.navigationTrackers ? global.navigationTrackers.size : 0;
        console.log(`🎉 Tests completed! Generated navigation reports for ${trackerCount} sessions`);
        
        if (trackerCount > 0) {
            console.log('📋 Reports available in: ./test-results/');
            console.log('🌐 Generate HTML report: npx lt-report --open');
        }
    }
}; 
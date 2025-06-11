#!/usr/bin/env node

/**
 * Complete Enhanced HTML Reporter Demo
 * Demonstrates all features across Appium, Playwright, and WebDriverIO
 */

const fs = require('fs');
const path = require('path');
const { EnhancedHtmlReporter, HtmlReporter, ReportCLI } = require('./index');

console.log('🎯 LambdaTest Enhanced HTML Reporter - Complete Demo\n');

// Demo data for different frameworks
const demoData = {
    appium: {
        session_id: 'appium_session_123',
        spec_file: 'mobile/login.spec.js',
        test_name: 'Login Flow Test',
        timestamp: new Date().toISOString(),
        navigations: [
            {
                previous_screen: 'SplashScreen',
                current_screen: 'LoginScreen',
                timestamp: new Date(Date.now() - 10000).toISOString(),
                navigation_type: 'user_interaction',
                test_name: 'Login Flow Test',
                spec_file: 'mobile/login.spec.js'
            },
            {
                previous_screen: 'LoginScreen',
                current_screen: 'DashboardScreen',
                timestamp: new Date(Date.now() - 5000).toISOString(),
                navigation_type: 'navigation',
                test_name: 'Login Flow Test',
                spec_file: 'mobile/login.spec.js'
            }
        ]
    },
    playwright: [
        {
            session_id: 'playwright_session_456',
            metadata: {
                session_id: 'playwright_session_456',
                spec_file: 'web/checkout.spec.js',
                name: 'E-commerce Checkout'
            },
            timestamp: new Date().toISOString(),
            navigations: [
                {
                    previous_url: 'https://example.com',
                    current_url: 'https://example.com/products',
                    timestamp: new Date(Date.now() - 15000).toISOString(),
                    navigation_type: 'goto',
                    test_name: 'E-commerce Checkout',
                    spec_file: 'web/checkout.spec.js'
                },
                {
                    previous_url: 'https://example.com/products',
                    current_url: 'https://example.com/cart',
                    timestamp: new Date(Date.now() - 8000).toISOString(),
                    navigation_type: 'navigation',
                    test_name: 'E-commerce Checkout',
                    spec_file: 'web/checkout.spec.js'
                }
            ]
        }
    ],
    webdriverio: [
        {
            session_id: 'wdio_session_789',
            spec_file: 'api/integration.spec.js',
            test_name: 'API Integration Test',
            timestamp: new Date().toISOString(),
            navigations: [
                {
                    previous_url: 'https://api.example.com/v1',
                    current_url: 'https://api.example.com/v1/users',
                    timestamp: new Date(Date.now() - 12000).toISOString(),
                    navigation_type: 'navigation',
                    test_name: 'API Integration Test',
                    spec_file: 'api/integration.spec.js'
                }
            ]
        }
    ]
};

async function runCompleteDemo() {
    console.log('📁 Creating demo output directory...');
    if (!fs.existsSync('demo-reports')) {
        fs.mkdirSync('demo-reports', { recursive: true });
    }

    // 1. Generate Enhanced Reports for All Frameworks
    console.log('\n🎨 Generating Enhanced Reports for All Frameworks...\n');

    const frameworks = ['appium', 'playwright', 'webdriverio'];
    const reportPaths = [];

    for (const framework of frameworks) {
        console.log(`📊 Generating ${framework} enhanced report...`);
        
        const reporter = new EnhancedHtmlReporter({
            outputDir: 'demo-reports',
            reportName: `${framework}-enhanced-report.html`,
            title: `LambdaTest ${framework.charAt(0).toUpperCase() + framework.slice(1)} Enhanced Report`,
            theme: 'light',
            enableSearch: true,
            enableFilters: true,
            showMetrics: true,
            showTimeline: true
        });

        const reportPath = reporter.generateReport(demoData[framework], framework);
        reportPaths.push(reportPath);
        console.log(`   ✅ Generated: ${reportPath}`);
    }

    // 2. Generate Combined Report
    console.log('\n🔄 Generating Combined Multi-Framework Report...');
    
    const combinedData = [
        demoData.appium,
        ...demoData.playwright,
        ...demoData.webdriverio
    ];

    const combinedReporter = new EnhancedHtmlReporter({
        outputDir: 'demo-reports',
        reportName: 'combined-enhanced-report.html',
        title: 'LambdaTest Multi-Framework Enhanced Report',
        theme: 'dark',
        enableSearch: true,
        enableFilters: true,
        showMetrics: true,
        showTimeline: true
    });

    const combinedPath = combinedReporter.generateReport(combinedData, 'multi-framework');
    console.log(`   ✅ Combined report: ${combinedPath}`);

    // 3. Generate Legacy vs Enhanced Comparison
    console.log('\n📈 Generating Legacy vs Enhanced Comparison...');

    const legacyReporter = new HtmlReporter({
        outputDir: 'demo-reports',
        reportName: 'legacy-report.html',
        title: 'LambdaTest Legacy Report',
        enhanced: false, // Force legacy mode
        theme: 'light'
    });

    const legacyPath = legacyReporter.generateReport(demoData.playwright, 'playwright');
    console.log(`   ✅ Legacy report: ${legacyPath}`);

    // 4. Demonstrate CLI Usage
    console.log('\n⌨️  CLI Usage Examples:');
    console.log('   npx @lambdatest/sdk-utils report --enhanced --theme light --open');
    console.log('   npx @lambdatest/sdk-utils report --legacy');
    console.log('   npx @lambdatest/sdk-utils report --no-search --no-filters');
    console.log('   npx @lambdatest/sdk-utils report --watch --open');

    // 5. Feature Summary
    console.log('\n🎯 Enhanced Features Demonstrated:');
    console.log('   ✅ GitHub Primer UI Design System');
    console.log('   ✅ Playwright-style Interface & Layout');
    console.log('   ✅ Real-time Search & Advanced Filtering');
    console.log('   ✅ Interactive Metrics Dashboard');
    console.log('   ✅ Collapsible Session Management');
    console.log('   ✅ Responsive Mobile-Friendly Design');
    console.log('   ✅ Light/Dark Theme Toggle');
    console.log('   ✅ Cross-Framework Support (Appium, Playwright, WebDriverIO)');
    console.log('   ✅ Timeline View & Navigation History');
    console.log('   ✅ Keyboard Shortcuts (Ctrl+K, Escape, etc.)');
    console.log('   ✅ CLI Integration with Feature Toggles');

    // 6. Integration Examples
    console.log('\n🔧 Framework Integration Examples:');
    
    console.log('\n📱 Appium:');
    console.log('   const { EnhancedHtmlReporter } = require("@lambdatest/appium-navigation-tracker");');
    console.log('   const reporter = new EnhancedHtmlReporter({ theme: "light" });');
    console.log('   reporter.generateReport(trackingData, "appium");');

    console.log('\n🌐 Playwright:');
    console.log('   const { generateEnhancedReport } = require("@lambdatest/playwright-driver");');
    console.log('   generateEnhancedReport({ theme: "dark", autoOpen: true });');

    console.log('\n🔄 WebDriverIO:');
    console.log('   const { generateEnhancedReport } = require("@lambdatest/webdriverio-driver");');
    console.log('   generateEnhancedReport({ enableSearch: true, showMetrics: true });');

    // 7. Report Locations
    console.log('\n📍 Generated Demo Reports:');
    reportPaths.forEach(reportPath => {
        console.log(`   📄 ${path.resolve(reportPath)}`);
    });
    console.log(`   📄 ${path.resolve(combinedPath)}`);
    console.log(`   📄 ${path.resolve(legacyPath)}`);

    console.log('\n🎉 Enhanced HTML Reporter Demo Complete!');
    console.log('\n💡 Next Steps:');
    console.log('   1. Open any of the generated reports in your browser');
    console.log('   2. Try the search functionality (Ctrl+K)');
    console.log('   3. Toggle between light/dark themes');
    console.log('   4. Explore the metrics dashboard');
    console.log('   5. Test mobile responsiveness');
    
    return {
        enhancedReports: reportPaths,
        combinedReport: combinedPath,
        legacyReport: legacyPath
    };
}

// Run demo if called directly
if (require.main === module) {
    runCompleteDemo().catch(error => {
        console.error('❌ Demo failed:', error);
        process.exit(1);
    });
}

module.exports = { runCompleteDemo, demoData }; 
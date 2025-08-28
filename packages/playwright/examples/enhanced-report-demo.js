/**
 * Demo script to showcase Enhanced HTML report generation for Playwright URL tracking
 * Run with: node examples/enhanced-report-demo.js
 */

const fs = require('fs');
const path = require('path');

// Import the enhanced HTML reporter
const { EnhancedHtmlReporter, generateEnhancedReport } = require('../index');

async function generateDemoReport() {
    console.log('🎯 LambdaTest Enhanced HTML Reporter Demo (Playwright)');
    console.log('═══════════════════════════════════════════════════════\n');

    // Check if we have existing tracking data
    const trackingFilePath = path.join(__dirname, '../test-results/url-tracking-results.json');
    
    let trackingData;
    
    if (fs.existsSync(trackingFilePath)) {
        console.log('📂 Found existing tracking data, using it for enhanced demo...');
        const fileContent = fs.readFileSync(trackingFilePath, 'utf8');
        trackingData = JSON.parse(fileContent);
    } else {
        console.log('📝 No existing data found, creating demo data...');
        
        // Create realistic demo tracking data for Playwright
        trackingData = [
            {
                metadata: {
                    session_id: `playwright-session-${Date.now()}`,
                    name: 'E2E Navigation Test - playwright-demo.spec.js',
                    build_id: 'build-001'
                },
                navigations: [
                    {
                        spec_file: 'playwright-demo.spec.js',
                        test_name: 'E2E Navigation Test',
                        previous_url: 'null',
                        current_url: 'https://example.com',
                        timestamp: new Date(Date.now() - 10000).toISOString(),
                        navigation_type: 'goto'
                    },
                    {
                        spec_file: 'playwright-demo.spec.js',
                        test_name: 'E2E Navigation Test',
                        previous_url: 'https://example.com',
                        current_url: 'https://example.com/login',
                        timestamp: new Date(Date.now() - 8000).toISOString(),
                        navigation_type: 'link_click'
                    },
                    {
                        spec_file: 'playwright-demo.spec.js',
                        test_name: 'E2E Navigation Test',
                        previous_url: 'https://example.com/login',
                        current_url: 'https://example.com/dashboard',
                        timestamp: new Date(Date.now() - 6000).toISOString(),
                        navigation_type: 'form_submit'
                    },
                    {
                        spec_file: 'playwright-demo.spec.js',
                        test_name: 'E2E Navigation Test',
                        previous_url: 'https://example.com/dashboard',
                        current_url: 'https://example.com/profile',
                        timestamp: new Date(Date.now() - 4000).toISOString(),
                        navigation_type: 'navigation'
                    },
                    {
                        spec_file: 'playwright-demo.spec.js',
                        test_name: 'E2E Navigation Test',
                        previous_url: 'https://example.com/profile',
                        current_url: 'https://example.com/dashboard',
                        timestamp: new Date(Date.now() - 2000).toISOString(),
                        navigation_type: 'back'
                    }
                ],
                session_id: `playwright-session-${Date.now()}`,
                spec_file: 'playwright-demo.spec.js'
            },
            {
                metadata: {
                    session_id: `playwright-session-${Date.now() + 1}`,
                    name: 'Shopping Cart Test - ecommerce.spec.js',
                    build_id: 'build-001'
                },
                navigations: [
                    {
                        spec_file: 'ecommerce.spec.js',
                        test_name: 'Shopping Cart Test',
                        previous_url: 'null',
                        current_url: 'https://shop.example.com',
                        timestamp: new Date(Date.now() - 9000).toISOString(),
                        navigation_type: 'goto'
                    },
                    {
                        spec_file: 'ecommerce.spec.js',
                        test_name: 'Shopping Cart Test',
                        previous_url: 'https://shop.example.com',
                        current_url: 'https://shop.example.com/products/laptop',
                        timestamp: new Date(Date.now() - 7000).toISOString(),
                        navigation_type: 'link_click'
                    },
                    {
                        spec_file: 'ecommerce.spec.js',
                        test_name: 'Shopping Cart Test',
                        previous_url: 'https://shop.example.com/products/laptop',
                        current_url: 'https://shop.example.com/cart',
                        timestamp: new Date(Date.now() - 5000).toISOString(),
                        navigation_type: 'form_submit'
                    },
                    {
                        spec_file: 'ecommerce.spec.js',
                        test_name: 'Shopping Cart Test',
                        previous_url: 'https://shop.example.com/cart',
                        current_url: 'https://shop.example.com/checkout',
                        timestamp: new Date(Date.now() - 3000).toISOString(),
                        navigation_type: 'navigation'
                    }
                ],
                session_id: `playwright-session-${Date.now() + 1}`,
                spec_file: 'ecommerce.spec.js'
            }
        ];
    }

    console.log(`📊 Generating enhanced HTML reports for ${trackingData.length} sessions...\n`);

    try {
        // Generate reports with different themes and features
        const reportConfigs = [
            {
                theme: 'light',
                suffix: 'light',
                title: 'LambdaTest Playwright Tracking Report (Light Theme)',
                enableSearch: true,
                enableFilters: true,
                showMetrics: true,
                showTimeline: true
            },
            {
                theme: 'dark',
                suffix: 'dark',
                title: 'LambdaTest Playwright Tracking Report (Dark Theme)',
                enableSearch: true,
                enableFilters: true,
                showMetrics: true,
                showTimeline: true
            },
            {
                theme: 'light',
                suffix: 'minimal',
                title: 'LambdaTest Playwright Tracking Report (Minimal)',
                enableSearch: false,
                enableFilters: false,
                showMetrics: false,
                showTimeline: false
            }
        ];
        
        for (const config of reportConfigs) {
            console.log(`🎨 Generating ${config.suffix} theme report...`);
            
            const reporter = new EnhancedHtmlReporter({
                outputDir: path.join(__dirname, '../test-results'),
                reportName: `enhanced-tracking-report-${config.suffix}.html`,
                title: config.title,
                theme: config.theme,
                enableKeyboardShortcut: false,
                autoOpen: false,
                enhanced: true,
                enableSearch: config.enableSearch,
                enableFilters: config.enableFilters,
                showMetrics: config.showMetrics,
                showTimeline: config.showTimeline
            });

            const reportPath = reporter.generateReport(trackingData, 'playwright');
            console.log(`✅ ${config.suffix} theme report: ${reportPath}`);
        }

        // Also demonstrate the convenience method
        console.log(`🚀 Generating report using convenience method...`);
        const convenientReportPath = generateEnhancedReport({
            theme: 'light',
            title: 'Playwright Enhanced Report (Convenience Method)',
            autoOpen: false
        });
        
        if (convenientReportPath) {
            console.log(`✅ Convenience method report: ${convenientReportPath}`);
        }

        console.log('\n🎉 Enhanced demo reports generated successfully!');
        console.log('\n📋 What was generated:');
        console.log('   • Light theme report: enhanced-tracking-report-light.html');
        console.log('   • Dark theme report: enhanced-tracking-report-dark.html');
        console.log('   • Minimal report: enhanced-tracking-report-minimal.html');
        console.log('   • Convenience method report: url-tracking-report.html');
        
        console.log('\n🚀 How to view the enhanced reports:');
        console.log('   1. Open the HTML files directly in your browser');
        console.log('   2. Use the CLI: npx lt-report --open');
        console.log('   3. Use auto-detection: npx lt-report');
        
        console.log('\n🎹 Enhanced features in the reports:');
        console.log('   • GitHub Primer UI design system');
        console.log('   • Real-time search and filtering');
        console.log('   • Interactive metrics dashboard');
        console.log('   • Collapsible session details');
        console.log('   • Responsive mobile-friendly design');
        console.log('   • Light/dark theme toggle');
        console.log('   • Keyboard shortcuts (Ctrl+K for search)');
        
        console.log('\n🆚 Comparison with Playwright native reports:');
        console.log('   • Same GitHub Primer UI components');
        console.log('   • Similar color scheme and typography');
        console.log('   • Consistent keyboard shortcuts');
        console.log('   • Cross-framework support (Appium, Playwright, WebDriverIO)');
        
        console.log('\n💡 CLI Commands you can try:');
        console.log('   npx lt-report --help              # Show all options');
        console.log('   npx lt-report --open              # Generate and open report');
        console.log('   npx lt-report --theme dark        # Use dark theme');
        console.log('   npx lt-report --enhanced           # Use enhanced UI (default)');
        console.log('   npx lt-report --legacy             # Use legacy simple UI');
        console.log('   npx lt-report --watch              # Watch for changes');
        
        // Try to open the light theme report automatically if requested
        const shouldOpen = process.argv.includes('--open');
        if (shouldOpen) {
            console.log('\n🌐 Opening light theme report in browser...');
            const open = require('open');
            const reportPath = path.join(__dirname, '../test-results/enhanced-tracking-report-light.html');
            
            try {
                await open(path.resolve(reportPath));
                console.log('✅ Enhanced report opened in browser');
            } catch (error) {
                console.error(`Error opening report: ${error.message}`);
                console.log('You can manually open the report file in your browser');
            }
        }

    } catch (error) {
        console.error(`❌ Error generating enhanced demo report: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

// Add CLI help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
🎯 LambdaTest Enhanced HTML Reporter Demo for Playwright

USAGE:
    node examples/enhanced-report-demo.js [OPTIONS]

OPTIONS:
    --open    Open the generated report in browser
    --help    Show this help message

EXAMPLES:
    node examples/enhanced-report-demo.js
    node examples/enhanced-report-demo.js --open

This enhanced demo will:
1. Look for existing Playwright URL tracking data
2. Generate demo data if none exists
3. Create multiple enhanced reports (light, dark, minimal themes)
4. Showcase GitHub Primer UI design system
5. Demonstrate all interactive features
6. Show you how to use the CLI tools

The enhanced reports feature:
• Real-time search and filtering
• Interactive metrics dashboard
• Collapsible session management
• GitHub Primer UI components
• Responsive mobile design
• Theme toggle functionality
• Keyboard shortcuts
    `);
    process.exit(0);
}

// Run the enhanced demo
generateDemoReport().catch(error => {
    console.error('💥 Enhanced demo failed:', error);
    process.exit(1);
}); 
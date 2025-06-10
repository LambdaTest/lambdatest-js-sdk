/**
 * Demo script to showcase HTML report generation from Appium navigation tracking
 * Run with: node examples/html-report-demo.js
 */

const fs = require('fs');
const path = require('path');

// Import the HTML reporter from local package
const { HtmlReporter } = require('../dist/index.js');

async function generateDemoReport() {
    console.log('🎯 LambdaTest HTML Reporter Demo');
    console.log('═══════════════════════════════════\n');

    // Check if we have existing tracking data
    const trackingFilePath = path.join(__dirname, '../test-results/navigation-tracking.json');
    
    let trackingData;
    
    if (fs.existsSync(trackingFilePath)) {
        console.log('📂 Found existing tracking data, using it for demo...');
        const fileContent = fs.readFileSync(trackingFilePath, 'utf8');
        trackingData = JSON.parse(fileContent);
    } else {
        console.log('📝 No existing data found, creating demo data...');
        
        // Create demo tracking data
        trackingData = {
            spec_file: 'demo-test.spec.js',
            test_name: 'Demo Navigation Test',
            session_id: `demo-session-${Date.now()}`,
            navigations: [
                {
                    previous_screen: '',
                    current_screen: 'App Start',
                    timestamp: new Date(Date.now() - 5000).toISOString(),
                    navigation_type: 'test_start',
                    spec_file: 'demo-test.spec.js',
                    test_name: 'Demo Navigation Test'
                },
                {
                    previous_screen: 'Home Screen',
                    current_screen: 'Color Screen',
                    timestamp: new Date(Date.now() - 4000).toISOString(),
                    navigation_type: 'user_interaction',
                    spec_file: 'demo-test.spec.js',
                    test_name: 'Demo Navigation Test'
                },
                {
                    previous_screen: 'Color Screen',
                    current_screen: 'Text Screen',
                    timestamp: new Date(Date.now() - 3000).toISOString(),
                    navigation_type: 'user_interaction',
                    spec_file: 'demo-test.spec.js',
                    test_name: 'Demo Navigation Test'
                },
                {
                    previous_screen: 'Text Screen',
                    current_screen: 'Home Screen',
                    timestamp: new Date(Date.now() - 2000).toISOString(),
                    navigation_type: 'back_navigation',
                    spec_file: 'demo-test.spec.js',
                    test_name: 'Demo Navigation Test'
                },
                {
                    previous_screen: 'Home Screen',
                    current_screen: 'WebView Screen',
                    timestamp: new Date(Date.now() - 1000).toISOString(),
                    navigation_type: 'user_interaction',
                    spec_file: 'demo-test.spec.js',
                    test_name: 'Demo Navigation Test'
                }
            ],
            timestamp: new Date().toISOString(),
            save_timestamp: new Date().toISOString(),
            navigation_count: 5
        };
    }

    console.log(`📊 Generating HTML report for ${trackingData.navigation_count} navigation events...\n`);

    try {
        // Create HTML reporter with different themes to showcase options
        const themes = ['dark', 'light'];
        
        for (const theme of themes) {
            console.log(`🎨 Generating ${theme} theme report...`);
            
            const reporter = new HtmlReporter({
                outputDir: path.join(__dirname, '../test-results'),
                reportName: `tracking-report-${theme}.html`,
                title: `LambdaTest Appium Navigation Report (${theme.toUpperCase()})`,
                theme: theme,
                enableKeyboardShortcut: false,
                autoOpen: false
            });

            const reportPath = reporter.generateReport(trackingData, 'appium');
            console.log(`✅ ${theme.charAt(0).toUpperCase() + theme.slice(1)} theme report: ${reportPath}`);
        }

        console.log('\n🎉 Demo reports generated successfully!');
        console.log('\n📋 What was generated:');
        console.log('   • Dark theme report: tracking-report-dark.html');
        console.log('   • Light theme report: tracking-report-light.html');
        
        console.log('\n🚀 How to view the reports:');
        console.log('   1. Open the HTML files directly in your browser');
        console.log('   2. Use the CLI: npx lt-report --open');
        console.log('   3. Use auto-detection: npx lt-report');
        
        console.log('\n🎹 Interactive features in the report:');
        console.log('   • Click session headers to expand/collapse details');
        console.log('   • Hover over navigation items for effects');
        console.log('   • Responsive design works on mobile devices');
        console.log('   • Dark/light theme support');
        
        console.log('\n💡 CLI Commands you can try:');
        console.log('   npx lt-report --help              # Show all options');
        console.log('   npx lt-report --open              # Generate and open report');
        console.log('   npx lt-report --theme light       # Use light theme');
        console.log('   npx lt-report --watch              # Watch for changes');
        
        // Try to open the dark theme report automatically
        const shouldOpen = process.argv.includes('--open');
        if (shouldOpen) {
            console.log('\n🌐 Opening dark theme report in browser...');
            const { exec } = require('child_process');
            const reportPath = path.join(__dirname, '../test-results/tracking-report-dark.html');
            
            const command = process.platform === 'win32' ? 'start' :
                           process.platform === 'darwin' ? 'open' : 'xdg-open';
                           
            exec(`${command} "${path.resolve(reportPath)}"`, (error) => {
                if (error) {
                    console.error(`Error opening report: ${error.message}`);
                } else {
                    console.log('✅ Report opened in browser');
                }
            });
        }

    } catch (error) {
        console.error(`❌ Error generating demo report: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

// Add CLI help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
🎯 LambdaTest HTML Reporter Demo

USAGE:
    node examples/html-report-demo.js [OPTIONS]

OPTIONS:
    --open    Open the generated report in browser
    --help    Show this help message

EXAMPLES:
    node examples/html-report-demo.js
    node examples/html-report-demo.js --open

This demo will:
1. Look for existing navigation tracking data
2. Generate demo data if none exists
3. Create both dark and light theme reports
4. Show you how to use the CLI tools
    `);
    process.exit(0);
}

// Run the demo
generateDemoReport().catch(error => {
    console.error('💥 Demo failed:', error);
    process.exit(1);
}); 
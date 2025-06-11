#!/usr/bin/env node

/**
 * Test script to demonstrate the Enhanced HTML Reporter with auto-opening
 * This simulates what happens after Playwright tests complete
 */

const path = require('path');
const fs = require('fs');
const { EnhancedHtmlReporter } = require('../sdk-utils');

console.log('🧪 Testing Enhanced HTML Reporter Auto-Open Experience...\n');

// Simulate Playwright-like test completion with URL tracking data
const mockPlaywrightData = [
    {
        session_id: 'test_session_123',
        metadata: {
            session_id: 'test_session_123',
            spec_file: 'example.spec.js',
            name: 'E-commerce Navigation Test'
        },
        timestamp: new Date().toISOString(),
        navigations: [
            {
                previous_url: 'https://example.com',
                current_url: 'https://example.com/products',
                timestamp: new Date(Date.now() - 10000).toISOString(),
                navigation_type: 'goto',
                test_name: 'E-commerce Navigation Test',
                spec_file: 'example.spec.js'
            },
            {
                previous_url: 'https://example.com/products',
                current_url: 'https://example.com/cart',
                timestamp: new Date(Date.now() - 5000).toISOString(),
                navigation_type: 'navigation',
                test_name: 'E-commerce Navigation Test',
                spec_file: 'example.spec.js'
            },
            {
                previous_url: 'https://example.com/cart',
                current_url: 'https://example.com/checkout',
                timestamp: new Date().toISOString(),
                navigation_type: 'form_submit',
                test_name: 'E-commerce Navigation Test',
                spec_file: 'example.spec.js'
            }
        ]
    }
];

async function testEnhancedReporter() {
    console.log('📊 Creating Enhanced HTML Reporter...');
    
    // Create enhanced reporter with Playwright-like configuration
    const reporter = new EnhancedHtmlReporter({
        outputDir: 'test-results',
        reportName: 'enhanced-demo-report.html',
        title: 'LambdaTest Enhanced URL Tracking Report',
        theme: 'light', // Default to light like Playwright
        autoOpen: true, // Auto-open like Playwright does
        enableKeyboardShortcut: true,
        enableSearch: true,
        enableFilters: true,
        showMetrics: true,
        showTimeline: true
    });

    console.log('🎯 Generating enhanced report...');
    
    try {
        const reportPath = reporter.generateReport(mockPlaywrightData, 'playwright');
        
        console.log('\n🎉 Enhanced HTML Report Generated Successfully!');
        console.log(`📄 Report location: ${path.resolve(reportPath)}`);
        console.log('\n🔍 Enhanced Features:');
        console.log('   ✅ GitHub Primer UI Design System');
        console.log('   ✅ Playwright-style Interface & Layout');
        console.log('   ✅ Real-time Search & Filtering');
        console.log('   ✅ Interactive Metrics Dashboard');
        console.log('   ✅ Responsive Mobile-Friendly Design');
        console.log('   ✅ Light Theme (like Playwright)');
        console.log('   ✅ Auto-Open in Browser');
        
        console.log('\n⌨️  Available Keyboard Shortcuts:');
        console.log('   • Ctrl/Cmd + K: Focus search');
        console.log('   • Escape: Clear search');
        console.log('   • Press "o" to re-open report');
        console.log('   • Press "Ctrl+C" to exit');
        
        console.log('\n🌐 The report should have opened in your browser automatically!');
        console.log('   If not, you can manually open: ' + reportPath);
        
        // Keep the process alive for keyboard shortcuts
        console.log('\n👋 Press Ctrl+C to exit when done exploring the report...');
        
        return reportPath;
        
    } catch (error) {
        console.error('❌ Error generating enhanced report:', error);
        throw error;
    }
}

// Run the test
if (require.main === module) {
    testEnhancedReporter().catch(error => {
        console.error('💥 Test failed:', error);
        process.exit(1);
    });
}

module.exports = { testEnhancedReporter }; 
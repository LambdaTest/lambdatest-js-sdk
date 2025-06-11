#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { HtmlReporter, EnhancedHtmlReporter } = require('./html-reporter');

class ReportCLI {
    constructor() {
        this.args = process.argv.slice(2);
        this.options = this.parseArguments();
    }

    parseArguments() {
        const options = {
            help: false,
            open: false,
            watch: false,
            theme: 'dark', // Default to dark theme
            output: 'test-results',
            title: 'LambdaTest Tracking Report',
            enhanced: true, // Use enhanced version by default
            legacy: false, // Force legacy mode
            showTimeline: true,
            showMetrics: true,
            enableSearch: true,
            enableFilters: true
        };

        for (let i = 0; i < this.args.length; i++) {
            const arg = this.args[i];
            
            switch (arg) {
                case '-h':
                case '--help':
                    options.help = true;
                    break;
                case '-o':
                case '--open':
                    options.open = true;
                    break;
                case '-w':
                case '--watch':
                    options.watch = true;
                    break;
                case '--theme':
                    options.theme = this.args[++i] || 'light';
                    break;
                case '--output':
                    options.output = this.args[++i] || 'test-results';
                    break;
                case '--title':
                    options.title = this.args[++i] || 'LambdaTest Tracking Report';
                    break;
                case '--enhanced':
                    options.enhanced = true;
                    options.legacy = false;
                    break;
                case '--legacy':
                    options.enhanced = false;
                    options.legacy = true;
                    break;
                case '--no-timeline':
                    options.showTimeline = false;
                    break;
                case '--no-metrics':
                    options.showMetrics = false;
                    break;
                case '--no-search':
                    options.enableSearch = false;
                    break;
                case '--no-filters':
                    options.enableFilters = false;
                    break;
                default:
                    if (!arg.startsWith('-')) {
                        options.inputFile = arg;
                    }
                    break;
            }
        }

        return options;
    }

    showHelp() {
        console.log(`
📊 LambdaTest Enhanced HTML Reporter CLI

USAGE:
    npx @lambdatest/sdk-utils report [OPTIONS] [INPUT_FILE]

OPTIONS:
    -h, --help              Show this help message
    -o, --open              Open report in browser after generation  
    -w, --watch             Watch for changes and auto-regenerate
    --theme <theme>         Report theme: 'light' or 'dark' (default: dark)
    --output <dir>          Output directory (default: test-results)
    --title <title>         Report title (default: LambdaTest Tracking Report)
    
REPORT STYLE:
    --enhanced              Use enhanced Playwright-style UI (default)
    --legacy                Use legacy simple UI
    
ENHANCED FEATURES:
    --no-timeline           Disable timeline view
    --no-metrics            Disable metrics dashboard
    --no-search             Disable search functionality
    --no-filters            Disable filter controls

EXAMPLES:
    # Generate enhanced report from auto-detected tracking files
    npx @lambdatest/sdk-utils report
    
    # Generate and open enhanced report
    npx @lambdatest/sdk-utils report --open
    
    # Generate from specific file with dark theme
    npx @lambdatest/sdk-utils report --theme dark path/to/tracking.json
    
    # Use legacy simple UI
    npx @lambdatest/sdk-utils report --legacy
    
    # Watch mode - regenerate on file changes
    npx @lambdatest/sdk-utils report --watch --open

KEYBOARD SHORTCUTS (in enhanced report):
    Ctrl/Cmd + K: Focus search
    Escape: Clear search
    O: Open report in browser (when watching)
    Ctrl+C: Exit

SUPPORTED FRAMEWORKS:
    ✅ Appium (Mobile Navigation Tracking)
    ✅ Playwright (URL Tracking)  
    ✅ WebDriverIO (URL Tracking)

🌐 The enhanced report features:
   • GitHub Primer UI design system
   • Real-time search and filtering
   • Interactive navigation timeline
   • Comprehensive metrics dashboard
   • Responsive mobile-friendly design
   • Dark/light theme toggle
        `);
    }

    async run() {
        if (this.options.help) {
            this.showHelp();
            return;
        }

        console.log('🚀 Starting LambdaTest Enhanced HTML Reporter...\n');

        try {
            await this.generateReport();
            
            if (this.options.watch) {
                await this.startWatchMode();
            } else {
                this.setupKeyboardShortcuts();
            }
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            process.exit(1);
        }
    }

    async generateReport() {
        // Create reporter with enhanced options
        const reporterClass = this.options.enhanced ? EnhancedHtmlReporter : HtmlReporter;
        const reporter = new reporterClass({
            outputDir: this.options.output,
            title: this.options.title,
            theme: this.options.theme,
            autoOpen: this.options.open,
            enableKeyboardShortcut: true,
            enhanced: this.options.enhanced,
            showTimeline: this.options.showTimeline,
            showMetrics: this.options.showMetrics,
            enableSearch: this.options.enableSearch,
            enableFilters: this.options.enableFilters
        });

        let reportPath;

        if (this.options.inputFile) {
            // Generate from specific file
            console.log(`📁 Reading tracking data from: ${this.options.inputFile}`);
            
            if (!fs.existsSync(this.options.inputFile)) {
                throw new Error(`Input file not found: ${this.options.inputFile}`);
            }

            const fileContent = fs.readFileSync(this.options.inputFile, 'utf8');
            const trackingData = JSON.parse(fileContent);
            
            // Detect framework from file structure or name
            let framework = 'unknown';
            if (this.options.inputFile.includes('navigation-tracking')) {
                framework = 'appium';
            } else if (this.options.inputFile.includes('url-tracking')) {
                framework = trackingData.some?.(session => session.metadata) ? 'playwright' : 'webdriverio';
            }

            reportPath = reporter.generateReport(trackingData, framework);
        } else {
            // Auto-detect and generate from all tracking files
            console.log('🔍 Auto-detecting tracking files...');
            
            if (this.options.enhanced) {
                reportPath = EnhancedHtmlReporter.generateFromFiles({
                    outputDir: this.options.output,
                    title: this.options.title,
                    theme: this.options.theme,
                    autoOpen: this.options.open,
                    enableKeyboardShortcut: true,
                    enhanced: true,
                    showTimeline: this.options.showTimeline,
                    showMetrics: this.options.showMetrics,
                    enableSearch: this.options.enableSearch,
                    enableFilters: this.options.enableFilters
                });
            } else {
                reportPath = HtmlReporter.generateFromFiles({
                    outputDir: this.options.output,
                    title: this.options.title,
                    theme: this.options.theme,
                    autoOpen: this.options.open,
                    enableKeyboardShortcut: true,
                    enhanced: false
                });
            }
        }

        if (reportPath) {
            console.log(`\n✅ ${this.options.enhanced ? 'Enhanced' : 'Legacy'} report generated successfully!`);
            console.log(`📄 Report location: ${path.resolve(reportPath)}`);
            
            if (this.options.enhanced) {
                console.log('\n🎯 Enhanced features available:');
                console.log('   • GitHub Primer UI design');
                console.log('   • Real-time search and filtering');
                console.log('   • Interactive metrics dashboard');
                console.log('   • Responsive mobile design');
                console.log('   • Dark/light theme toggle');
            }
            
            if (this.options.open) {
                console.log('🌐 Opening in browser...');
            }
        } else {
            console.log('⚠️  No tracking data found to generate report');
        }

        return reportPath;
    }

    async startWatchMode() {
        console.log('\n👀 Watch mode enabled - monitoring tracking files for changes...');
        console.log('Press Ctrl+C to stop watching\n');

        const trackingFiles = this.getTrackingFiles();
        
        if (trackingFiles.length === 0) {
            console.log('⚠️  No tracking files found to watch');
            return;
        }

        // Watch all tracking files
        trackingFiles.forEach(filePath => {
            fs.watchFile(filePath, { interval: 1000 }, (curr, prev) => {
                if (curr.mtime > prev.mtime) {
                    console.log(`\n📝 Detected change in: ${filePath}`);
                    console.log('🔄 Regenerating report...');
                    
                    this.generateReport().catch(error => {
                        console.error(`❌ Error regenerating report: ${error.message}`);
                    });
                }
            });
            
            console.log(`📌 Watching: ${filePath}`);
        });

        // Keep process alive
        process.stdin.resume();
    }

    getTrackingFiles() {
        const possibleFiles = [
            'test-results/navigation-tracking.json',
            'test-results/url-tracking.json', 
            'test-results/url-tracking-results.json',
            'tests-results/navigation-tracking.json',
            'tests-results/url-tracking.json',
            'tests-results/url-tracking-results.json'
        ];
        
        return possibleFiles.filter(filePath => {
            return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
        });
    }

    setupKeyboardShortcuts() {
        if (!process.stdin.isTTY) return;
        
        console.log('\n⌨️  Keyboard shortcuts enabled:');
        console.log('   Press "o" to open report in browser');
        console.log('   Press "Ctrl+C" to exit\n');
        
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        
        process.stdin.on('data', (key) => {
            // ctrl-c ( end of text )
            if (key === '\u0003') {
                console.log('\nExiting...');
                process.exit();
            }
            
            // 'o' key to open report
            if (key.toLowerCase() === 'o') {
                this.openInBrowser();
            }
        });
        
        // Cleanup on exit
        process.on('exit', () => {
            if (process.stdin.setRawMode) {
                process.stdin.setRawMode(false);
            }
            process.stdin.pause();
        });
    }

    async openInBrowser() {
        const reportPath = path.join(this.options.output, 'url-tracking-report.html');
        
        if (!fs.existsSync(reportPath)) {
            console.error('❌ Report file not found');
            return;
        }
        
        try {
            const open = require('open');
            await open(reportPath);
            console.log('🌐 Opened report in browser');
        } catch (error) {
            console.error(`❌ Failed to open browser: ${error.message}`);
        }
    }
}

// Run CLI if this file is executed directly
if (require.main === module) {
    const cli = new ReportCLI();
    cli.run().catch(error => {
        console.error('💥 CLI Error:', error);
        process.exit(1);
    });
}

module.exports = ReportCLI; 
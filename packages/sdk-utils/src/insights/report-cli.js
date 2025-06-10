#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const HtmlReporter = require('./html-reporter');

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
            theme: 'dark',
            output: 'test-results',
            title: 'LambdaTest Tracking Report'
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
                    options.theme = this.args[++i] || 'dark';
                    break;
                case '--output':
                    options.output = this.args[++i] || 'test-results';
                    break;
                case '--title':
                    options.title = this.args[++i] || 'LambdaTest Tracking Report';
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
📊 LambdaTest HTML Reporter CLI

USAGE:
    npx @lambdatest/sdk-utils report [OPTIONS] [INPUT_FILE]

OPTIONS:
    -h, --help              Show this help message
    -o, --open              Open report in browser after generation  
    -w, --watch             Watch for changes and auto-regenerate
    --theme <theme>         Report theme: 'dark' or 'light' (default: dark)
    --output <dir>          Output directory (default: test-results)
    --title <title>         Report title (default: LambdaTest Tracking Report)

EXAMPLES:
    # Generate report from auto-detected tracking files
    npx @lambdatest/sdk-utils report
    
    # Generate and open report
    npx @lambdatest/sdk-utils report --open
    
    # Generate from specific file with custom theme
    npx @lambdatest/sdk-utils report --theme light path/to/tracking.json
    
    # Watch mode - regenerate on file changes
    npx @lambdatest/sdk-utils report --watch --open

KEYBOARD SHORTCUTS (when report is running):
    Ctrl+Shift+O: Open report in browser
    Ctrl+Shift+R: Refresh report
    Ctrl+C: Exit

🌐 The report will be saved as 'tracking-report.html' in the output directory.
        `);
    }

    async run() {
        if (this.options.help) {
            this.showHelp();
            return;
        }

        console.log('🚀 Starting LambdaTest HTML Reporter...\n');

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
        const reporter = new HtmlReporter({
            outputDir: this.options.output,
            title: this.options.title,
            theme: this.options.theme,
            autoOpen: this.options.open,
            enableKeyboardShortcut: true
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
            reportPath = HtmlReporter.generateFromFiles({
                outputDir: this.options.output,
                title: this.options.title,
                theme: this.options.theme,
                autoOpen: this.options.open,
                enableKeyboardShortcut: true
            });
        }

        if (reportPath) {
            console.log(`\n✅ Report generated successfully!`);
            console.log(`📄 Report location: ${path.resolve(reportPath)}`);
            
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

        // Keep the process running
        this.setupKeyboardShortcuts();
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
        console.log('\n🎹 Keyboard shortcuts:');
        console.log('   • Ctrl+Shift+O: Open report in browser');
        console.log('   • Ctrl+Shift+R: Regenerate report');  
        console.log('   • Ctrl+C: Exit');
        console.log('\nPress any key combination above...');

        // Setup keyboard listener
        if (process.stdin.setRawMode) {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.setEncoding('utf8');
            
            process.stdin.on('data', async (key) => {
                // Ctrl+C to exit
                if (key === '\x03') {
                    console.log('\n👋 Goodbye!');
                    process.exit(0);
                }
                
                // Ctrl+Shift+O to open report (approximation)
                if (key === '\x0F') {
                    const reportPath = path.join(this.options.output, 'tracking-report.html');
                    if (fs.existsSync(reportPath)) {
                        console.log('\n🌐 Opening report in browser...');
                        this.openInBrowser(reportPath);
                    } else {
                        console.log('\n⚠️  Report not found. Generate it first.');
                    }
                }
                
                // Ctrl+Shift+R to regenerate (approximation)
                if (key === '\x12') {
                    console.log('\n🔄 Regenerating report...');
                    try {
                        await this.generateReport();
                    } catch (error) {
                        console.error(`❌ Error: ${error.message}`);
                    }
                }
            });
        }

        // Keep process alive
        process.stdin.resume();
    }

    openInBrowser(reportPath) {
        const { spawn } = require('child_process');
        const command = process.platform === 'win32' ? 'start' :
                       process.platform === 'darwin' ? 'open' : 'xdg-open';
                       
        spawn(command, [path.resolve(reportPath)], { 
            detached: true, 
            stdio: 'ignore' 
        }).unref();
    }
}

// Run CLI if this file is executed directly
if (require.main === module) {
    const cli = new ReportCLI();
    cli.run().catch(error => {
        console.error(`❌ Fatal error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = ReportCLI; 
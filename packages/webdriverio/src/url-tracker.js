const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

// Create a unique run ID for this process
const PROCESS_RUN_ID = Date.now().toString() + '-' + Math.random().toString(36).substring(2, 15);
console.log(`[UrlTracker] PROCESS_RUN_ID: ${PROCESS_RUN_ID}`);

// Reset static flag for this process - intentionally setting to false
let hasResetFileInThisProcess = false;

class UrlTracker extends EventEmitter {
    constructor(browser, options = {}) {
        super();
        this.browser = browser;
        this.options = {
            trackHistory: true,
            outputDirectory: 'test-results',
            outputFilename: 'url-tracking.json',
            resetFileOnStart: true,
            enableLogging: true,
            ...options
        };
        
        this.navigationHistory = [];
        this.currentUrl = '';
        this.isInitialized = false;
        this.sessionId = '';
        this.currentSpecFile = '';
        this.currentTestName = '';
        
        // Navigation type mapping
        this.navigationTypeMap = {
            'goto': 'goto',
            'navigation': 'navigation',
            'back': 'back',
            'forward': 'forward',
            'reload': 'refresh',
            'pushstate': 'spa_route',
            'replacestate': 'spa_replace',
            'hashchange': 'hash_change',
            'click': 'link_click',
            'form': 'form_submit',
            'redirect': 'redirect',
            'popstate': 'popstate',
            'load': 'page_load',
            'domcontentloaded': 'dom_ready',
            'networkidle': 'network_idle',
            'timeout': 'timeout',
            'final': 'final',
            'manual': 'manual_record',
            'fallback': 'fallback',
            'dummy': 'dummy',
            'command': 'command'
        };
        
        // Always clear tracking file on startup if enabled
        if (this.options.resetFileOnStart) {
            this.clearTrackingFile();
        }
    }

    log(message) {
        console.log(`[UrlTracker] ${message}`);
    }
    
    /**
     * Clear tracking file at startup
     */
    clearTrackingFile() {
        try {
            this.log('Clearing tracking file...');
            const outputDir = this.options.outputDirectory || 'test-results';
            const outputFilename = this.options.outputFilename || 'url-tracking.json';
            
            // Create directory if needed
            const fullOutputDir = path.resolve(process.cwd(), outputDir);
            if (!fs.existsSync(fullOutputDir)) {
                this.log(`Creating output directory: ${fullOutputDir}`);
                fs.mkdirSync(fullOutputDir, { recursive: true });
            }
            
            // Check and delete file
            const outputPath = path.resolve(fullOutputDir, outputFilename);
            this.log(`Clearing tracking file at: ${outputPath}`);
            
            if (fs.existsSync(outputPath)) {
                try {
                    fs.unlinkSync(outputPath);
                    this.log('Existing tracking file deleted');
                } catch (e) {
                    this.log(`Error deleting file: ${e.message}`);
                    // Try alternate method
                    fs.writeFileSync(outputPath, '[]', {flag: 'w'});
                    this.log('Tracking file emptied via write');
                }
            }
            
            // Create empty file
            fs.writeFileSync(outputPath, '[]', 'utf8');
            this.log('Empty tracking file created');
            
            return true;
        } catch (error) {
            this.log(`Error clearing tracking file: ${error.message}`);
            console.error(error);
            return false;
        }
    }

    /**
     * Initialize the URL tracker
     */
    async init() {
        if (this.isInitialized) {
            return;
        }

        this.log('Initializing URL Tracker...');

        // Try to get initial URL
        try {
            // Just get URL directly - simplest approach that works everywhere
            const url = await this.browser.getUrl();
            this.currentUrl = url || '';
            this.log(`Initial URL: ${this.currentUrl}`);
            
            // Record initial page
            if (this.currentUrl && this.currentUrl !== 'about:blank') {
                this.handleUrlChange(this.currentUrl, 'initial');
            }

            // Get session ID if available
            if (this.browser.sessionId) {
                this.sessionId = this.browser.sessionId;
                this.log(`Session ID: ${this.sessionId}`);
            }
        } catch (error) {
            this.log(`Error during initialization: ${error.message}`);
        }

        this.isInitialized = true;
    }

    setTestContext(specFile, testName) {
        this.currentSpecFile = specFile;
        this.currentTestName = testName;
        this.log(`Test context set: ${specFile} - ${testName}`);
    }

    setSpecFile(specFile) {
        this.currentSpecFile = specFile;
        this.log(`Spec file set: ${specFile}`);
    }

    normalizeUrl(url) {
        if (!url) return '';
        
        // Handle relative URLs
        if (url.startsWith('/')) {
            return url;
        }
        
        // Remove trailing slashes for consistency
        return url.replace(/\/$/, '');
    }

    handleUrlChange(newUrl, type, command) {
        const timestamp = new Date().toISOString();
        
        // Skip if no URL
        if (!newUrl) return;
        
        // Normalize URLs
        const normalizedCurrentUrl = this.normalizeUrl(this.currentUrl);
        const normalizedNewUrl = this.normalizeUrl(newUrl);
        
        // Skip if URL hasn't actually changed
        if (normalizedCurrentUrl === normalizedNewUrl && type !== 'final') {
            return;
        }
        
        // Determine navigation type based on available info
        let navigationType = this.navigationTypeMap[type] || 'fallback';
        
        // Create navigation event
        const navigationEvent = {
            previous_url: this.currentUrl,
            current_url: newUrl,
            timestamp,
            navigation_type: navigationType
        };
        
        // Add to history
        this.navigationHistory.push(navigationEvent);
        
        // Update current URL
        this.currentUrl = newUrl;
        
        this.log(`URL change recorded: ${navigationType} - ${navigationEvent.previous_url} -> ${newUrl}`);
        
        // Emit event with full context for event listeners
        const eventWithContext = {
            ...navigationEvent,
            spec_file: this.currentSpecFile,
            test_name: this.currentTestName
        };
        this.emit('urlChange', eventWithContext);
    }

    getNavigationHistory() {
        return this.navigationHistory;
    }

    getCurrentUrl() {
        return this.currentUrl;
    }

    clearHistory() {
        this.navigationHistory = [];
    }

    /**
     * Get current URL directly from browser
     */
    async refreshCurrentUrl() {
        try {
            const url = await this.browser.getUrl();
            if (url && url !== this.currentUrl) {
                this.handleUrlChange(url, 'refresh');
            }
            return url;
        } catch (error) {
            this.log(`Error getting current URL: ${error.message}`);
            return this.currentUrl;
        }
    }

    saveReport() {
        try {
            if (this.navigationHistory.length === 0) {
                this.log('No navigation history to save');
                return;
            }
            
            // Ensure we have basic test info
            if (!this.currentSpecFile) {
                this.currentSpecFile = this.getCurrentTestFile() || 'unknown.js';
            }
            
            if (!this.currentTestName) {
                this.currentTestName = 'Unknown Test';
            }
            
            const outputDir = this.options.outputDirectory || 'test-results';
            const outputFilename = this.options.outputFilename || 'url-tracking.json';
            
            // Generate the report
            const report = {
                spec_file: this.currentSpecFile,
                test_name: this.currentTestName,
                session_id: this.sessionId,
                navigations: this.navigationHistory,
                timestamp: new Date().toISOString(),
                save_timestamp: new Date().toISOString(),
                navigation_count: this.navigationHistory.length
            };
            
            // Ensure directory exists
            const fullOutputDir = path.resolve(process.cwd(), outputDir);
            if (!fs.existsSync(fullOutputDir)) {
                this.log(`Creating output directory: ${fullOutputDir}`);
                fs.mkdirSync(fullOutputDir, { recursive: true });
            }
            
            const outputPath = path.resolve(fullOutputDir, outputFilename);
            this.log(`Saving report to: ${outputPath}`);
            
            // Read existing data (if any)
            let existingData = [];
            try {
                if (fs.existsSync(outputPath)) {
                    const fileContent = fs.readFileSync(outputPath, 'utf8');
                    if (fileContent.trim() !== '') {
                        try {
                            existingData = JSON.parse(fileContent);
                            if (!Array.isArray(existingData)) {
                                existingData = [];
                            }
                        } catch (e) {
                            existingData = [];
                        }
                    }
                }
            } catch (e) {
                this.log(`Error reading tracking file: ${e.message}`);
                existingData = [];
            }
            
            // Add new report
            existingData.push(report);
            
            // Write to file
            try {
                fs.writeFileSync(outputPath, JSON.stringify(existingData, null, 2), 'utf8');
                this.log(`Report saved with ${report.navigation_count} navigation events`);
            } catch (e) {
                this.log(`Error writing to tracking file: ${e.message}`);
                console.error(e);
            }
        } catch (error) {
            this.log(`Error saving report: ${error.message}`);
            console.error(error);
        }
    }

    getCurrentTestFile() {
        // Try to extract from Error stack
        try {
            const stack = new Error().stack;
            const stackLines = stack.split('\n');
            
            for (const line of stackLines) {
                if (line.includes('.spec.') || line.includes('.test.')) {
                    const match = line.match(/[\\/]([^\\/]+\.(spec|test)\.[jt]s)/);
                    if (match && match[1]) {
                        return match[1];
                    }
                }
            }
        } catch (error) {
            this.log(`Error getting test file from stack: ${error.message}`);
        }
        
        return undefined;
    }

    /**
     * Capture URL before test exit
     */
    async onBeforeExit() {
        this.log('Finalizing test data before exit');
        
        // Just get the final URL directly
        try {
            const finalUrl = await this.browser.getUrl();
            if (finalUrl) {
                this.handleUrlChange(finalUrl, 'final');
            }
        } catch (error) {
            this.log(`Error getting final URL: ${error.message}`);
        }
        
        // Save the report
        this.saveReport();
    }

    destroy() {
        this.log('Destroying URL Tracker...');
        
        // Collect and save final navigation data
        this.onBeforeExit().then(() => {
            // Clear event listeners
            this.removeAllListeners();
            this.isInitialized = false;
            this.log('Cleanup complete');
        });
    }

    recordNavigation(url, type = 'manual_record', details = 'user_recorded') {
        this.log(`Manually recording navigation to ${url} (${type})`);
        this.handleUrlChange(url, type, details);
    }

    recordFinalUrl() {
        if (this.currentUrl) {
            this.log(`Recording final URL: ${this.currentUrl}`);
            this.handleUrlChange(this.currentUrl, 'final', 'test_end');
        }
    }
}

module.exports = UrlTracker; 
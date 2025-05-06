const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class UrlTracker extends EventEmitter {
    constructor(browser, options = {}) {
        super();
        this.browser = browser;
        this.options = {
            trackHistory: true,
            trackHashChanges: true,
            trackPushState: true,
            autoTrack: true,
            outputDirectory: 'test-results',
            outputFilename: 'url-tracking.json',
            resetFileOnStart: true,
            ...options
        };
        
        this.navigationHistory = [];
        this.currentUrl = '';
        this.isInitialized = false;
        this.commandListener = () => {};
        this.lastCheckedUrl = '';
        this.checkInterval = null;
        this.lastEventTime = 0;
        this.DEBOUNCE_TIME = 50;
        this.sessionId = '';
        this.currentSpecFile = '';
        this.currentTestName = '';
        
        // Navigation type mapping
        this.navigationTypeMap = {
            'goto': 'goto',               // Direct navigation via URL command
            'navigation': 'navigation',   // General navigation event
            'back': 'back',               // Browser back button
            'forward': 'forward',         // Browser forward button
            'reload': 'refresh',          // Page refresh
            'pushstate': 'spa_route',     // SPA route change via history.pushState
            'replacestate': 'spa_replace', // SPA route replacement via history.replaceState
            'hashchange': 'hash_change',  // URL hash change
            'click': 'link_click',        // Navigation from clicking a link
            'form': 'form_submit',        // Navigation from form submission
            'redirect': 'redirect',       // Server or client-side redirect
            'popstate': 'popstate',       // Browser history navigation (back/forward)
            'load': 'page_load',          // Initial page load
            'domcontentloaded': 'dom_ready', // DOM content loaded
            'networkidle': 'network_idle', // Network becomes idle
            'timeout': 'timeout',         // Navigation timeout
            'final': 'final',             // Final URL at test end
            'manual': 'manual_record',    // Manually recorded navigation
            'fallback': 'fallback',       // Fallback navigation record
            'dummy': 'dummy',             // Dummy placeholder
            'command': 'command'          // WebdriverIO command
        };
        
        // Track pending navigation
        this.pendingNavigationInfo = null;
        
        // Will be updated with the actual session ID once available
        this.sessionId = `pending_${Date.now()}`;
    }

    async init() {
        if (this.isInitialized) {
            return;
        }

        console.log('Initializing URL Tracker...');

        try {
            const outputDir = this.options.outputDirectory || 'test-results';
            // Ensure the directory exists
            if (!fs.existsSync(path.join(process.cwd(), outputDir))) {
                fs.mkdirSync(path.join(process.cwd(), outputDir), { recursive: true });
                console.log(`Created directory: ${path.join(process.cwd(), outputDir)}`);
            }
        } catch (error) {
            console.error('Error checking output directory:', error);
        }

        // Get browser's actual session ID
        try {
            if (this.browser.sessionId) {
                this.sessionId = this.browser.sessionId;
                console.log('Using browser session ID:', this.sessionId);
            } else {
                console.log('Browser session ID not immediately available, will try to get it later');
                
                if (this.browser.capabilities && this.browser.capabilities.sessionId) {
                    this.sessionId = this.browser.capabilities.sessionId;
                    console.log('Using session ID from capabilities:', this.sessionId);
                }
            }
        } catch (error) {
            console.error('Error getting browser session ID:', error);
        }

        // Get initial URL and record it as a navigation
        try {
            const initialUrl = await this.browser.getUrl();
            this.currentUrl = typeof initialUrl === 'string' ? initialUrl : initialUrl[0];
            this.lastCheckedUrl = this.currentUrl;
            
            console.log('Initial URL detected:', this.currentUrl);
            
            // Record initial URL as a navigation event if it's not about:blank
            if (this.currentUrl && this.currentUrl !== 'about:blank') {
                console.log('Recording initial URL as navigation event:', this.currentUrl);
                this.handleUrlChange(this.currentUrl, 'navigation', 'initial');
            }
        } catch (error) {
            console.error('Error getting initial URL:', error);
        }

        // Initialize browser-side event listeners
        try {
            await this.browser.execute(() => {
                console.log('Setting up URL tracking in browser context');
                
                // Create a custom event for URL changes
                const dispatchUrlChange = (type, url, details) => {
                    console.log('Browser context: URL change detected:', type, url);
                    // Store the URL change directly as a property on window
                    window.wdioUrlChange = { type, url, details };
                    
                    // Also dispatch as an event
                    const event = new CustomEvent('wdio:urlChange', {
                        detail: { type, url, details }
                    });
                    window.dispatchEvent(event);
                };

                // Allow Node.js context to check current URL 
                window.getCurrentUrl = () => window.location.href;

                // Track navigation events
                if (!window._wdioUrlTrackingInitialized) {
                    // Track hash changes
                    window.addEventListener('hashchange', function(event) {
                        const oldUrl = event.oldURL || '';
                        const newUrl = event.newURL || window.location.href;
                        console.log('Hash change detected:', oldUrl, '->', newUrl);
                        dispatchUrlChange('hashchange', newUrl, { oldUrl });
                    });

                    // Store original history methods
                    const originalPushState = history.pushState;
                    const originalReplaceState = history.replaceState;

                    // Override history.pushState
                    history.pushState = function(data, unused, url) {
                        const result = originalPushState.apply(this, arguments);
                        const newUrl = typeof url === 'string' ? url : url ? url.toString() : window.location.href;
                        console.log('pushState called with URL:', newUrl);
                        dispatchUrlChange('pushstate', window.location.href, { data });
                        return result;
                    };

                    // Override history.replaceState
                    history.replaceState = function(data, unused, url) {
                        const result = originalReplaceState.apply(this, arguments);
                        const newUrl = typeof url === 'string' ? url : url ? url.toString() : window.location.href;
                        console.log('replaceState called with URL:', newUrl);
                        dispatchUrlChange('replacestate', window.location.href, { data });
                        return result;
                    };

                    // Track popstate events
                    window.addEventListener('popstate', function(event) {
                        console.log('Popstate event detected');
                        dispatchUrlChange('popstate', window.location.href, { state: event.state });
                    });

                    window._wdioUrlTrackingInitialized = true;
                    console.log('URL tracking initialized in browser context');
                }
            });
        } catch (error) {
            console.error('Error setting up browser event listeners:', error);
        }

        // Set up polling to check for URL changes
        this.checkInterval = setInterval(async () => {
            try {
                await this.refreshCurrentUrl();
            } catch (error) {
                console.error('Error refreshing URL in interval:', error);
            }
        }, 1000);  // Check every second

        this.isInitialized = true;
        console.log('URL Tracker initialization complete');
    }

    setTestContext(specFile, testName) {
        this.currentSpecFile = specFile;
        this.currentTestName = testName;
        console.log(`URL Tracker - Test context set: ${specFile} - ${testName}`);
    }

    setSpecFile(specFile) {
        this.currentSpecFile = specFile;
        console.log(`URL Tracker - Spec file set: ${specFile}`);
    }

    normalizeUrl(url) {
        if (!url) return '';
        
        // Handle relative URLs
        if (url.startsWith('/')) {
            // TODO: Resolve relative to base URL if known
            return url;
        }
        
        // Remove trailing slashes for consistency
        return url.replace(/\/$/, '');
    }

    handleUrlChange(newUrl, type, command) {
        const now = Date.now();
        const timestamp = new Date().toISOString();
        
        // Skip if too close to last event (debounce)
        if (now - this.lastEventTime < this.DEBOUNCE_TIME) {
            return;
        }
        
        this.lastEventTime = now;
        
        // Normalize URLs
        const normalizedCurrentUrl = this.normalizeUrl(this.currentUrl);
        const normalizedNewUrl = this.normalizeUrl(newUrl);
        
        // Skip if URL hasn't actually changed
        if (normalizedCurrentUrl === normalizedNewUrl && type !== 'final') {
            return;
        }
        
        // Determine navigation type based on available info
        let navigationType = this.navigationTypeMap[type] || 'fallback';
        
        // Check pending navigation info
        if (this.pendingNavigationInfo && 
            (now - this.pendingNavigationInfo.timestamp < 2000)) {
            navigationType = this.navigationTypeMap[this.pendingNavigationInfo.type] || navigationType;
            this.pendingNavigationInfo = null;
        }
        
        // Create navigation event - IMPORTANT: Don't include spec_file and test_name
        // These will be added at the report level only
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
        this.lastCheckedUrl = newUrl;
        
        console.log(`URL change recorded: ${navigationType} - ${this.currentUrl} -> ${newUrl}`);
        
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

    saveReport() {
        try {
            // Ensure we have the latest test context
            this.updateTestInfoFromAvailableSources();
            
            if (this.navigationHistory.length === 0) {
                console.log('No navigation history to save');
                return;
            }
            
            const outputDir = this.options.outputDirectory || 'test-results';
            const outputPath = path.join(process.cwd(), outputDir, this.options.outputFilename || 'url-tracking.json');
            
            // Generate the report with clean navigations
            // Navigation events already don't have spec_file and test_name
            // as we removed them in handleUrlChange
            const report = {
                spec_file: this.currentSpecFile || 'unknown.js',
                test_name: this.currentTestName || 'Unknown Test',
                session_id: this.sessionId,
                navigations: this.navigationHistory,
                timestamp: new Date().toISOString(),
                save_timestamp: new Date().toISOString(),
                navigation_count: this.navigationHistory.length
            };
            
            // Check if file exists and read existing data
            let existingData = [];
            if (fs.existsSync(outputPath)) {
                try {
                    const fileContent = fs.readFileSync(outputPath, 'utf8');
                    existingData = JSON.parse(fileContent);
                    
                    if (!Array.isArray(existingData)) {
                        console.warn('Existing data is not an array, overwriting');
                        existingData = [];
                    }
                } catch (error) {
                    console.error('Error reading existing tracking file:', error);
                    existingData = [];
                }
            }
            
            // Check for duplicate reports (same session) and replace if found
            const sessionIndex = existingData.findIndex(
                existingReport => existingReport.session_id === report.session_id
            );
            
            if (sessionIndex >= 0) {
                console.log(`Updating existing report for session ${report.session_id}`);
                existingData[sessionIndex] = report;
            } else {
                // Add new report to existing data
                existingData.push(report);
            }
            
            // Write back to file
            fs.writeFileSync(outputPath, JSON.stringify(existingData, null, 2), 'utf8');
            console.log(`URL tracking report saved to ${outputPath} with ${report.navigation_count} events`);
            
        } catch (error) {
            console.error('Error saving URL tracking report:', error);
        }
    }

    updateTestInfoFromAvailableSources() {
        // Try to get test info from global object if available
        if (typeof global !== 'undefined' && 
            global.currentTestInfo && 
            global.currentTestInfo.file) {
            
            if (!this.currentSpecFile && global.currentTestInfo.file) {
                this.currentSpecFile = global.currentTestInfo.file;
            }
            
            if (!this.currentTestName && global.currentTestInfo.name) {
                this.currentTestName = global.currentTestInfo.name;
            }
        }
        
        // If we still don't have a spec file, try to extract from current URL
        if (!this.currentSpecFile) {
            this.currentSpecFile = this.getCurrentTestFile() || 'unknown.js';
        }
        
        // If we still don't have a test name, use a default
        if (!this.currentTestName) {
            this.currentTestName = 'Unknown Test';
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
            console.error('Error getting current test file from stack:', error);
        }
        
        return undefined;
    }

    async refreshCurrentUrl() {
        try {
            const url = await this.browser.getUrl();
            const newUrl = typeof url === 'string' ? url : url[0];
            
            if (newUrl !== this.lastCheckedUrl) {
                console.log(`URL changed in poll: ${this.lastCheckedUrl} -> ${newUrl}`);
                this.handleUrlChange(newUrl, 'fallback');
            }
            
            return newUrl;
        } catch (error) {
            console.error('Error refreshing current URL:', error);
            return this.currentUrl;
        }
    }

    async onBeforeExit() {
        // Record final URL before exiting
        this.recordFinalUrl();
        
        // Save the report
        this.saveReport();
    }

    destroy() {
        console.log('Destroying URL Tracker...');
        
        // Clear interval
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        
        // Save final report
        this.saveReport();
        
        // Clear event listeners
        this.removeAllListeners();
        
        this.isInitialized = false;
    }

    recordNavigation(url, type = 'manual_record', details = 'user_recorded') {
        console.log(`Manually recording navigation to ${url} (${type})`);
        this.handleUrlChange(url, type, details);
    }

    recordFinalUrl() {
        // Only if we have a current URL
        if (this.currentUrl) {
            console.log('Recording final URL:', this.currentUrl);
            this.handleUrlChange(this.currentUrl, 'final', 'test_end');
        }
    }
}

module.exports = UrlTracker; 
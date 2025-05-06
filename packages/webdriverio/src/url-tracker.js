const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

// Global flag to track if file has been reset in this process
let fileResetCompleted = false;

// Function to reset tracking file when module is first loaded
function resetTrackingFileOnLoad() {
    console.log('[UrlTracker] Module loaded - resetting tracking file');
    const outputDir = 'test-results';
    const outputFilename = 'url-tracking.json';
    
    try {
        // Create directory if needed
        const fullOutputDir = path.resolve(process.cwd(), outputDir);
        if (!fs.existsSync(fullOutputDir)) {
            console.log(`[UrlTracker] Creating output directory: ${fullOutputDir}`);
            fs.mkdirSync(fullOutputDir, { recursive: true });
        }
        
        // Delete and recreate file
        const outputPath = path.resolve(fullOutputDir, outputFilename);
        console.log(`[UrlTracker] Resetting tracking file at module load: ${outputPath}`);
        
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
            console.log('[UrlTracker] Existing tracking file deleted');
        }
        
        fs.writeFileSync(outputPath, '[]', 'utf8');
        console.log('[UrlTracker] New empty tracking file created at module load');
        
        return true;
    } catch (error) {
        console.log(`[UrlTracker] Error resetting file on module load: ${error.message}`);
        return false;
    }
}

// Reset tracking file immediately when module is loaded
resetTrackingFileOnLoad();

class UrlTracker extends EventEmitter {
    constructor(browser, options = {}) {
        super();
        // Note: browser is no longer used - just kept for backward compatibility
        this.options = {
            trackHistory: true,
            outputDirectory: 'test-results',
            outputFilename: 'url-tracking.json',
            resetFileOnStart: true,
            enableLogging: true,
            ...options
        };
        
        // Override resetFileOnStart to true regardless of options passed
        this.options.resetFileOnStart = true;
        
        this.navigationHistory = [];
        this.currentUrl = '';
        this.isInitialized = false;
        this.sessionId = '';
        this.currentSpecFile = '';
        this.currentTestName = '';
        this.hasRecordedFinalUrl = false;
        this.hasSavedReport = false;
        this.trackerInstalled = false;
        
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
            'command': 'command',
            'initial': 'initial'
        };
        
        // Always reset global flag and delete file on startup
        fileResetCompleted = false;
        this.log('FORCE DELETING TRACKING FILE on construction');
        this.forceDeleteTrackingFile();
    }

    log(message) {
        if (this.options.enableLogging) {
            console.log(`[UrlTracker] ${message}`);
        }
    }
    
    /**
     * Get a pure JavaScript tracking script to inject
     * This must be manually injected via a service
     */
    getBrowserTrackingScript() {
        return `
        // Pure browser-side URL tracking script - NO WebDriverIO dependencies
        (function() {
            console.log('[UrlTracker] Installing pure browser URL tracking');
            
            // Initialize tracking object if it doesn't exist
            if (!window.__lambdaTestPureUrlTracker) {
                window.__lambdaTestPureUrlTracker = {
                    currentUrl: window.location.href,
                    history: [],
                    startTime: new Date().toISOString(),
                    lastCheck: new Date().getTime(),
                    urlChangeCallbacks: []
                };
                
                // Record initial URL immediately
                window.__lambdaTestPureUrlTracker.history.push({
                    url: window.location.href,
                    timestamp: new Date().toISOString(),
                    type: 'initial'
                });
                
                // Store in sessionStorage for persistence
                try {
                    sessionStorage.setItem('__lambdaUrlHistory', 
                        JSON.stringify(window.__lambdaTestPureUrlTracker.history));
                } catch(e) {
                    console.error('[UrlTracker] Error saving to sessionStorage:', e);
                }
                
                console.log('[UrlTracker] Recorded initial URL:', window.location.href);
                
                // Direct interval polling method
                setInterval(function() {
                    var currentUrl = window.location.href;
                    
                    if (currentUrl !== window.__lambdaTestPureUrlTracker.currentUrl) {
                        console.log('[UrlTracker] URL changed:', 
                            window.__lambdaTestPureUrlTracker.currentUrl, '->', currentUrl);
                        
                        // Record change
                        const entry = {
                            url: currentUrl,
                            timestamp: new Date().toISOString(),
                            previousUrl: window.__lambdaTestPureUrlTracker.currentUrl,
                            type: 'location_change'
                        };
                        
                        window.__lambdaTestPureUrlTracker.history.push(entry);
                        window.__lambdaTestPureUrlTracker.currentUrl = currentUrl;
                        
                        // Notify any callbacks
                        window.__lambdaTestPureUrlTracker.urlChangeCallbacks.forEach(function(callback) {
                            try {
                                callback(entry);
                            } catch(e) {
                                console.error('[UrlTracker] Callback error:', e);
                            }
                        });
                        
                        // Store in sessionStorage for persistence
                        try {
                            sessionStorage.setItem('__lambdaUrlHistory', 
                                JSON.stringify(window.__lambdaTestPureUrlTracker.history));
                        } catch(e) {
                            console.error('[UrlTracker] Error saving to sessionStorage:', e);
                        }
                    }
                    
                    window.__lambdaTestPureUrlTracker.lastCheck = new Date().getTime();
                }, 500);
            }
            
            // Return tracker object for external use
            return {
                installed: true,
                initialUrl: window.location.href,
                history: window.__lambdaTestPureUrlTracker.history,
                registerCallback: function(callback) {
                    if (typeof callback === 'function') {
                        window.__lambdaTestPureUrlTracker.urlChangeCallbacks.push(callback);
                        return true;
                    }
                    return false;
                }
            };
        })();
        `;
    }
    
    /**
     * Get data collector script
     */
    getUrlCollectorScript() {
        return `
        // Pure JavaScript data collector 
        (function() {
            var result = {
                url: window.location.href,
                timestamp: new Date().toISOString(),
                history: []
            };
            
            try {
                // Try to get history from tracker if it exists
                if (window.__lambdaTestPureUrlTracker && window.__lambdaTestPureUrlTracker.history) {
                    result.history = window.__lambdaTestPureUrlTracker.history;
                    result.trackerInstalled = true;
                } else {
                    // Try to recover from sessionStorage
                    var storedHistory = sessionStorage.getItem('__lambdaUrlHistory');
                    if (storedHistory) {
                        result.history = JSON.parse(storedHistory);
                        result.recoveredFromStorage = true;
                    }
                }
            } catch(e) {
                result.error = e.message;
            }
            
            // Always include at least the current URL
            if (!result.history || result.history.length === 0) {
                result.history = [{
                    url: window.location.href, 
                    timestamp: new Date().toISOString(),
                    type: 'fallback'
                }];
            }
            
            return result;
        })();
        `;
    }
    
    /**
     * Initialize the URL tracker
     * This is a no-op initialization since we don't have browser access
     * The tracking script must be manually injected via a service or similar
     */
    async init() {
        this.log('Initializing URL tracker (WebDriverIO-free implementation)');
        
        // Reset tracking file
        this.forceDeleteTrackingFile();
        
        // Set as initialized
        this.isInitialized = true;
        this.trackerInstalled = false;
        
        this.log('URL tracker initialized - NO WebDriverIO DEPENDENCIES');
        
        return true;
    }
    
    /**
     * Process location history from browser
     * This must be called manually with history data
     */
    processLocationHistory(browserHistory) {
        if (!browserHistory || !Array.isArray(browserHistory) || browserHistory.length === 0) {
            return;
        }
        
        this.log(`Processing browser location history: ${browserHistory.length} entries`);
        
        let newEntryCount = 0;
        
        // Go through each entry and add if it's new
        for (const entry of browserHistory) {
            // Extract URL - handle both formats for compatibility
            const url = entry.url || entry.current_url;
            const timestamp = entry.timestamp || new Date().toISOString();
            const previousUrl = entry.previousUrl || entry.previous_url || this.currentUrl || '';
            const type = entry.type || entry.navigation_type || 'location_change';
            
            if (!url) continue;
            
            // Skip if we already have this exact entry
            const isDuplicate = this.navigationHistory.some(existing => 
                (existing.timestamp === timestamp && existing.current_url === url) ||
                (existing.current_url === url && existing.previous_url === previousUrl)
            );
            
            if (!isDuplicate) {
                const navigationEvent = {
                    previous_url: previousUrl,
                    current_url: url,
                    timestamp: timestamp,
                    navigation_type: type
                };
                
                this.navigationHistory.push(navigationEvent);
                this.currentUrl = url;
                newEntryCount++;
                
                // Emit event
                const eventWithContext = {
                    ...navigationEvent,
                    spec_file: this.currentSpecFile,
                    test_name: this.currentTestName
                };
                this.emit('urlChange', eventWithContext);
            }
        }
        
        if (newEntryCount > 0) {
            this.log(`Added ${newEntryCount} new entries from browser history`);
            this.saveReport();
        }
    }
    
    /**
     * Directly add a URL to the history
     */
    directlyAddUrl(url, source = 'direct_add') {
        if (!url || url === this.currentUrl) return false;
        
        this.log(`Directly adding URL: ${url} (source: ${source})`);
        
        const navigationEvent = {
            previous_url: this.currentUrl || '',
            current_url: url,
            timestamp: new Date().toISOString(),
            navigation_type: source
        };
        
        this.navigationHistory.push(navigationEvent);
        this.currentUrl = url;
        
        // Emit event
        const eventWithContext = {
            ...navigationEvent,
            spec_file: this.currentSpecFile,
            test_name: this.currentTestName
        };
        this.emit('urlChange', eventWithContext);
        
        // Save immediately
        this.saveReport();
        
        return true;
    }
    
    /**
     * Handle URL change (for compatibility with existing code)
     */
    handleUrlChange(newUrl, type, command) {
        return this.directlyAddUrl(newUrl, type || 'url_change');
    }
    
    /**
     * Get current URL - this is the cached value, not from browser
     */
    getCurrentUrl() {
        return this.currentUrl;
    }
    
    /**
     * IMPORTANT: This method should be called by the test framework with navigation data
     * as we no longer have direct browser access
     */
    updateFromNavigation(url, type = 'navigation', details = '') {
        this.log(`Received navigation update: ${url} (${type})`);
        return this.handleUrlChange(url, type, details);
    }

    setTestContext(specFile, testName) {
        this.currentSpecFile = specFile;
        this.currentTestName = testName;
        this.log(`Test context set: ${specFile} - ${testName}`);
        
        // Reset per-test flags when test context changes
        this.hasRecordedFinalUrl = false;
        this.hasSavedReport = false;
        
        // If we're setting a new test context and file reset is enabled, ensure it's reset
        if (this.options.resetFileOnStart) {
            this.log('New test context - checking if tracking file needs reset');
            // Only reset if it hasn't been reset in this process
            if (!fileResetCompleted) {
                this.forceDeleteTrackingFile();
            }
        }
    }

    setSpecFile(specFile) {
        this.currentSpecFile = specFile;
        this.log(`Spec file set: ${specFile}`);
    }

    setSessionId(sessionId) {
        this.sessionId = sessionId;
        this.log(`Session ID set: ${sessionId}`);
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
            
            // Create the file if it doesn't exist or has invalid content
            let existingData = [];
            let fileExists = fs.existsSync(outputPath);
            
            if (fileExists) {
                try {
                    // Read existing data 
                    const fileContent = fs.readFileSync(outputPath, 'utf8');
                    if (fileContent.trim() !== '') {
                        try {
                            existingData = JSON.parse(fileContent);
                            if (!Array.isArray(existingData)) {
                                this.log('Existing data is not an array, creating new file');
                                existingData = [];
                                fs.writeFileSync(outputPath, '[]', 'utf8');
                            }
                        } catch (e) {
                            this.log(`Error parsing existing data, creating new file: ${e.message}`);
                            existingData = [];
                            fs.writeFileSync(outputPath, '[]', 'utf8');
                        }
                    } else {
                        // Empty file - initialize with array
                        this.log('File exists but is empty, initializing with array');
                        fs.writeFileSync(outputPath, '[]', 'utf8');
                    }
                } catch (e) {
                    this.log(`Error reading file: ${e.message}, creating new one`);
                    fs.writeFileSync(outputPath, '[]', 'utf8');
                }
            } else {
                // File doesn't exist, create it
                this.log('Creating new tracking file');
                fs.writeFileSync(outputPath, '[]', 'utf8');
            }
            
            // Check if we have a duplicate report for this test
            const existingReportIndex = existingData.findIndex(
                r => r.spec_file === report.spec_file && r.test_name === report.test_name && r.session_id === report.session_id
            );
            
            if (existingReportIndex !== -1) {
                // Update existing report
                this.log(`Updating existing report at index ${existingReportIndex}`);
                existingData[existingReportIndex] = report;
            } else {
                // Add new report
                this.log('Adding new report to file');
                existingData.push(report);
            }
            
            // Write the updated data
            try {
                fs.writeFileSync(outputPath, JSON.stringify(existingData, null, 2), 'utf8');
                this.log(`Report saved with ${report.navigation_count} navigation events`);
                this.hasSavedReport = true;
                
                // Verify the file was written correctly
                try {
                    const content = fs.readFileSync(outputPath, 'utf8');
                    const parsed = JSON.parse(content);
                    this.log(`Verified saved file: contains ${parsed.length} reports`);
                } catch (e) {
                    this.log(`Warning: Saved file verification failed: ${e.message}`);
                }
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
     * Finalize and clean up before the test ends
     */
    onBeforeExit() {
        this.log('Finalizing URL tracking data');
        
        // Record final state
        this.recordFinalUrl();
        
        // Force save report
        this.saveReport();
        this.hasRecordedFinalUrl = true;
        
        return true;
    }

    /**
     * Clean up all resources
     */
    destroy() {
        this.log('Destroying URL Tracker...');
        
        // Collect and save final navigation data if not already done
        if (!this.hasRecordedFinalUrl || !this.hasSavedReport) {
            this.onBeforeExit();
        }
        
        // Clear event listeners
        this.removeAllListeners();
        this.isInitialized = false;
        this.log('Cleanup complete');
    }

    recordNavigation(url, type = 'manual_record', details = 'user_recorded') {
        this.log(`Manually recording navigation to ${url} (${type})`);
        this.handleUrlChange(url, type, details);
    }

    recordFinalUrl() {
        // Prevent duplicate recording
        if (this.hasRecordedFinalUrl) {
            return;
        }
        
        if (this.currentUrl) {
            this.log(`Recording final URL: ${this.currentUrl}`);
            this.handleUrlChange(this.currentUrl, 'final', 'test_end');
            this.hasRecordedFinalUrl = true;
        }
    }

    /**
     * Helper method to get the tracking file path
     */
    getTrackingFilePath() {
        const outputDir = this.options.outputDirectory || 'test-results';
        const outputFilename = this.options.outputFilename || 'url-tracking.json';
        return path.resolve(process.cwd(), outputDir, outputFilename);
    }
    
    /**
     * Force delete tracking file by bypassing all checks
     */
    forceDeleteTrackingFile() {
        try {
            const outputDir = this.options.outputDirectory || 'test-results';
            const outputFilename = this.options.outputFilename || 'url-tracking.json';
            
            // Create directory if needed
            const fullOutputDir = path.resolve(process.cwd(), outputDir);
            if (!fs.existsSync(fullOutputDir)) {
                this.log(`Creating output directory: ${fullOutputDir}`);
                fs.mkdirSync(fullOutputDir, { recursive: true });
            }
            
            // Define output path
            const outputPath = this.getTrackingFilePath();
            this.log(`DELETING tracking file at: ${outputPath}`);
            
            // Delete if exists
            if (fs.existsSync(outputPath)) {
                try {
                    fs.unlinkSync(outputPath);
                    this.log('Tracking file deleted successfully');
                } catch (e) {
                    this.log(`Error deleting file: ${e.message}`);
                    // Try to overwrite instead
                    fs.writeFileSync(outputPath, '[]', {flag: 'w'});
                    this.log('File reset via overwrite');
                }
            }
            
            // Create empty file
            fs.writeFileSync(outputPath, '[]', 'utf8');
            this.log('Empty tracking file created');
            
            // Mark as completed
            fileResetCompleted = true;
            return true;
        } catch (error) {
            this.log(`Error resetting tracking file: ${error.message}`);
            console.error(error);
            return false;
        }
    }
    
    /**
     * Debug method to check if the tracking file exists and what its contents are
     */
    debugFileStatus() {
        try {
            const outputPath = this.getTrackingFilePath();
            
            this.log(`Checking tracking file at: ${outputPath}`);
            
            if (fs.existsSync(outputPath)) {
                this.log('Tracking file exists');
                const stats = fs.statSync(outputPath);
                this.log(`File size: ${stats.size} bytes`);
                
                try {
                    const content = fs.readFileSync(outputPath, 'utf8');
                    this.log(`File content: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
                    
                    try {
                        const json = JSON.parse(content);
                        this.log(`Parsed JSON: ${json.length} items`);
                    } catch (e) {
                        this.log(`Invalid JSON: ${e.message}`);
                    }
                } catch (e) {
                    this.log(`Error reading file: ${e.message}`);
                }
            } else {
                this.log('Tracking file does not exist');
            }
        } catch (error) {
            this.log(`Error checking file status: ${error.message}`);
        }
    }
    
    /**
     * Reset methods for backward compatibility
     */
    resetTrackingFile() {
        return this.forceDeleteTrackingFile();
    }
    
    forceResetTrackingFile() {
        return this.forceDeleteTrackingFile();
    }
    
    /**
     * Reset tracking file before a new session starts
     */
    resetBeforeNewSession() {
        this.log('Preparing for new session - resetting file');
        fileResetCompleted = false;
        return this.forceDeleteTrackingFile();
    }
    
    /**
     * Static reset method for service layer
     */
    static forceReset() {
        console.log('[UrlTracker] Static force reset called');
        fileResetCompleted = false;
        
        try {
            // Use default paths
            const outputDir = 'test-results';
            const outputFilename = 'url-tracking.json';
            const fullOutputDir = path.resolve(process.cwd(), outputDir);
            
            // Create directory if needed
            if (!fs.existsSync(fullOutputDir)) {
                fs.mkdirSync(fullOutputDir, { recursive: true });
            }
            
            // Delete and recreate file
            const outputPath = path.resolve(fullOutputDir, outputFilename);
            
            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
            
            fs.writeFileSync(outputPath, '[]', 'utf8');
            console.log('[UrlTracker] Empty tracking file created by static method');
            
            return true;
        } catch (error) {
            console.log(`[UrlTracker] Error in static reset: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Public methods to maintain compatibility with existing code
     */
    getNavigationHistory() {
        return this.navigationHistory;
    }

    clearHistory() {
        this.navigationHistory = [];
        this.hasRecordedFinalUrl = false;
        this.hasSavedReport = false;
    }
}

module.exports = UrlTracker; 
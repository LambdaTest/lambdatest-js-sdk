const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class UrlTrackerPlugin extends EventEmitter {
    constructor(page, options = {}) {
        super();
        this.page = page;
        
        // Normalize options with defaults
        this.options = {
            enabled: options.enabled ?? true,
            trackHashChanges: options.trackHashChanges ?? true,
            testName: options.testName ?? 'unknown',
            specFile: options.specFile ?? 'unknown',
            preserveHistory: options.preserveHistory ?? true
        };
        
        // Don't use hardcoded spec file names
        if (this.options.specFile === 'unknown') {
            console.log('Spec file is unknown, will attempt to determine from test metadata');
        }
        
        console.log(`Creating URL tracker with RAW options: ${JSON.stringify(options)}`);
        console.log(`Creating URL tracker with NORMALIZED options: ${JSON.stringify(this.options)}`);
        
        // Initialize properties
        this.navigationHistory = [];
        this.isInitialized = false;
        this.lastEventTime = 0;
        this.DEBOUNCE_TIME = 0; // Remove debouncing to handle rapid changes
        this.lastUrl = 'null';
        this.isHistoryAPITracking = false;
        this.preserveHistory = this.options.preserveHistory;
        this.trackingResults = []; // This will store results in the new format
        this.isFunctionExposed = false;
        this.testMetadata = null; // New property to store test metadata
        this.metadataFetchAttempts = 0; // Track number of fetch attempts
        this.MAX_METADATA_FETCH_ATTEMPTS = 5; // Maximum retry attempts
        this.lastNavigationType = 'init'; // Track the last navigation type
        
        // Define navigation type mapping for more descriptive types
        this.navigationTypeMap = {
            'goto': 'goto',               // Direct navigation via page.goto()
            'navigation': 'navigation',   // General navigation event
            'back': 'back',               // Browser back button via page.goBack()
            'forward': 'forward',         // Browser forward button via page.goForward()
            'reload': 'refresh',          // Page refresh via page.reload()
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
            'dummy': 'dummy'              // Dummy placeholder
        };
        
        // Register this tracker in the global list of active trackers
        try {
            const globalObj = global || window || {};
            if (!globalObj._activeUrlTrackers) {
                globalObj._activeUrlTrackers = [];
            }
            globalObj._activeUrlTrackers.push(this);
            console.log(`Registered URL tracker in global list (${globalObj._activeUrlTrackers.length} trackers)`);
        } catch (e) {
            console.error('Error registering tracker globally:', e);
        }
        
        // Create initial output files to ensure permissions are correct
        this.ensureOutputFilesExist();
    }

    normalizeUrl(url) {
        // Explicitly check for common problematic values and normalize them consistently
        if (url === null || url === undefined || url === '' || 
            url === 'null' || url === 'nullblank' || url === 'about:blank') {
            return 'null';
        }
        
        try {
            // For real URLs, proceed with normalization
            if (url.includes('example.com')) {
                const urlObj = new URL(url);
                // Normalize protocol to https if it's http
                if (urlObj.protocol === 'http:') {
                    urlObj.protocol = 'https:';
                }
                // Remove trailing slash for all URLs except root URLs
                const pathname = urlObj.pathname === '/' ? '/' : urlObj.pathname.replace(/\/$/, '');
                const baseUrl = urlObj.origin + pathname;
                const search = urlObj.search || '';
                const hash = urlObj.hash || '';
                return baseUrl + search + hash;
            }

            // For other URLs
            const urlObj = new URL(url);
            // Normalize protocol to https if it's http
            if (urlObj.protocol === 'http:') {
                urlObj.protocol = 'https:';
            }
            // Remove trailing slash for all URLs except root URLs
            const pathname = urlObj.pathname === '/' ? '/' : urlObj.pathname.replace(/\/$/, '');
            const baseUrl = urlObj.origin + pathname;
            const search = urlObj.search || '';
            const hash = urlObj.hash || '';
            return baseUrl + search + hash;
        } catch (e) {
            // If URL parsing fails, return 'null'
            return 'null';
        }
    }

    // Safely creates a URL object with fallback to about:blank
    safeCreateURL(url) {
        // Handle all special cases consistently
        if (url === null || url === undefined || url === '' || 
            url === 'null' || url === 'nullblank' || url === 'about:blank') {
            return new URL('about:blank');
        }
        
        try {
            // Special case for example.com in tests
            if (url && url.includes('example.com')) {
                if (!url.startsWith('http')) {
                    return new URL(`https://${url}`);
                }
                return new URL(url);
            }
            
            // Try to parse as-is first
            try {
                return new URL(url);
            } catch (innerError) {
                // If that fails, try adding https prefix
                if (url && !url.startsWith('http')) {
                    return new URL(`https://${url}`);
                }
                // If it still fails, fall back to about:blank
                return new URL('about:blank');
            }
        } catch (e) {
            return new URL('about:blank');
        }
    }

    async init() {
        if (!this.options.enabled || this.isInitialized) {
            return;
        }

        // Clear any existing history before initialization
        this.navigationHistory = [];
        this.trackingResults = [];

        try {
            console.log(`Initializing URL tracker for test: ${this.options.testName || 'unknown'}`);
            
            // CRITICAL: Fetch test metadata first - this must happen for every test session
            console.log('FETCHING TEST METADATA AT SESSION START - REQUIRED FOR EVERY TEST SESSION');
            await this.fetchTestMetadataWithRetry();
            
            // Wait for the page to be ready
            await this.page.waitForLoadState('domcontentloaded').catch(() => {
                // Ignore timeouts or navigation errors
                console.log('Warning: Failed to wait for dom content loaded');
            });

            // Get and normalize the initial URL 
            let pageUrl = this.page.url();
            // Convert directly to 'null' if it's about:blank
            if (pageUrl === 'about:blank') {
                pageUrl = 'null';
            }
            
            const currentUrl = this.normalizeUrl(pageUrl);
            console.log(`Initial URL: ${currentUrl}`);
            
            // Only record the initial URL if it's not 'null'
            if (currentUrl !== 'null') {
                this.navigationHistory.push({
                    url: currentUrl,
                    type: 'navigation',
                    timestamp: Date.now()
                });
                
                // Add to tracking results with new format
                this.addTrackingResult({
                    spec_file: this.options.specFile,
                    test_name: this.options.testName,
                    previous_url: 'null',
                    current_url: currentUrl,
                    timestamp: new Date().toISOString(),
                    navigation_type: 'page_load' // More specific navigation type
                });
                
                console.log(`Added initial URL to history: ${currentUrl}`);
            } else {
                console.log('Initial URL is null, skipping recording');
            }
            
            this.lastUrl = currentUrl;
            this.lastNavigationType = 'page_load';

            await this.setupPageListeners();
            this.isInitialized = true;
            console.log('URL tracker initialized successfully');
            
            // Debug the first tracking result
            if (this.trackingResults.length > 0) {
                console.log('First tracking result after init:', JSON.stringify(this.trackingResults[0]));
            } else {
                console.warn('No tracking results after initialization!');
            }
        } catch (error) {
            console.error('Error initializing URL tracker:', error);
        }
    }

    async setupPageListeners() {
        if (!this.options.enabled) {
            return;
        }

        console.log(`Setting up page listeners for test: ${this.options.testName}`);

        // Remove any existing listeners first
        this.page.removeAllListeners('framenavigated');

        // Listen for navigation events
        this.page.on('framenavigated', async (frame) => {
            if (frame === this.page.mainFrame()) {
                const newUrl = this.normalizeUrl(frame.url());
                console.log(`Navigation detected: ${newUrl} (from ${this.lastUrl})`);
                
                if (newUrl !== this.lastUrl && newUrl !== 'null') {
                    const oldUrl = this.lastUrl || 'null';
                    this.lastUrl = newUrl;

                    // Skip if this is a history API change
                    if (this.isHistoryAPITracking) {
                        this.isHistoryAPITracking = false;
                        return;
                    }

                    // Check if it's a hash change - use safe URL creation
                    const oldUrlObj = this.safeCreateURL(oldUrl);
                    const newUrlObj = this.safeCreateURL(newUrl);
                    const isHashChange = oldUrlObj.origin + oldUrlObj.pathname === newUrlObj.origin + newUrlObj.pathname &&
                        oldUrlObj.hash !== newUrlObj.hash;

                    let navigationType;
                    let navigation_type;
                    if (isHashChange && this.options.trackHashChanges) {
                        navigationType = 'hashchange';
                        navigation_type = this.navigationTypeMap['hashchange'];
                        this.emit('hashChange', { oldURL: oldUrl, newURL: newUrl });
                    } else {
                        navigationType = 'navigation';
                        // Try to determine more specific navigation type based on context
                        if (this.lastNavigationType === 'back_pending') {
                            navigation_type = this.navigationTypeMap['back'];
                            this.lastNavigationType = 'back';
                        } else if (this.lastNavigationType === 'forward_pending') {
                            navigation_type = this.navigationTypeMap['forward'];
                            this.lastNavigationType = 'forward';
                        } else if (this.lastNavigationType === 'reload_pending') {
                            navigation_type = this.navigationTypeMap['reload'];
                            this.lastNavigationType = 'refresh';
                        } else {
                            navigation_type = this.navigationTypeMap['navigation'];
                            this.lastNavigationType = 'navigation';
                        }
                        this.emit('urlChange', { oldUrl, newUrl });
                    }

                    console.log(`Adding navigation event to history: ${oldUrl} -> ${newUrl} (${navigationType})`);
                    
                    this.navigationHistory.push({
                        url: newUrl,
                        type: navigationType,
                        timestamp: Date.now()
                    });

                    // Add to tracking results with new format
                    this.addTrackingResult({
                        spec_file: this.options.specFile,
                        test_name: this.options.testName,
                        previous_url: oldUrl === 'null' ? 'null' : oldUrl,
                        current_url: newUrl,
                        timestamp: new Date().toISOString(),
                        navigation_type: navigation_type
                    });
                    
                    console.log(`Added tracking result: ${this.options.testName} - ${navigation_type} from ${oldUrl} to ${newUrl}`);
                } else if (newUrl === 'null') {
                    console.log('Navigation to null URL detected, skipping recording');
                }
            }
        });

        // Only expose the function if it hasn't been exposed yet
        if (!this.isFunctionExposed) {
            try {
                await this.page.exposeFunction('__trackHistoryChange', (url, type) => {
                    const newUrl = this.normalizeUrl(url);
                    if (newUrl !== this.lastUrl && newUrl !== 'null') {
                        const oldUrl = this.lastUrl || 'null';
                        this.lastUrl = newUrl;
                        this.isHistoryAPITracking = true;

                        // For hash changes, ensure we're using the correct type - use safe URL creation
                        const oldUrlObj = this.safeCreateURL(oldUrl);
                        const newUrlObj = this.safeCreateURL(newUrl);
                        const isHashChange = oldUrlObj.origin + oldUrlObj.pathname === newUrlObj.origin + newUrlObj.pathname &&
                            oldUrlObj.hash !== newUrlObj.hash;

                        const finalType = isHashChange ? 'hashchange' : type;
                        let navigation_type = this.navigationTypeMap[finalType] || finalType;
                        
                        this.navigationHistory.push({
                            url: newUrl,
                            type: finalType,
                            timestamp: Date.now()
                        });

                        // Add to tracking results with new format
                        this.addTrackingResult({
                            spec_file: this.options.specFile,
                            test_name: this.options.testName,
                            previous_url: oldUrl === 'null' ? 'null' : oldUrl,
                            current_url: newUrl,
                            timestamp: new Date().toISOString(),
                            navigation_type: navigation_type
                        });

                        this.lastNavigationType = finalType;
                        this.emit('urlChange', { oldUrl, newUrl });
                    } else if (newUrl === 'null') {
                        console.log('History change to null URL detected, skipping recording');
                    }
                });
                this.isFunctionExposed = true;
            } catch (error) {
                console.error('Error exposing history change tracking function:', error);
            }
        }

        try {
            // Add history API tracking
            await this.page.addInitScript(() => {
                // Store original methods
                const originalPushState = window.history.pushState;
                const originalReplaceState = window.history.replaceState;

                // Make sure tracking function is available
                if (typeof window.__trackHistoryChange !== 'function') {
                    console.error('Tracking function not available');
                    return;
                }

                // Override pushState
                window.history.pushState = function(...args) {
                    // Call original first
                    const result = originalPushState.apply(this, args);
                    // Then track the change
                    try {
                        window.__trackHistoryChange(window.location.href, 'pushstate');
                    } catch (e) {
                        console.error('Error tracking pushState:', e);
                    }
                    return result;
                };

                // Override replaceState
                window.history.replaceState = function(...args) {
                    // Call original first
                    const result = originalReplaceState.apply(this, args);
                    // Then track the change
                    try {
                        window.__trackHistoryChange(window.location.href, 'replacestate');
                    } catch (e) {
                        console.error('Error tracking replaceState:', e);
                    }
                    return result;
                };

                // Track hash changes
                window.addEventListener('hashchange', (event) => {
                    try {
                        window.__trackHistoryChange(window.location.href, 'hashchange');
                    } catch (e) {
                        console.error('Error tracking hashchange:', e);
                    }
                });

                // Track popstate events (browser back/forward buttons)
                window.addEventListener('popstate', () => {
                    try {
                        const currentUrl = window.location.href;
                        if (currentUrl === 'about:blank' || currentUrl === '') {
                            window.__trackHistoryChange(window.location.origin + '/', 'navigation');
                        } else {
                            window.__trackHistoryChange(currentUrl, 'popstate');
                        }
                    } catch (e) {
                        console.error('Error tracking popstate:', e);
                    }
                });

                // Track clicks on links that might cause navigation
                document.addEventListener('click', (event) => {
                    try {
                        // Find closest anchor element
                        let target = event.target;
                        while (target && target.tagName !== 'A') {
                            target = target.parentElement;
                        }
                        
                        // If this is a link click that will navigate
                        if (target && target.tagName === 'A' && target.href) {
                            // Save link information for later use
                            window.__lastClickedLink = {
                                href: target.href,
                                timestamp: Date.now()
                            };
                        }
                    } catch (e) {
                        console.error('Error tracking link clicks:', e);
                    }
                }, true);
                
                // Track form submissions
                document.addEventListener('submit', (event) => {
                    try {
                        // Mark that a form was submitted
                        window.__lastFormSubmit = {
                            timestamp: Date.now(),
                            action: event.target.action || window.location.href
                        };
                    } catch (e) {
                        console.error('Error tracking form submission:', e);
                    }
                }, true);

                // Manually trigger for initial page load
                try {
                    window.__trackHistoryChange(window.location.href, 'navigation');
                } catch (e) {
                    console.error('Error tracking initial page:', e);
                }
            }).catch((error) => {
                console.error('Error adding init script:', error);
            });
            
            // Intercept Playwright navigation methods
            this.setupPlaywrightMethodInterception();
            
        } catch (error) {
            console.error('Error setting up page listeners:', error);
        }
    }
    
    // New method to intercept Playwright navigation methods
    setupPlaywrightMethodInterception() {
        try {
            // Intercept page.goBack
            const originalGoBack = this.page.goBack;
            this.page.goBack = async (...args) => {
                console.log('Intercepted page.goBack()');
                this.lastNavigationType = 'back_pending';
                return await originalGoBack.apply(this.page, args);
            };
            
            // Intercept page.goForward
            const originalGoForward = this.page.goForward;
            this.page.goForward = async (...args) => {
                console.log('Intercepted page.goForward()');
                this.lastNavigationType = 'forward_pending';
                return await originalGoForward.apply(this.page, args);
            };
            
            // Intercept page.reload
            const originalReload = this.page.reload;
            this.page.reload = async (...args) => {
                console.log('Intercepted page.reload()');
                this.lastNavigationType = 'reload_pending';
                const oldUrl = this.lastUrl || 'null';
                
                // Record the reload intent before it happens
                this.addTrackingResult({
                    spec_file: this.options.specFile,
                    test_name: this.options.testName,
                    previous_url: oldUrl,
                    current_url: oldUrl, // Same URL for refresh
                    timestamp: new Date().toISOString(),
                    navigation_type: this.navigationTypeMap['reload']
                });
                
                return await originalReload.apply(this.page, args);
            };
            
            // Intercept page.click with option to detect link clicks
            const originalClick = this.page.click;
            this.page.click = async (selector, options) => {
                console.log(`Intercepted page.click(${selector})`);
                
                // Check if this is likely a link click
                try {
                    const isLink = await this.page.evaluate((sel) => {
                        const element = document.querySelector(sel);
                        if (!element) return false;
                        
                        // Check if it's an anchor or has an anchor parent
                        let current = element;
                        while (current) {
                            if (current.tagName === 'A' && current.href) {
                                return {
                                    isLink: true,
                                    href: current.href
                                };
                            }
                            current = current.parentElement;
                        }
                        return false;
                    }, selector);
                    
                    if (isLink) {
                        console.log(`Detected click on link: ${isLink.href}`);
                        this.lastNavigationType = 'click';
                        
                        // Record the click intent
                        const oldUrl = this.lastUrl || 'null';
                        this.addTrackingResult({
                            spec_file: this.options.specFile,
                            test_name: this.options.testName,
                            previous_url: oldUrl,
                            current_url: this.normalizeUrl(isLink.href),
                            timestamp: new Date().toISOString(),
                            navigation_type: this.navigationTypeMap['click']
                        });
                    }
                } catch (e) {
                    console.log('Error detecting if click target is a link:', e);
                }
                
                return await originalClick.apply(this.page, [selector, options]);
            };
            
            console.log('Successfully intercepted Playwright navigation methods');
        } catch (e) {
            console.error('Error setting up Playwright method interception:', e);
        }
    }

    isEnabled() {
        return this.options.enabled;
    }

    getNavigationHistory() {
        return [...this.navigationHistory];
    }

    getCurrentUrl() {
        const lastHistory = this.navigationHistory[this.navigationHistory.length - 1];
        return lastHistory ? lastHistory.url : this.normalizeUrl(this.page.url());
    }

    clearHistory() {
        if (!this.preserveHistory) {
            this.navigationHistory = [];
            this.trackingResults = [];
        }
    }

    async destroy() {
        this.page.removeAllListeners('framenavigated');
        if (!this.preserveHistory) {
            this.navigationHistory = [];
            this.trackingResults = [];
        }
        this.isInitialized = false;
        this.isFunctionExposed = false;
    }

    async cleanup() {
        console.log(`Cleaning up URL tracker for test: ${this.options.testName}`);
        console.log(`Test name: ${this.options.testName}, Spec file: ${this.options.specFile}`);
        console.log(`Found ${this.trackingResults.length} tracking results to export`);
        
        // Make final attempt to fetch metadata if we don't have it
        if (!this.testMetadata) {
            console.log('Final attempt to fetch test metadata during cleanup...');
            await this.fetchTestMetadataWithRetry();
        }
        
        // Ensure spec file is properly set for all results
        if (this.options.specFile && this.options.specFile !== 'unknown' && 
            this.options.specFile !== 'Unable to determine spec file') {
            console.log(`Ensuring all tracking results use spec file: ${this.options.specFile}`);
            if (this.trackingResults && this.trackingResults.length > 0) {
                this.trackingResults.forEach(result => {
                    result.spec_file = this.options.specFile;
                });
            }
        }
        
        // Debug output of tracking results
        if (this.trackingResults.length > 0) {
            console.log(`Tracking results for ${this.options.testName}:`, JSON.stringify(this.trackingResults, null, 2));
        } else {
            // If no results, record the current page URL as a final result
            try {
                console.log('No tracking results found. Attempting to record final page URL.');
                const currentUrl = this.normalizeUrl(this.page.url());
                if (currentUrl !== 'null' && currentUrl !== 'about:blank') {
                    this.addTrackingResult({
                        spec_file: this.options.specFile,
                        test_name: this.options.testName,
                        previous_url: this.lastUrl || 'null',
                        current_url: currentUrl,
                        timestamp: new Date().toISOString(),
                        navigation_type: 'final'
                    });
                    console.log(`Added final URL as tracking result: ${currentUrl}`);
                }
            } catch (e) {
                console.error('Error recording final URL:', e);
            }
        }
        
        // Before cleanup, export the results
        this.exportResults();
        this.preserveHistory = true;
        await this.destroy();
    }

    exportResults(outputPath = null) {
        // Debug spec file right at the beginning
        console.log(`Beginning export with options: ${JSON.stringify(this.options)}`);
        console.log(`Current spec file is: ${this.options.specFile}`);
        
        // CRITICAL: Extract spec file from metadata if available
        let metadataSpecFile = null;
        if (this.testMetadata && this.testMetadata.data && this.testMetadata.data.name) {
            const testName = this.testMetadata.data.name;
            const specFileMatch = testName.match(/\s-\s(.+\.spec\.js)$/);
            if (specFileMatch && specFileMatch[1]) {
                metadataSpecFile = specFileMatch[1];
                console.log(`Using spec file from metadata: ${metadataSpecFile}`);
                
                // Override the spec file in options
                if (this.options.specFile !== metadataSpecFile) {
                    console.log(`Overriding spec file from ${this.options.specFile} to ${metadataSpecFile}`);
                    this.options.specFile = metadataSpecFile;
                }
            } else {
                console.log(`Could not extract spec file from metadata name: ${testName}`);
                // Fallback: try to extract any filename that ends with .spec.js
                const fallbackMatch = testName.match(/([^\s]+\.spec\.js)/);
                if (fallbackMatch && fallbackMatch[1]) {
                    metadataSpecFile = fallbackMatch[1];
                    console.log(`Extracted spec file using fallback method: ${metadataSpecFile}`);
                    
                    // Override the spec file in options
                    if (this.options.specFile !== metadataSpecFile) {
                        console.log(`Overriding spec file from ${this.options.specFile} to ${metadataSpecFile}`);
                        this.options.specFile = metadataSpecFile;
                    }
                }
            }
        }
        
        // IMPORTANT: Force update the spec file before export in all tracking results
        if (this.trackingResults && this.trackingResults.length > 0) {
            // Ensure all tracking results use the current spec file
            const currentSpecFile = metadataSpecFile || this.options.specFile;
            console.log(`Updating all tracking results to use spec file: ${currentSpecFile}`);
            
            this.trackingResults.forEach(result => {
                if (result.spec_file !== currentSpecFile) {
                    console.log(`Updating result spec file from '${result.spec_file}' to '${currentSpecFile}'`);
                    result.spec_file = currentSpecFile;
                }
            });
        }
        
        // Force fix our tracking results one more time before export
        if (this.trackingResults && this.trackingResults.length > 0) {
            console.log(`Checking ${this.trackingResults.length} results before export`);
            
            // Count how many have unknown spec file
            const unknownCount = this.trackingResults.filter(r => r.spec_file === 'unknown').length;
            if (unknownCount > 0) {
                console.log(`WARNING: Found ${unknownCount} results with 'unknown' spec file, fixing...`);
                
                // Fix all unknown spec files
                this.trackingResults.forEach(result => {
                    if (result.spec_file === 'unknown') {
                        console.log(`Fixing result with unknown spec file: ${JSON.stringify(result)}`);
                        result.spec_file = metadataSpecFile || "Unable to determine spec file";
                    }
                });
            } else {
                console.log('All results have proper spec files');
            }
        }
        
        // If no outputPath is provided, use both tests-results and test-results folders for compatibility
        const outputPaths = [];
        
        // Make sure we have tracking results
        if (!this.trackingResults || this.trackingResults.length === 0) {
            console.log('No results to export - considering creating fallback tracking result');
            
            // Only create a fallback if we're sure we need it
            try {
                const currentUrl = this.normalizeUrl(this.page.url());
                
                // Check if the URL is valid and worth recording
                if (currentUrl !== 'null' && currentUrl !== 'about:blank') {
                    console.log(`Creating fallback for valid URL: ${currentUrl}`);
                    
                    this.addTrackingResult({
                        spec_file: this.options.specFile,
                        test_name: this.options.testName,
                        previous_url: 'null',
                        current_url: currentUrl,
                        timestamp: new Date().toISOString(),
                        navigation_type: 'fallback'
                    });
                    console.log(`Added fallback tracking result for URL: ${currentUrl}`);
                } else {
                    console.log(`Not creating fallback for invalid URL: ${currentUrl}`);
                }
            } catch (e) {
                console.error('Failed to add fallback tracking result:', e);
                
                // Only add a dummy result if absolutely necessary
                if (!this.trackingResults || this.trackingResults.length === 0) {
                    console.log('Adding dummy result as last resort');
                    this.trackingResults.push({
                        spec_file: this.options.specFile,
                        test_name: this.options.testName,
                        previous_url: 'null',
                        current_url: 'null',
                        timestamp: new Date().toISOString(),
                        navigation_type: 'dummy'
                    });
                }
            }
        }
        
        // Only continue with export if we actually have results
        if (!this.trackingResults || this.trackingResults.length === 0) {
            console.log('No results to export, skipping file operations');
            return;
        }
        
        if (!outputPath) {
            // Try both "tests-results" and "test-results" to handle different conventions
            const resultsDir1 = path.join(process.cwd(), 'tests-results');
            const resultsDir2 = path.join(process.cwd(), 'test-results');
            
            // Ensure the directories exist with proper permissions
            [resultsDir1, resultsDir2].forEach(dir => {
                if (!fs.existsSync(dir)) {
                    try {
                        fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
                        console.log(`Created directory: ${dir}`);
                    } catch (err) {
                        console.error(`Failed to create directory ${dir}:`, err);
                        // Try with different approach for Windows
                        try {
                            require('child_process').execSync(`mkdir -p "${dir}"`);
                            console.log(`Created directory using command: ${dir}`);
                        } catch (cmdErr) {
                            console.error(`Failed to create directory using command ${dir}:`, cmdErr);
                        }
                    }
                }
            });
            
            outputPaths.push(path.join(resultsDir1, 'url-tracking-results.json'));
            outputPaths.push(path.join(resultsDir2, 'url-tracking-results.json'));
        } else {
            outputPaths.push(outputPath);
        }
        
        console.log(`Preparing to export ${this.trackingResults.length} tracking results to ${outputPaths.length} paths`);

        // Export to all output paths
        outputPaths.forEach(outputPath => {
            try {
                console.log(`Exporting to: ${outputPath}`);
                
                // Ensure the directory exists with full permissions
                const outputDir = path.dirname(outputPath);
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true, mode: 0o777 });
                    console.log(`Created directory: ${outputDir}`);
                }

                // Create current session data structure
                const currentSessionData = {
                    metadata: this.testMetadata || {},
                    navigations: this.trackingResults,
                    session_id: this.testMetadata?.session_id || this.testMetadata?.build_id || `session_${Date.now()}`,
                    spec_file: this.options.specFile  // Store spec file at the session level for easier updating
                };

                // Initialize the array of all sessions
                let allSessions = [];
                let shouldCreateNewFile = false;

                // Check if file exists and try to read it
                if (fs.existsSync(outputPath)) {
                    try {
                        const fileContent = fs.readFileSync(outputPath, 'utf-8').trim();
                        
                        // Skip empty files or create a new one
                        if (!fileContent) {
                            shouldCreateNewFile = true;
                        } else {
                            try {
                                // Try to parse the JSON
                                const existingData = JSON.parse(fileContent);
                                
                                // Handle different possible structures
                                if (Array.isArray(existingData)) {
                                    // File already contains an array of sessions - perfect!
                                    allSessions = existingData;
                                } else if (existingData.metadata && existingData.navigations) {
                                    // File contains a single session in the old format
                                    // Convert to array format
                                    allSessions = [existingData];
                                } else {
                                    // Unknown format
                                    console.error('Existing file is in an unknown format, creating a new one');
                                    shouldCreateNewFile = true;
                                }
                            } catch (parseError) {
                                console.error('Error parsing existing results file, creating a new one:', parseError);
                                shouldCreateNewFile = true;
                            }
                        }
                    } catch (readError) {
                        console.error('Error reading results file, creating a new one:', readError);
                        shouldCreateNewFile = true;
                    }
                } else {
                    // File doesn't exist, create a new one
                    shouldCreateNewFile = true;
                }

                // Create a new file if needed
                if (shouldCreateNewFile) {
                    try {
                        // Ensure the directory exists (double-check)
                        const outputDir = path.dirname(outputPath);
                        if (!fs.existsSync(outputDir)) {
                            fs.mkdirSync(outputDir, { recursive: true, mode: 0o777 });
                        }
                        
                        fs.writeFileSync(outputPath, '[]', { encoding: 'utf8', mode: 0o666 });
                        console.log(`Created new empty results file: ${outputPath}`);
                        allSessions = [];
                    } catch (createError) {
                        console.error(`Error creating new results file ${outputPath}:`, createError);
                        
                        // Try writing to current directory as a fallback
                        const fallbackPath = path.join(process.cwd(), 'url-tracking-results.json');
                        try {
                            fs.writeFileSync(fallbackPath, '[]', { encoding: 'utf8' });
                            console.log(`Created fallback file in current directory: ${fallbackPath}`);
                            outputPath = fallbackPath; // Update the path for further operations
                            allSessions = [];
                        } catch (fallbackErr) {
                            console.error('Failed to create fallback file in current directory:', fallbackErr);
                        }
                    }
                }

                // Update existing sessions with latest spec_file if they match current test
                const testName = this.options.testName;
                const currentSpecFile = this.options.specFile;
                allSessions.forEach(session => {
                    // Update spec file for all sessions with matching test name
                    if (session.metadata && session.metadata.name === testName) {
                        if (session.spec_file !== currentSpecFile) {
                            console.log(`Updating existing session spec file from '${session.spec_file}' to '${currentSpecFile}'`);
                            session.spec_file = currentSpecFile;
                        }
                        
                        // Also update spec_file in all navigations
                        if (Array.isArray(session.navigations)) {
                            session.navigations.forEach(nav => {
                                if (nav.spec_file !== currentSpecFile) {
                                    nav.spec_file = currentSpecFile;
                                }
                            });
                        }
                    }
                });

                // Check if this session already exists in the file (based on session ID)
                const sessionId = currentSessionData.session_id;
                const existingSessionIndex = allSessions.findIndex(session => 
                    session.session_id === sessionId || 
                    (session.metadata && session.metadata.session_id === sessionId) ||
                    (session.metadata && session.metadata.build_id === sessionId)
                );

                if (existingSessionIndex >= 0) {
                    console.log(`Found existing session with ID ${sessionId}, updating instead of adding new entry`);
                    allSessions[existingSessionIndex] = currentSessionData;
                } else {
                    // Add current session to all sessions
                    allSessions.push(currentSessionData);
                    console.log(`Adding new session with ID ${sessionId} to results file`);
                }

                console.log(`File now contains ${allSessions.length} test sessions`);

                // Set file permissions to ensure it's writable
                try {
                    if (fs.existsSync(outputPath)) {
                        fs.chmodSync(outputPath, 0o666); // Make sure file is readable and writable
                    }
                } catch (permError) {
                    console.error(`Error setting permissions on ${outputPath}:`, permError);
                }

                // Write the results to the file using multiple methods to ensure success
                try {
                    // First try with standard fs.writeFileSync
                    fs.writeFileSync(outputPath, JSON.stringify(allSessions, null, 2), { encoding: 'utf8', mode: 0o666 });
                    console.log(`URL tracking results (${allSessions.length} sessions) saved to: ${outputPath}`);
                } catch (writeError) {
                    console.error(`Error writing to ${outputPath} with writeFileSync:`, writeError);
                    
                    // Try alternate method with fs.writeFile
                    try {
                        fs.writeFile(outputPath, JSON.stringify(allSessions, null, 2), { encoding: 'utf8', mode: 0o666 }, (err) => {
                            if (err) {
                                console.error(`Error writing to ${outputPath} with writeFile:`, err);
                            } else {
                                console.log(`URL tracking results (${allSessions.length} sessions) saved to ${outputPath} with writeFile`);
                            }
                        });
                    } catch (writeError2) {
                        console.error(`Error writing to ${outputPath} with writeFile:`, writeError2);
                    }
                    
                    // Try writing to current directory as a last resort
                    const emergencyPath = path.join(process.cwd(), 'url-tracking-emergency.json');
                    try {
                        fs.writeFileSync(emergencyPath, JSON.stringify(allSessions, null, 2), { encoding: 'utf8' });
                        console.log(`Emergency backup saved to ${emergencyPath}`);
                    } catch (emergencyError) {
                        console.error(`Failed to create emergency file ${emergencyPath}:`, emergencyError);
                    }
                }
                
                // Verify the file was written correctly
                try {
                    if (fs.existsSync(outputPath)) {
                        const content = fs.readFileSync(outputPath, 'utf-8');
                        let savedData = [];
                        
                        try {
                            savedData = JSON.parse(content);
                            console.log(`Verification: Found ${savedData.length} sessions in file`);
                            
                            if (savedData.length > 0) {
                                console.log('First saved session in file has', 
                                    savedData[0].navigations ? savedData[0].navigations.length : 0, 
                                    'navigation entries');
                                console.log('First saved session spec file:', 
                                    savedData[0].spec_file || 'not found');
                            } else {
                                console.error('ERROR: File was written but contains empty sessions array!');
                                // Emergency fix - write our session directly again
                                const emergencyPath = path.join(process.cwd(), 'url-tracking-emergency.json');
                                fs.writeFileSync(emergencyPath, JSON.stringify([currentSessionData], null, 2), { encoding: 'utf8' });
                                console.log(`Emergency rewrite saved to ${emergencyPath}`);
                            }
                        } catch (parseError) {
                            console.error('Error parsing verification file:', parseError);
                        }
                    } else {
                        console.error(`File doesn't exist after writing: ${outputPath}`);
                    }
                } catch (e) {
                    console.error('Error verifying saved results:', e);
                }
            } catch (error) {
                console.error('Error exporting URL tracking results:', error);
                
                // Last resort - try to write just the current session to a backup file
                try {
                    const backupPath = path.join(process.cwd(), 'url-tracking-backup.json');
                    const currentSessionData = {
                        metadata: this.testMetadata || {},
                        navigations: this.trackingResults,
                        session_id: this.testMetadata?.session_id || this.testMetadata?.build_id || `session_${Date.now()}`,
                        spec_file: this.options.specFile
                    };
                    fs.writeFileSync(backupPath, JSON.stringify([currentSessionData], null, 2), { encoding: 'utf8' });
                    console.log(`Backup results saved to ${backupPath}`);
                    
                    // Verify the backup was written
                    const backupContent = fs.readFileSync(backupPath, 'utf-8');
                    const backupData = JSON.parse(backupContent);
                    console.log(`Backup verification: Found ${backupData.length} sessions in backup file`);
                } catch (backupError) {
                    console.error('Failed to create backup results file:', backupError);
                }
            }
        });
    }

    getTrackingResults() {
        console.log(`Getting ${this.trackingResults.length} tracking results for test: ${this.options.testName || 'unknown'}`);
        return [...this.trackingResults];
    }

    handleNavigation(event, type = 'navigate') {
        const url = typeof event === 'string' ? this.normalizeUrl(event) : this.normalizeUrl(window.location.href);
        this.navigationHistory.push({ url, type, timestamp: Date.now() });
        this.emit('urlChanged', { url, type });
    }

    handleHistoryChange(event) {
        const url = this.normalizeUrl(window.location.href);
        const type = event instanceof PopStateEvent ? 'pushstate' : 'hashchange';
        this.navigationHistory.push({ url, type, timestamp: Date.now() });
        this.emit('urlChanged', { url, type });
    }

    // Update the addTrackingResult method to use the navigation type map
    addTrackingResult(result) {
        // Validate required fields first
        if (!result) {
            console.error('Attempted to add null or undefined tracking result');
            return;
        }
        
        // Debug the incoming result
        console.log(`Adding tracking result: ${JSON.stringify(result)}`);
        
        // Skip results with null URLs
        if (result.current_url === 'null' || result.current_url === null) {
            console.log('Skipping result with null URL');
            return;
        }
        
        // IMPORTANT: Always use the spec file from options, which may have been updated from metadata
        const targetSpecFile = this.options.specFile;
        console.log(`Using spec file from options: ${targetSpecFile}`);
        
        // Map navigation type if possible
        let navigation_type = result.navigation_type || 'navigation';
        if (this.navigationTypeMap[navigation_type]) {
            navigation_type = this.navigationTypeMap[navigation_type];
        }
        
        let finalResult;
        
        // If result is in old format, convert it
        if (result.hasOwnProperty('fromUrl') && result.hasOwnProperty('toUrl')) {
            finalResult = {
                spec_file: targetSpecFile,
                test_name: result.testName || this.options.testName,
                previous_url: result.fromUrl === 'nullblank' || result.fromUrl === '' || 
                            result.fromUrl === null || result.fromUrl === 'about:blank' ? 
                            'null' : result.fromUrl,
                current_url: result.toUrl === 'nullblank' || result.toUrl === '' || 
                            result.toUrl === null || result.toUrl === 'about:blank' ? 
                            'null' : result.toUrl,
                timestamp: result.timestamp || new Date().toISOString(),
                navigation_type: navigation_type
            };
            console.log(`Converted old format to new format: ${JSON.stringify(finalResult)}`);
        } else {
            // Already in new format or unknown format
            finalResult = {
                ...result,
                spec_file: targetSpecFile,  // Always override with our target spec file
                test_name: result.test_name || this.options.testName,
                previous_url: result.previous_url || 'null',
                current_url: result.current_url || 'null',
                timestamp: result.timestamp || new Date().toISOString(),
                navigation_type: navigation_type
            };
            console.log(`Normalized result: ${JSON.stringify(finalResult)}`);
        }
        
        // Check again after normalization to ensure we're not adding null URLs
        if (finalResult.current_url === 'null') {
            console.log('Skipping normalized result with null URL');
            return;
        }
        
        // Add the result to the array
        this.trackingResults.push(finalResult);
        
        // Debug current tracking results count
        console.log(`Current tracking results count: ${this.trackingResults.length}`);
        
        // Write results to file immediately after each addition to prevent data loss
        this.saveResultsToFile();
    }

    // New method to save results to file immediately
    saveResultsToFile() {
        try {
            // Use the class method to ensure output files exist
            this.ensureOutputFilesExist();
            
            // If we have results to save, save them now to prevent data loss
            if (this.trackingResults && this.trackingResults.length > 0) {
                this.exportResults();
                console.log(`Saved ${this.trackingResults.length} tracking results immediately after addition`);
            }
        } catch (e) {
            console.error('Error in saveResultsToFile:', e);
        }
    }

    ensureOutputFilesExist() {
        try {
            // Try both "tests-results" and "test-results" directories
            const resultsDir1 = path.join(process.cwd(), 'tests-results');
            const resultsDir2 = path.join(process.cwd(), 'test-results');
            
            // Ensure the directories exist with proper permissions
            [resultsDir1, resultsDir2].forEach(dir => {
                if (!fs.existsSync(dir)) {
                    try {
                        fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
                        console.log(`Created directory: ${dir}`);
                    } catch (err) {
                        console.error(`Failed to create directory ${dir}:`, err);
                        // Try different approaches
                        try {
                            // Try mkdir directly if mkdirSync failed
                            require('child_process').execSync(`mkdir -p "${dir}"`);
                            console.log(`Created directory using command: ${dir}`);
                        } catch (cmdErr) {
                            console.error(`Failed to create directory using command ${dir}:`, cmdErr);
                        }
                    }
                }
                
                // Create test file in the directory
                const testFilePath = path.join(dir, 'url-tracking-results.json');
                if (!fs.existsSync(testFilePath)) {
                    try {
                        fs.writeFileSync(testFilePath, '[]', { encoding: 'utf8', mode: 0o666 });
                        console.log(`Created initial tracking file: ${testFilePath}`);
                        
                        // Test read
                        const content = fs.readFileSync(testFilePath, 'utf-8');
                        console.log(`Successfully read from ${testFilePath}: ${content.substring(0, 20)}`);
                    } catch (e) {
                        console.error(`Error creating test file ${testFilePath}:`, e);
                        
                        // Try with current directory as fallback
                        try {
                            const fallbackPath = path.join(process.cwd(), 'url-tracking-results.json');
                            fs.writeFileSync(fallbackPath, '[]', { encoding: 'utf8' });
                            console.log(`Created fallback file in current directory: ${fallbackPath}`);
                        } catch (fallbackErr) {
                            console.error('Failed to create fallback file in current directory:', fallbackErr);
                        }
                    }
                } else {
                    // Test if the file is readable/writable
                    try {
                        fs.accessSync(testFilePath, fs.constants.R_OK | fs.constants.W_OK);
                        console.log(`Verified read/write access to ${testFilePath}`);
                    } catch (accessErr) {
                        console.error(`Cannot access ${testFilePath}:`, accessErr);
                        try {
                            fs.chmodSync(testFilePath, 0o666);
                            console.log(`Updated permissions for ${testFilePath}`);
                        } catch (chmodErr) {
                            console.error(`Failed to update permissions for ${testFilePath}:`, chmodErr);
                        }
                    }
                }
            });
        } catch (e) {
            console.error('Error in ensureOutputFilesExist:', e);
        }
    }

    // New method to fetch test metadata from LambdaTest
    async fetchTestMetadata() {
        try {
            this.metadataFetchAttempts++;
            console.log(`Fetching test details from LambdaTest (attempt ${this.metadataFetchAttempts})...`);
            const response = JSON.parse(await this.page.evaluate(_ => {}, `lambdatest_action: ${JSON.stringify({ action: 'getTestDetails' })}`));
            
            console.log('Received test metadata:', JSON.stringify(response));
            this.testMetadata = response;
            
            // IMPORTANT: Extract spec file name directly from metadata
            if (response && response.data && response.data.name) {
                const testName = response.data.name;
                console.log(`Test name from metadata: ${testName}`);
                
                // Check if the test name contains a spec file reference
                const specFileMatch = testName.match(/\s-\s(.+\.spec\.js)$/);
                if (specFileMatch && specFileMatch[1]) {
                    const metadataSpecFile = specFileMatch[1];
                    console.log(`Extracted spec file from metadata: ${metadataSpecFile}`);
                    
                    // Update the spec file in our options
                    this.options.specFile = metadataSpecFile;
                    console.log(`Updated spec file from metadata: ${this.options.specFile}`);
                    
                    // Update all existing tracking results
                    if (this.trackingResults && this.trackingResults.length > 0) {
                        console.log(`Updating spec file in ${this.trackingResults.length} existing tracking results`);
                        this.trackingResults.forEach(result => {
                            result.spec_file = metadataSpecFile;
                        });
                    }
                } else {
                    console.log(`Could not extract spec file from metadata name: ${testName}`);
                    // Fallback: try to extract any filename that ends with .spec.js
                    const fallbackMatch = testName.match(/([^\s]+\.spec\.js)/);
                    if (fallbackMatch && fallbackMatch[1]) {
                        const fallbackSpecFile = fallbackMatch[1];
                        console.log(`Extracted spec file using fallback method: ${fallbackSpecFile}`);
                        this.options.specFile = fallbackSpecFile;
                        
                        // Update all existing tracking results
                        if (this.trackingResults && this.trackingResults.length > 0) {
                            this.trackingResults.forEach(result => {
                                result.spec_file = fallbackSpecFile;
                            });
                        }
                    }
                }
            }
            
            return response;
        } catch (error) {
            console.error(`Error fetching test metadata (attempt ${this.metadataFetchAttempts}):`, error);
            return null;
        }
    }
    
    // New method with retry logic to ensure metadata is fetched for every test session
    async fetchTestMetadataWithRetry() {
        // Reset attempts counter
        this.metadataFetchAttempts = 0;
        
        // First attempt
        let metadata = await this.fetchTestMetadata();
        
        // Retry with exponential backoff if needed
        let retryDelay = 1000; // Start with 1 second delay
        
        while (!metadata && this.metadataFetchAttempts < this.MAX_METADATA_FETCH_ATTEMPTS) {
            console.log(`Retrying metadata fetch in ${retryDelay}ms (attempt ${this.metadataFetchAttempts + 1}/${this.MAX_METADATA_FETCH_ATTEMPTS})`);
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            
            // Retry fetch
            metadata = await this.fetchTestMetadata();
            
            // Increase delay for next attempt (exponential backoff)
            retryDelay = Math.min(retryDelay * 2, 10000); // Cap at 10 seconds
        }
        
        if (!metadata) {
            console.error(`Failed to fetch test metadata after ${this.MAX_METADATA_FETCH_ATTEMPTS} attempts!`);
        }
        
        return metadata;
    }
}

module.exports = UrlTrackerPlugin;

/**
 * Helper function to create a Playwright fixture for URL tracking
 * This makes it easy to add the URL tracker to the global config
 * 
 * @example
 * // In your playwright.config.ts
 * import { createUrlTrackerFixture } from 'path/to/url-tracker';
 * 
 * const config: PlaywrightTestConfig = {
 *   use: {
 *     // other options...
 *     ...createUrlTrackerFixture({
 *       enabled: true,
 *       trackHashChanges: true,
 *     }),
 *   },
 * };
 */
module.exports.createUrlTrackerFixture = function createUrlTrackerFixture(options = {}) {
    // Don't cache spec file globally - detect it fresh for each test
    
    // Helper function to detect spec file from command line and environment
    function detectSpecFileFromEnvironment() {
        // function implementation...
    }
    
    // Helper function to extract test file from stack trace
    function getTestFileFromStack() {
        // function implementation...
    }

    // IMPORTANT: Add function to extract spec file from test name/metadata
    function extractSpecFileFromTestName(testName) {
        // function implementation...
    }

    // NEW: Perform global setup actions automatically
    // This eliminates the need for users to create a globalSetup file
    (function performGlobalSetup() {
        console.log('URL Tracker: Performing automatic global setup');
        
        // Ensure output directories exist
        try {
            const resultsDir1 = path.join(process.cwd(), 'tests-results');
            const resultsDir2 = path.join(process.cwd(), 'test-results');
            
            [resultsDir1, resultsDir2].forEach(dir => {
                if (!fs.existsSync(dir)) {
                    try {
                        fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
                        console.log(`URL Tracker: Created directory ${dir}`);
                    } catch (err) {
                        console.error(`URL Tracker: Failed to create directory ${dir}:`, err);
                        try {
                            require('child_process').execSync(`mkdir -p "${dir}"`);
                            console.log(`URL Tracker: Created directory using command: ${dir}`);
                        } catch (cmdErr) {
                            console.error(`URL Tracker: Failed to create directory using command ${dir}:`, cmdErr);
                        }
                    }
                }
                
                // Initialize results file if it doesn't exist
                const resultsFile = path.join(dir, 'url-tracking-results.json');
                if (!fs.existsSync(resultsFile)) {
                    try {
                        fs.writeFileSync(resultsFile, '[]', { encoding: 'utf8', mode: 0o666 });
                        console.log(`URL Tracker: Created initial results file ${resultsFile}`);
                    } catch (writeErr) {
                        console.error(`URL Tracker: Failed to create initial results file ${resultsFile}:`, writeErr);
                    }
                }
            });
        } catch (setupErr) {
            console.error('URL Tracker: Error during automatic global setup:', setupErr);
        }
    })();
    
    // NEW: Add additional process handlers to ensure results are saved
    // This will work alongside the existing process.on('exit') handler
    process.on('SIGINT', () => {
        console.log('URL Tracker: Caught SIGINT signal, saving results before exit');
        try {
            const globalObj = global || window || {};
            if (globalObj._activeUrlTrackers && Array.isArray(globalObj._activeUrlTrackers)) {
                console.log(`URL Tracker: Found ${globalObj._activeUrlTrackers.length} active trackers to save`);
                globalObj._activeUrlTrackers.forEach(tracker => {
                    if (tracker && typeof tracker.exportResults === 'function') {
                        console.log('URL Tracker: Saving tracker results on SIGINT');
                        tracker.exportResults();
                    }
                });
            }
        } catch (e) {
            console.error('URL Tracker: Error saving results on SIGINT:', e);
        }
        process.exit(0);
    });
    
    // Also handle SIGTERM for containerized environments
    process.on('SIGTERM', () => {
        console.log('URL Tracker: Caught SIGTERM signal, saving results before exit');
        try {
            const globalObj = global || window || {};
            if (globalObj._activeUrlTrackers && Array.isArray(globalObj._activeUrlTrackers)) {
                globalObj._activeUrlTrackers.forEach(tracker => {
                    if (tracker && typeof tracker.exportResults === 'function') {
                        console.log('URL Tracker: Saving tracker results on SIGTERM');
                        tracker.exportResults();
                    }
                });
            }
        } catch (e) {
            console.error('URL Tracker: Error saving results on SIGTERM:', e);
        }
        process.exit(0);
    });
    
    // Handle uncaught exceptions to ensure results are saved
    process.on('uncaughtException', (err) => {
        console.error('URL Tracker: Uncaught exception:', err);
        try {
            const globalObj = global || window || {};
            if (globalObj._activeUrlTrackers && Array.isArray(globalObj._activeUrlTrackers)) {
                globalObj._activeUrlTrackers.forEach(tracker => {
                    if (tracker && typeof tracker.exportResults === 'function') {
                        console.log('URL Tracker: Saving tracker results on uncaughtException');
                        tracker.exportResults();
                    }
                });
            }
        } catch (e) {
            console.error('URL Tracker: Error saving results on uncaughtException:', e);
        }
        process.exit(1);
    });

    return {
        // Setup a handler that will be executed before each test
        beforeEach: async ({ page }, testInfo) => {
            console.log(`Creating URL tracker for test: ${testInfo.title}`);
            
            // ... existing code to determine specFile ...

            // Create a URL tracker with the test name and spec file
            const testName = testInfo.title ? testInfo.title.replace(/\s+/g, '_').toLowerCase() : 'unknown_test';
            
            console.log(`Creating URL tracker with exactly this spec file: "${specFile}"`);
            
            const urlTracker = new UrlTrackerPlugin(page, {
                ...options,
                testName: options.testName || testName,
                specFile: specFile  // Force the spec file to be what we detected
            });

            // Store the tracker in the test info
            testInfo.urlTracker = urlTracker;
            
            try {
                // Initialize the tracker
                await urlTracker.init();
                console.log(`URL tracker initialized for test: ${testName}`);
            } catch (error) {
                console.error(`Error initializing URL tracker for test ${testName}:`, error);
            }
            
            // Add a cleanup handler that is equivalent to what would be in globalTeardown
            testInfo.onTestEnd(async () => {
                try {
                    if (urlTracker) {
                        console.log(`Test ended, cleaning up URL tracker for: ${testName}`);
                        await urlTracker.cleanup();
                    }
                } catch (e) {
                    console.error(`Error in URL tracker cleanup for ${testName}:`, e);
                }
            });
        },
        
        // Setup a handler that will be executed after each test
        afterEach: async ({ page }, testInfo) => {
            const urlTracker = testInfo.urlTracker;
            if (urlTracker) {
                // Try to record final navigation state if we haven't already
                try {
                    const url = page.url();
                    if (url && url !== 'about:blank') {
                        const normalizedUrl = urlTracker.normalizeUrl(url);
                        
                        // Only record final URL if it's not null
                        if (normalizedUrl !== 'null') {
                            // Use the spec file we've detected for this test session
                            const specFile = global._currentSpecFile || 'Unable to determine spec file';
                            
                            console.log(`Adding final navigation entry: ${normalizedUrl} (spec file: ${specFile})`);
                            
                            // Add to tracking results with new format
                            urlTracker.addTrackingResult({
                                spec_file: specFile,
                                test_name: testInfo.title ? testInfo.title.replace(/\s+/g, '_').toLowerCase() : 'unknown_test',
                                previous_url: urlTracker.lastUrl || 'null',
                                current_url: normalizedUrl,
                                timestamp: new Date().toISOString(),
                                navigation_type: 'final'
                            });
                        } else {
                            console.log('Final URL is null, skipping recording');
                        }
                    }
                } catch (e) {
                    console.log(`Warning: Could not record final navigation: ${e.message}`);
                }
                
                // Export tracking results one last time to ensure they're saved
                try {
                    urlTracker.exportResults();
                    console.log(`Exported final tracking results for test: ${testInfo.title}`);
                } catch (exportError) {
                    console.error(`Error exporting final tracking results for test ${testInfo.title}:`, exportError);
                }
            } else {
                console.log(`No URL tracker found for test: ${testInfo.title}`);
            }
        }
    };
};

// Enhance process exit handler to perform global teardown functionality
// This enhances the existing one defined earlier in the file
process.on('exit', () => {
    console.log('URL Tracker: Process exit detected - performing automatic global teardown');
    
    // Export tracking results from all active trackers
    try {
        const globalObj = global || window || {};
        if (globalObj._activeUrlTrackers && Array.isArray(globalObj._activeUrlTrackers)) {
            console.log(`URL Tracker: Found ${globalObj._activeUrlTrackers.length} active trackers to save during teardown`);
            globalObj._activeUrlTrackers.forEach(tracker => {
                if (tracker && typeof tracker.exportResults === 'function') {
                    console.log('URL Tracker: Saving tracker results during automatic teardown');
                    tracker.exportResults();
                }
            });
        }
        
        // Additional teardown steps if needed...
        
    } catch (e) {
        console.error('URL Tracker: Error during automatic global teardown:', e);
    }
}); 
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
// Import logger first
const { loggerInsights } = require('@lambdatest/sdk-utils');
const logger = loggerInsights;
let ApiUploader = null;
try {
    ApiUploader = require('../../../sdk-utils/src/insights/api-uploader');
} catch (e) {
    logger.error('Failed to import ApiUploader:', e.message);
}

// Import Enhanced HTML Reporter with multiple fallback strategies
let EnhancedHtmlReporter;
try {
    // Strategy 1: Try relative path import
    const { EnhancedHtmlReporter: Reporter } = require('../../../sdk-utils');
    EnhancedHtmlReporter = Reporter;
    console.log('✅ Enhanced HTML Reporter imported successfully (relative path)');
} catch (e1) {
    try {
        // Strategy 2: Try direct import from @lambdatest/sdk-utils
        const { EnhancedHtmlReporter: Reporter } = require('@lambdatest/sdk-utils');
        EnhancedHtmlReporter = Reporter;
        console.log('✅ Enhanced HTML Reporter imported successfully (direct package)');
    } catch (e2) {
        try {
            // Strategy 3: Try importing directly from the html-reporter-enhanced file
            const { EnhancedHtmlReporter: Reporter } = require('../../../sdk-utils/src/insights/html-reporter-enhanced');
            EnhancedHtmlReporter = Reporter;
            console.log('✅ Enhanced HTML Reporter imported successfully (direct file)');
        } catch (e3) {
            // All strategies failed
            console.warn('❌ Enhanced HTML Reporter not available. Install @lambdatest/sdk-utils for HTML reports.');
            console.warn('Import errors:');
            console.warn('  Relative path:', e1.message);
            console.warn('  Direct package:', e2.message);
            console.warn('  Direct file:', e3.message);
            EnhancedHtmlReporter = null;
        }
    }
}

// Track if we've shown the HTML report prompt
let hasShownReportPrompt = false;

// Store the HTML reporter instance globally
let globalHtmlReporter = null;

// Flag to track if all tests are complete
let allTestsComplete = false;

// Function to show the HTML report prompt and auto-open like Playwright
function showHtmlReportPrompt(htmlReporter, reportPath) {
    if (hasShownReportPrompt) return;
    
    // Store the reporter globally
    globalHtmlReporter = htmlReporter;
    
    // Show the prompt only once
    hasShownReportPrompt = true;
    
    // Add a small delay to ensure this shows after all test output
    setTimeout(() => {
        console.log('\n🎉 Enhanced URL Tracking Report Generated!');
        console.log(`📄 Report: ${reportPath}`);
        console.log('🔍 Features: Search, Filters, Metrics Dashboard, GitHub Primer UI');
        console.log('\n📝 Keyboard shortcuts:');
        console.log('  • Press "o" to open the report in your browser');
        console.log('  • Press "Ctrl+C" to exit\n');
        
        // Auto-open the report (like Playwright does)
        if (htmlReporter && typeof htmlReporter.openReport === 'function') {
            htmlReporter.openReport();
        }
        
        // Setup keyboard listener
        if (htmlReporter) {
            htmlReporter.setupKeyboardShortcut();
        }
    }, 100);
}

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
            preserveHistory: options.preserveHistory ?? true,
            // API upload options
            enableApiUpload: options.enableApiUpload ?? true,
            autoUploadOnTestEnd: options.autoUploadOnTestEnd ?? true,  // NEW: Automatic upload on test completion
            apiEndpoint: options.apiEndpoint,
            username: options.username,
            accessKey: options.accessKey,
            verbose: options.verbose ?? false  // Default to false
        };
        
        // DEBUG: Always log initialization info
        logger.info(`URL Tracker initializing for: ${this.options.testName}`);
        logger.info(`API upload enabled: ${this.options.enableApiUpload}`);
        
        // Only enable verbose mode if explicitly requested
        if (this.options.verbose && !logger.verboseMode) {
            process.env.DEBUG_URL_TRACKER = 'true';
            logger.verboseMode = true;
            logger.info('Verbose mode enabled for URL tracking debugging');
        }
        
        // Only log verbose messages if verbose mode is enabled
        if (logger.verboseMode) {
            logger.verbose(`URL Tracker Constructor Debug:`);
            logger.verbose(`  - enableApiUpload: ${this.options.enableApiUpload} (type: ${typeof this.options.enableApiUpload})`);
            logger.verbose(`  - enableApiUpload from options: ${options.enableApiUpload} (type: ${typeof options.enableApiUpload})`);
            logger.verbose(`  - testName: ${this.options.testName}`);
            logger.verbose(`  - specFile: ${this.options.specFile}`);
        }
        
        // Don't use hardcoded spec file names
        if (this.options.specFile === 'unknown') {
            logger.verbose('Spec file is unknown, will attempt to determine from test metadata');
        }
        
        // Initialize API uploader if enabled with comprehensive validation
        if (this.options.enableApiUpload) {
            logger.info('API upload is enabled, initializing API uploader with validation...');
            try {
                if (!ApiUploader) {
                    throw new Error('ApiUploader class not available - ensure @lambdatest/sdk-utils is installed');
                }
                
                // Check credentials before initializing
                const username = this.options.username || process.env.LT_USERNAME;
                const accessKey = this.options.accessKey || process.env.LT_ACCESS_KEY;
                
                if (!username || !accessKey) {
                    throw new Error('LT_USERNAME and LT_ACCESS_KEY environment variables are required for API upload');
                }
                
                // Validate credential format
                if (username.length < 3) {
                    throw new Error('LT_USERNAME appears to be invalid (too short)');
                }
                if (accessKey.length < 10) {
                    throw new Error('LT_ACCESS_KEY appears to be invalid (too short)');
                }
                
                // Initialize the uploader
                this.apiUploader = ApiUploader.forPlaywright({
                    apiEndpoint: this.options.apiEndpoint,
                    username: username,
                    accessKey: accessKey,
                    verbose: this.options.verbose || false,
                    timeout: 30000, // 30 second timeout
                    retries: 2 // Allow 2 retries
                });
                
                logger.success(`API uploader initialized successfully for worker ${this.workerId}`);
                logger.verbose(`API endpoint: ${this.apiUploader.apiEndpoint || 'default'}`);
                logger.verbose(`Username: ${username ? username.substring(0, 3) + '***' : 'not set'}`);
                logger.verbose(`Access key: ${accessKey ? '***' + accessKey.substring(accessKey.length - 3) : 'not set'}`);
                
                logger.info('API uploader ready - health checks removed for better performance');
                
            } catch (error) {
                logger.error(`Failed to initialize API uploader: ${error.message}`);
                
                // Provide helpful error messages
                if (error.message.includes('LT_USERNAME') || error.message.includes('LT_ACCESS_KEY')) {
                    logger.error('API Upload Setup Help:');
                    logger.error('  1. Get your credentials from: https://accounts.lambdatest.com/profile');
                    logger.error('  2. Set environment variables: LT_USERNAME=your_username LT_ACCESS_KEY=your_key');
                    logger.error('  3. Or pass them in options: { username: "...", accessKey: "..." }');
                }
                
                this.options.enableApiUpload = false; // Disable API upload on failure
                this.apiUploader = null;
            }
        } else {
            logger.warn('API upload is disabled');
        }
        
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
        this.cleanupCalled = false; // Track if cleanup has been called
        this.instanceId = `${this.options.testName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; // Unique instance ID
        
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
        
        // Register this tracker in the worker-specific list of active trackers
        try {
            // Playwright's worker index starts from 1, parallel index from 0
            // Use parallel index for consistency (0-based)
            const workerId = process.env.TEST_PARALLEL_INDEX || process.env.TEST_WORKER_INDEX || '0';
            this.workerId = workerId;
            
            logger.verbose(`URL Tracker initialized for worker ${workerId}`);
            
            const globalObj = global || window || {};
            if (!globalObj._activeUrlTrackers) {
                globalObj._activeUrlTrackers = [];
            }
            globalObj._activeUrlTrackers.push(this);
            
            // Initialize worker-specific storage
            if (!globalObj._workerData) {
                globalObj._workerData = {
                    workerId: workerId,
                    sessions: [],
                    apiSuccesses: [],
                    apiErrors: [],
                    apiSkips: [],
                    cleanupCalls: []
                };
            }
        } catch (e) {
            logger.error('Error registering tracker globally:', e);
        }
        
        // CRITICAL: Setup automatic cleanup for manual usage
        this.setupAutomaticCleanup();
        
        // NEW: Setup automatic test end detection for upload
        if (this.options.autoUploadOnTestEnd) {
            this.setupTestEndDetection();
        }
        
        // Create initial output files to ensure permissions are correct
        this.ensureOutputFilesExist();
        
        // Perform global setup automatically (similar to fixture)
        this.performInitialSetup();
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
            logger.info(`Initializing URL tracker for test: ${this.options.testName}`);
            
            // CRITICAL: Fetch test metadata first - this must happen for every test session
            await this.fetchTestMetadataWithRetry();
            
            // Wait for the page to be ready
            await this.page.waitForLoadState('domcontentloaded').catch(() => {
                // Ignore timeouts or navigation errors
            });

            // Get and normalize the initial URL 
            let pageUrl = this.page.url();
            // Convert directly to 'null' if it's about:blank
            if (pageUrl === 'about:blank') {
                pageUrl = 'null';
            }
            
            const currentUrl = this.normalizeUrl(pageUrl);
            
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
            }
            
            this.lastUrl = currentUrl;
            this.lastNavigationType = 'page_load';

            await this.setupPageListeners();
            this.isInitialized = true;
            logger.success('URL tracker initialized successfully');
            
            // Force an immediate navigation check after a short delay
            setTimeout(async () => {
                try {
                    const currentPageUrl = this.page.url();
                    const normalizedCurrentUrl = this.normalizeUrl(currentPageUrl);
                    
                    if (normalizedCurrentUrl !== 'null' && normalizedCurrentUrl !== this.lastUrl) {
                        logger.info(`Manual navigation check detected: ${normalizedCurrentUrl}`);
                        this.addTrackingResult({
                            spec_file: this.options.specFile,
                            test_name: this.options.testName,
                            previous_url: this.lastUrl || 'null',
                            current_url: normalizedCurrentUrl,
                            timestamp: new Date().toISOString(),
                            navigation_type: 'manual_check'
                        });
                        this.lastUrl = normalizedCurrentUrl;
                    }
                } catch (e) {
                    logger.verbose(`Manual navigation check failed: ${e.message}`);
                }
            }, 1000); // Check after 1 second
        } catch (error) {
            logger.error('Error initializing URL tracker:', error);
        }
    }

    async setupPageListeners() {
        if (!this.options.enabled) {
            return;
        }

        // Remove any existing listeners first
        this.page.removeAllListeners('framenavigated');

        // Listen for navigation events
        this.page.on('framenavigated', async (frame) => {
            if (frame === this.page.mainFrame()) {
                const newUrl = this.normalizeUrl(frame.url());
                logger.verbose(`Frame navigated event: ${newUrl}`);
                
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
                    
                    // Only log navigation captures in non-verbose mode
                    if (!logger.verboseMode) {
                        logger.navigation(`${oldUrl} → ${newUrl}`);
                    }
                }
            }
        });

        // Only expose the function if it hasn't been exposed yet
        if (!this.isFunctionExposed) {
            try {
                await this.page.exposeFunction('__trackHistoryChange', (url, type) => {
                    const newUrl = this.normalizeUrl(url);
                    logger.verbose(`History change detected: ${url} -> ${newUrl} (type: ${type})`);
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
                        logger.info('History change to null URL detected, skipping recording');
                    }
                });
                this.isFunctionExposed = true;
            } catch (error) {
                logger.error('Error exposing history change tracking function:', error);
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
                    logger.error('Tracking function not available');
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
                        logger.error('Error tracking pushState:', e);
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
                        logger.error('Error tracking replaceState:', e);
                    }
                    return result;
                };

                // Track hash changes
                window.addEventListener('hashchange', (event) => {
                    try {
                        window.__trackHistoryChange(window.location.href, 'hashchange');
                    } catch (e) {
                        logger.error('Error tracking hashchange:', e);
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
                        logger.error('Error tracking popstate:', e);
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
                        logger.error('Error tracking link clicks:', e);
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
                        logger.error('Error tracking form submission:', e);
                    }
                }, true);

                // Manually trigger for initial page load
                try {
                    window.__trackHistoryChange(window.location.href, 'navigation');
                } catch (e) {
                    logger.error('Error tracking initial page:', e);
                }
                
                // CRITICAL: Add upload trigger function for immediate upload
                window.__urlTrackerUploadNow = function() {
                    try {
                        // Signal that immediate upload should happen
                        window.__immediateUploadRequested = true;
                        console.log('URL Tracker: Immediate upload requested');
                    } catch (e) {
                        console.error('Error setting upload flag:', e);
                    }
                };
            }).catch((error) => {
                logger.error('Error adding init script:', error);
            });
            
            // Intercept Playwright navigation methods
            this.setupPlaywrightMethodInterception();
            
        } catch (error) {
            logger.error('Error setting up page listeners:', error);
        }
    }
    
    // New method to intercept Playwright navigation methods
    setupPlaywrightMethodInterception() {
        try {
            // Intercept page.goBack
            const originalGoBack = this.page.goBack;
            this.page.goBack = async (...args) => {
                this.lastNavigationType = 'back_pending';
                return await originalGoBack.apply(this.page, args);
            };
            
            // Intercept page.goForward
            const originalGoForward = this.page.goForward;
            this.page.goForward = async (...args) => {
                this.lastNavigationType = 'forward_pending';
                return await originalGoForward.apply(this.page, args);
            };
            
            // Intercept page.reload
            const originalReload = this.page.reload;
            this.page.reload = async (...args) => {
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
                    // Ignore errors in link detection
                }
                
                return await originalClick.apply(this.page, [selector, options]);
            };
            
            // Add recordNavigation method to page object
            this.page.recordNavigation = async (url) => {
                const currentUrl = url || this.page.url();
                const normalizedUrl = this.normalizeUrl(currentUrl);
                
                if (normalizedUrl !== 'null' && normalizedUrl !== this.lastUrl) {
                    const oldUrl = this.lastUrl || 'null';
                    this.lastUrl = normalizedUrl;
                    
                    this.addTrackingResult({
                        spec_file: this.options.specFile,
                        test_name: this.options.testName,
                        previous_url: oldUrl,
                        current_url: normalizedUrl,
                        timestamp: new Date().toISOString(),
                        navigation_type: 'manual_record'
                    });
                    
                    logger.info(`Manual navigation recorded: ${oldUrl} → ${normalizedUrl}`);
                }
            };
            
            // Add uploadResults method to page object for manual upload during test
            this.page.uploadTrackingResults = async () => {
                if (this.options.enableApiUpload && this.apiUploader && this.trackingResults.length > 0) {
                    logger.info(`[API] Manual upload triggered during test execution`);
                    
                    try {
                        // Fetch metadata if not available
                        if (!this.testMetadata) {
                            await this.fetchTestMetadataWithRetry();
                        }
                        
                        const trackingData = { navigations: this.trackingResults };
                        const testId = ApiUploader.extractTestId(this.testMetadata, this.options);
                        const uploadId = `manual_${this.workerId}_${Date.now()}`;
                        
                        const result = await this.performTrackedApiUpload(trackingData, testId, uploadId);
                        logger.success(`✅ [API] Manual upload completed successfully during test`);
                        return result;
                        
                    } catch (error) {
                        logger.error(`❌ [API] Manual upload failed during test: ${error.message}`);
                        throw error;
                    }
                } else {
                    logger.warn(`[API] Manual upload skipped - conditions not met`);
                    return null;
                }
            };
            
        } catch (e) {
            logger.error('Error setting up Playwright method interception:', e);
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

    // IMPROVED METHOD: Write worker-specific API results with atomic operations and file locking
    writeWorkerApiResult(resultData, type) {
        const maxRetries = 3;
        let attempt = 0;
        
        while (attempt < maxRetries) {
            try {
                const workerId = this.workerId || '0';
                const resultsDir = path.join(process.cwd(), 'test-results', 'workers');
                
                // Atomic directory creation with proper error handling
                this.ensureWorkerDirectoryExists(resultsDir);
                
                const fileName = `worker-${workerId}-api-${type}.jsonl`;
                const filePath = path.join(resultsDir, fileName);
                const lockFilePath = `${filePath}.lock`;
                
                // Ensure workerId is in the data for aggregation
                if (!resultData.workerId) {
                    resultData.workerId = workerId;
                }
                
                // Add timestamp for debugging
                resultData.writeTimestamp = new Date().toISOString();
                resultData.attempt = attempt + 1;
                
                const jsonLine = JSON.stringify(resultData) + '\n';
                
                // Implement file locking to prevent concurrent writes
                this.writeWithLock(filePath, lockFilePath, jsonLine);
                
                logger.info(`✅ Worker ${workerId}: API ${type} written to ${filePath} (attempt ${attempt + 1})`);
                logger.verbose(`  Data: ${JSON.stringify(resultData, null, 2)}`);
                
                // Verify file was written successfully
                this.verifyFileWrite(filePath, jsonLine);
                return; // Success, exit retry loop
                
            } catch (error) {
                attempt++;
                logger.error(`Error writing worker API result (attempt ${attempt}/${maxRetries}): ${error.message}`);
                
                if (attempt >= maxRetries) {
                    // Final attempt failed, try emergency backup
                    this.createEmergencyBackup(resultData, type);
                    throw error;
                }
                
                // Wait before retry with exponential backoff (shorter delays for cleanup)
                const delay = Math.pow(2, attempt) * 50; // 100ms, 200ms, 400ms (reduced from 200ms, 400ms, 800ms)
                require('child_process').execSync(`timeout /t 1 > nul 2>&1 || sleep 0.1`, { stdio: 'ignore' });
            }
        }
    }
    
    // Helper method for atomic directory creation
    ensureWorkerDirectoryExists(resultsDir) {
        try {
            // Use atomic operation - this will either succeed or fail cleanly
            fs.mkdirSync(resultsDir, { recursive: true, mode: 0o777 });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                // If it's not "already exists", it's a real error
                throw error;
            }
            // EEXIST is fine - directory already exists
        }
        
        // Verify directory is accessible
        try {
            fs.accessSync(resultsDir, fs.constants.W_OK);
        } catch (accessError) {
            throw new Error(`Worker directory not writable: ${resultsDir} - ${accessError.message}`);
        }
    }
    
    // Helper method for atomic file writes with locking
    writeWithLock(filePath, lockFilePath, content) {
        let lockAcquired = false;
        let lockAttempts = 0;
        const maxLockAttempts = 10;
        
        try {
            // Try to acquire lock
            while (!lockAcquired && lockAttempts < maxLockAttempts) {
                try {
                    fs.writeFileSync(lockFilePath, process.pid.toString(), { flag: 'wx' }); // wx = write exclusive (fails if exists)
                    lockAcquired = true;
                } catch (lockError) {
                    if (lockError.code === 'EEXIST') {
                        // Lock file exists, wait and retry
                        lockAttempts++;
                        const delay = 50 + (lockAttempts * 25); // Increasing delay
                        require('child_process').execSync(`timeout /t 1 > nul 2>&1 || sleep 0.${delay}`, { stdio: 'ignore' });
                        
                        // Check if lock is stale (older than 5 seconds)
                        try {
                            const lockStats = fs.statSync(lockFilePath);
                            const lockAge = Date.now() - lockStats.mtime.getTime();
                            if (lockAge > 5000) {
                                // Stale lock, remove it
                                fs.unlinkSync(lockFilePath);
                                logger.verbose(`Removed stale lock file: ${lockFilePath}`);
                            }
                        } catch (staleLockError) {
                            // Lock file might have been removed by another process
                        }
                    } else {
                        throw lockError;
                    }
                }
            }
            
            if (!lockAcquired) {
                throw new Error(`Failed to acquire file lock after ${maxLockAttempts} attempts`);
            }
            
            // Perform the actual write operation
            fs.appendFileSync(filePath, content, { encoding: 'utf8' });
            
        } finally {
            // Always release the lock
            if (lockAcquired) {
                try {
                    fs.unlinkSync(lockFilePath);
                } catch (unlockError) {
                    logger.verbose(`Warning: Could not remove lock file ${lockFilePath}: ${unlockError.message}`);
                }
            }
        }
    }
    
    // Helper method to verify file write
    verifyFileWrite(filePath, expectedContent) {
        try {
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            if (!fileContent.includes(expectedContent.trim())) {
                throw new Error('File content verification failed');
            }
            logger.verbose(`File write verified: ${filePath}`);
        } catch (verifyError) {
            throw new Error(`File write verification failed: ${verifyError.message}`);
        }
    }
    
    // Helper method for emergency backup when all retries fail
    createEmergencyBackup(resultData, type) {
        try {
            const emergencyDir = path.join(process.cwd(), 'emergency-backups');
            if (!fs.existsSync(emergencyDir)) {
                fs.mkdirSync(emergencyDir, { recursive: true });
            }
            
            const timestamp = Date.now();
            const emergencyFile = path.join(emergencyDir, `worker-${this.workerId}-${type}-${timestamp}.json`);
            fs.writeFileSync(emergencyFile, JSON.stringify(resultData, null, 2));
            logger.warn(`Emergency backup created: ${emergencyFile}`);
        } catch (emergencyError) {
            logger.error(`Failed to create emergency backup: ${emergencyError.message}`);
        }
    }
    

    
    // IMPROVED: Perform tracked API upload with immediate file writes and debugging
    async performTrackedApiUpload(trackingData, testId, uploadId) {
        logger.info(`[API TRACKED] Starting upload ${uploadId} for "${this.options.testName}"`);
        
        // IMMEDIATELY write "starting" status to file for debugging
        const startRecord = {
            testName: this.options.testName,
            testId: testId,
            uploadId: uploadId,
            timestamp: new Date().toISOString(),
            status: 'upload_started',
            workerId: this.workerId,
            navigationCount: trackingData.navigations.length,
            phase: 'cleanup'
        };
        
        try {
            this.writeWorkerApiResult(startRecord, 'start');
            logger.info(`✅ [API TRACKED] Upload start recorded for "${this.options.testName}"`);
        } catch (writeError) {
            logger.error(`❌ [API TRACKED] Failed to write start record: ${writeError.message}`);
        }
        
        try {
            logger.verbose(`[API TRACKED] Upload details:`);
            logger.verbose(`  Test ID: ${testId}`);
            logger.verbose(`  Navigation count: ${trackingData.navigations.length}`);
            logger.verbose(`  Upload ID: ${uploadId}`);
            logger.verbose(`  Worker ID: ${this.workerId}`);
            
            if (trackingData.navigations.length > 0) {
                logger.verbose(`  First navigation: ${JSON.stringify(trackingData.navigations[0], null, 2)}`);
            }
            
            // ENHANCED: Check if ApiUploader method exists with detailed validation
            logger.info(`[API TRACKED] Validating API uploader method availability...`);
            
            if (!this.apiUploader) {
                throw new Error('ApiUploader instance not available - check initialization');
            }
            
            if (typeof this.apiUploader.uploadTrackingResults !== 'function') {
                logger.error(`[API TRACKED] Available methods: ${Object.getOwnPropertyNames(this.apiUploader).join(', ')}`);
                throw new Error('ApiUploader.uploadTrackingResults method not available - check API uploader version');
            }
            
            logger.info(`[API TRACKED] API uploader validated, calling uploadTrackingResults...`);
            logger.verbose(`[API TRACKED] Upload parameters: testId=${testId}, navigationCount=${trackingData.navigations.length}`);
            
            // Perform the actual upload with more detailed logging and timeout protection
            const uploadStartTime = Date.now();
            logger.info(`[API TRACKED] Starting actual upload at ${new Date(uploadStartTime).toISOString()}`);
            
            // CRITICAL: Direct upload without timeout to ensure it completes
            const response = await this.apiUploader.uploadTrackingResults(trackingData, testId, {
                trackingType: 'url-tracker',
                framework: 'Playwright',
                uploadId: uploadId,
                workerId: this.workerId,
                phase: 'cleanup'
            });
            const uploadDuration = Date.now() - uploadStartTime;
            
            logger.info(`[API TRACKED] Upload completed in ${uploadDuration}ms`);
            
            // Record successful upload
            const successRecord = {
                testName: this.options.testName,
                testId: testId,
                uploadId: uploadId,
                timestamp: new Date().toISOString(),
                status: 'confirmed_success',
                response: response,
                workerId: this.workerId,
                navigationCount: trackingData.navigations.length,
                duration: uploadDuration
            };
            
            // Store in worker data
            if (!global._workerData) {
                global._workerData = { apiSuccesses: [], apiErrors: [], apiSkips: [], sessions: [], cleanupCalls: [] };
            }
            if (!global._workerData.apiSuccesses) {
                global._workerData.apiSuccesses = [];
            }
            global._workerData.apiSuccesses.push(successRecord);
            
            // Write to worker file immediately
            this.writeWorkerApiResult(successRecord, 'success');
            
            // Clean up from active uploads
            if (global._activeApiUploads && global._activeApiUploads.has(uploadId)) {
                const upload = global._activeApiUploads.get(uploadId);
                upload.status = 'completed';
                upload.endTime = Date.now();
                upload.duration = uploadDuration;
                upload.response = response;
                
                logger.success(`✅ [API TRACKED] Upload ${uploadId} SUCCESSFUL for "${this.options.testName}" (Duration: ${uploadDuration}ms)`);
                logger.verbose(`[API TRACKED] Response: ${JSON.stringify(response, null, 2)}`);
                
                // CRITICAL: Remove from active uploads immediately upon completion
                global._activeApiUploads.delete(uploadId);
                logger.info(`[API TRACKED] Removed completed upload ${uploadId} from active uploads (${global._activeApiUploads.size} remaining)`);
            }
            
            return response;
            
        } catch (error) {
            const uploadDuration = Date.now() - (startRecord.startTime || Date.now());
            logger.error(`❌ [API TRACKED] Upload ${uploadId} FAILED for "${this.options.testName}" after ${uploadDuration}ms: ${error.message}`);
            
            // Log detailed error information
            logger.error(`[API TRACKED] Error type: ${error.constructor.name}`);
            logger.error(`[API TRACKED] Error message: ${error.message}`);
            if (error.response) {
                logger.error(`[API TRACKED] Error response: ${JSON.stringify(error.response, null, 2)}`);
            }
            if (error.stack) {
                logger.verbose(`[API TRACKED] Error stack: ${error.stack}`);
            }
            
            // Record error with more detail
            const errorRecord = {
                testName: this.options.testName,
                testId: testId,
                uploadId: uploadId,
                error: error.message,
                errorType: error.constructor.name,
                timestamp: new Date().toISOString(),
                workerId: this.workerId,
                details: error.response ? error.response : 'No response details',
                stack: error.stack,
                type: 'upload_error',
                duration: uploadDuration
            };
            
            // Store in worker data
            if (!global._workerData) {
                global._workerData = { apiSuccesses: [], apiErrors: [], apiSkips: [], sessions: [], cleanupCalls: [] };
            }
            if (!global._workerData.apiErrors) {
                global._workerData.apiErrors = [];
            }
            global._workerData.apiErrors.push(errorRecord);
            
            // Write to worker file immediately
            this.writeWorkerApiResult(errorRecord, 'error');
            
            // Update active uploads and remove failed upload
            if (global._activeApiUploads && global._activeApiUploads.has(uploadId)) {
                const upload = global._activeApiUploads.get(uploadId);
                upload.status = 'failed';
                upload.error = error.message;
                upload.endTime = Date.now();
                upload.duration = uploadDuration;
                
                // CRITICAL: Remove from active uploads immediately upon failure
                global._activeApiUploads.delete(uploadId);
                logger.info(`[API TRACKED] Removed failed upload ${uploadId} from active uploads (${global._activeApiUploads.size} remaining)`);
            }
            
            // Re-throw the error so it can be handled by the caller
            throw error;
        }
    }

    // IMPROVED: Write worker-specific session data to files with better error handling and immediate writing
    writeWorkerSessionData(sessionData) {
        try {
            const workerId = this.workerId || '0';
            const resultsDir = path.join(process.cwd(), 'test-results', 'workers');
            
            // Ensure worker results directory exists with retry
            this.ensureWorkerDirectoryExists(resultsDir);
            
            const fileName = `worker-${workerId}-sessions.jsonl`;
            const filePath = path.join(resultsDir, fileName);
            const lockFilePath = `${filePath}.lock`;
            
            // Add metadata for debugging
            sessionData.writeTimestamp = new Date().toISOString();
            sessionData.workerId = workerId;
            sessionData.phase = 'cleanup';
            
            // Append to JSONL file (one JSON object per line) with locking
            const jsonLine = JSON.stringify(sessionData) + '\n';
            
            // Use the same locking mechanism as API results
            this.writeWithLock(filePath, lockFilePath, jsonLine);
            
            logger.info(`✅ Worker ${workerId}: Session data written to ${filePath}`);
            logger.verbose(`  Session: ${sessionData.session_id || 'no-id'} (${sessionData.navigations?.length || 0} navigations)`);
            
            // Verify file was written successfully
            this.verifyFileWrite(filePath, jsonLine);
            
        } catch (error) {
            logger.error(`❌ Error writing worker session data: ${error.message}`);
            
            // Try emergency backup for session data
            try {
                const emergencyDir = path.join(process.cwd(), 'emergency-backups');
                if (!fs.existsSync(emergencyDir)) {
                    fs.mkdirSync(emergencyDir, { recursive: true });
                }
                
                const timestamp = Date.now();
                const emergencyFile = path.join(emergencyDir, `worker-${this.workerId}-session-${timestamp}.json`);
                fs.writeFileSync(emergencyFile, JSON.stringify(sessionData, null, 2));
                logger.warn(`Emergency session backup created: ${emergencyFile}`);
            } catch (emergencyError) {
                logger.error(`Failed to create emergency session backup: ${emergencyError.message}`);
            }
        }
    }

    async destroy() {
        // If cleanup hasn't been called yet, call it first
        if (!this.cleanupCalled) {
            await this.cleanup();
        }
        
        this.page.removeAllListeners('framenavigated');
        if (!this.preserveHistory) {
            this.navigationHistory = [];
            this.trackingResults = [];
        }
        this.isInitialized = false;
        this.isFunctionExposed = false;
        
        // Clear cleanup timeout if it exists
        if (this.cleanupTimeout) {
            clearTimeout(this.cleanupTimeout);
            this.cleanupTimeout = null;
        }
        
        // Remove from global registry
        if (global._urlTrackerRegistry && global._urlTrackerRegistry.trackers) {
            global._urlTrackerRegistry.trackers.delete(this.instanceId);
        }
    }

    async cleanup() {
        // Prevent duplicate cleanup
        if (this.cleanupCalled) {
            logger.info(`Cleanup already called for test: ${this.options.testName}, skipping`);
            return;
        }
        
        this.cleanupCalled = true; // Mark as cleaned up
        
        // ENHANCED DEBUG: Log cleanup entry 
        logger.info(`URL Tracker cleanup starting for: ${this.options.testName}`);
        logger.verbose(`[UrlTracker] Test name: ${this.options.testName}`);
        logger.verbose(`[UrlTracker] API upload enabled: ${this.options.enableApiUpload} (type: ${typeof this.options.enableApiUpload})`);
        logger.verbose(`[UrlTracker] API uploader exists: ${!!this.apiUploader}`);
        logger.verbose(`[UrlTracker] Tracking results count: ${this.trackingResults ? this.trackingResults.length : 0}`);
        logger.verbose(`[UrlTracker] Navigation history count: ${this.navigationHistory ? this.navigationHistory.length : 0}`);
        logger.verbose(`[UrlTracker] Test metadata exists: ${!!this.testMetadata}`);
        
        logger.verbose(`=== CLEANUP DEBUG START ===`);
        logger.verbose(`Cleaning up URL tracker for test: ${this.options.testName}`);
        logger.verbose(`API upload enabled: ${this.options.enableApiUpload} (type: ${typeof this.options.enableApiUpload})`);
        logger.verbose(`API uploader exists: ${!!this.apiUploader}`);
        logger.verbose(`Tracking results count: ${this.trackingResults ? this.trackingResults.length : 0}`);
        
        // DEBUG: Log the actual tracking results
        if (this.trackingResults && this.trackingResults.length > 0) {
            logger.verbose(`Sample tracking result: ${JSON.stringify(this.trackingResults[0], null, 2)}`);
        } else {
            logger.verbose(`No tracking results available`);
        }
        
        // DEBUG: Add worker-specific tracking for cleanup calls
        if (!global._workerData) {
            global._workerData = {
                workerId: this.workerId || '0',
                sessions: [],
                apiSuccesses: [],
                apiErrors: [],
                apiSkips: [],
                cleanupCalls: []
            };
        }
        
        const cleanupCall = {
            testName: this.options.testName,
            timestamp: new Date().toISOString(),
            apiUploadEnabled: this.options.enableApiUpload,
            hasApiUploader: !!this.apiUploader,
            trackingResultsCount: this.trackingResults ? this.trackingResults.length : 0,
            workerId: this.workerId
        };
        
        global._workerData.cleanupCalls.push(cleanupCall);
        
        // ALWAYS write cleanup call to file for debugging
        try {
            const resultsDir = path.join(process.cwd(), 'test-results', 'workers');
            if (!fs.existsSync(resultsDir)) {
                fs.mkdirSync(resultsDir, { recursive: true, mode: 0o777 });
            }
            
            const cleanupFileName = `worker-${this.workerId || '0'}-cleanup.jsonl`;
            const cleanupFilePath = path.join(resultsDir, cleanupFileName);
            
            // Ensure workerId is in the data
            cleanupCall.workerId = this.workerId || '0';
            
            const cleanupLine = JSON.stringify(cleanupCall) + '\n';
            fs.appendFileSync(cleanupFilePath, cleanupLine, { encoding: 'utf8' });
            
            logger.info(`✅ Worker ${this.workerId}: Cleanup call written to ${cleanupFilePath}`);
        } catch (writeError) {
            logger.error(`Failed to write cleanup call: ${writeError.message}`);
        }
        
        // Make final attempt to fetch metadata if we don't have it
        if (!this.testMetadata) {
            logger.verbose(`Attempting to fetch test metadata...`);
            await this.fetchTestMetadataWithRetry();
        }
        
        // Ensure spec file is properly set for all results
        if (this.options.specFile && this.options.specFile !== 'unknown' && 
            this.options.specFile !== 'Unable to determine spec file') {
            if (this.trackingResults && this.trackingResults.length > 0) {
                this.trackingResults.forEach(result => {
                    result.spec_file = this.options.specFile;
                });
                console.log(`[UrlTracker] Updated ${this.trackingResults.length} results with spec file: ${this.options.specFile}`);
            }
        }
        
            // If no results, record the current page URL as a final result
        if (!this.trackingResults || this.trackingResults.length === 0) {
            console.log(`[UrlTracker] No tracking results found, attempting to record current page URL...`);
            try {
                const currentUrl = this.normalizeUrl(this.page.url());
                console.log(`[UrlTracker] Current page URL: ${currentUrl}`);
                if (currentUrl !== 'null' && currentUrl !== 'about:blank') {
                    this.addTrackingResult({
                        spec_file: this.options.specFile,
                        test_name: this.options.testName,
                        previous_url: this.lastUrl || 'null',
                        current_url: currentUrl,
                        timestamp: new Date().toISOString(),
                        navigation_type: 'final'
                    });
                    console.log(`[UrlTracker] Added final URL tracking result`);
                } else {
                    console.log(`[UrlTracker] Current URL is null or about:blank, not recording`);
                }
            } catch (e) {
                console.log(`[UrlTracker] Error recording final URL: ${e.message}`);
                logger.error('Error recording final URL:', e);
            }
        }
        
        // DEBUG: Check all conditions for API upload
        logger.info(`=== API UPLOAD CONDITIONS CHECK ===`);
        logger.info(`1. enableApiUpload: ${this.options.enableApiUpload}`);
        logger.info(`2. apiUploader exists: ${!!this.apiUploader}`);
        logger.info(`3. trackingResults.length > 0: ${this.trackingResults && this.trackingResults.length > 0}`);
        logger.info(`4. All conditions met: ${this.options.enableApiUpload && this.apiUploader && this.trackingResults.length > 0}`);
        logger.info(`5. Test name: "${this.options.testName}"`);
        logger.info(`6. Worker ID: ${this.workerId}`);
        logger.info(`7. Cleanup called flag: ${this.cleanupCalled}`);
        
        // CONDITIONAL: Only upload in cleanup if not already done in afterEach, page close, or auto upload
        if (this.options.enableApiUpload && this.apiUploader && this.trackingResults.length > 0 && !this._uploadCompletedInAfterEach && !this._uploadCompletedInPageClose && !this._uploadCompleted) {
            try {
                logger.info(`[API] Starting TRACKED API upload for "${this.options.testName}"`);
                
                // Initialize upload tracking if not exists
                if (!global._activeApiUploads) {
                    global._activeApiUploads = new Map();
                }
                
                // Validate tracking data immediately
                const trackingData = { navigations: this.trackingResults };
                logger.info(`[API TRACKED] Validating tracking data...`);
                
                if (ApiUploader.validateTrackingData(trackingData, 'url-tracker')) {
                    logger.info(`[API] Proceeding directly to upload (health checks removed for better performance)`);
                    
                    // Proceed directly to upload without any health checks or delays
                    
                    // Extract test ID
                    const testId = ApiUploader.extractTestId(this.testMetadata, this.options);
                    logger.verbose(`[API] Using test ID: ${testId}`);
                    
                    const uploadId = `${this.workerId}_${this.options.testName}_${Date.now()}`;
                    
                    // Create tracked upload promise with better error handling
                    const uploadPromise = this.performTrackedApiUpload(trackingData, testId, uploadId);
                    
                    // Store in active uploads for tracking
                    global._activeApiUploads.set(uploadId, {
                        testName: this.options.testName,
                        workerId: this.workerId,
                        promise: uploadPromise,
                        startTime: Date.now(),
                        status: 'in_progress'
                    });
                    
                    logger.info(`[API] Tracked upload initiated for "${this.options.testName}" (Upload ID: ${uploadId})`);
                    
                    // CRITICAL FIX: Use synchronous upload approach to prevent context closure interruption
                    logger.info(`[API] Starting SYNCHRONOUS upload to prevent context closure interruption`);
                    
                    try {
                        // Use setImmediate to ensure upload starts immediately in next tick
                        const uploadResult = await new Promise((resolve, reject) => {
                            setImmediate(async () => {
                                try {
                                    logger.info(`[API] Executing upload in immediate callback`);
                                    const result = await uploadPromise;
                                    resolve(result);
                                } catch (error) {
                                    reject(error);
                                }
                            });
                            
                            // Add a much shorter timeout for cleanup phase
                            setTimeout(() => {
                                reject(new Error('Upload timeout during cleanup'));
                            }, 1500); // 1.5 seconds max for cleanup
                        });
                        
                        // Upload completed successfully
                        const upload = global._activeApiUploads.get(uploadId);
                        if (upload) {
                            upload.status = 'completed';
                            upload.result = uploadResult;
                            logger.success(`✅ [API] SYNCHRONOUS upload completed for "${this.options.testName}"`);
                        }
                        
                    } catch (uploadError) {
                        if (uploadError.message === 'Upload timeout during cleanup') {
                            // This is expected during cleanup - context is closing
                            logger.warn(`⏰ [API] Upload timeout during cleanup for "${this.options.testName}" - context closing`);
                            
                            // Try one more immediate attempt without waiting
                            try {
                                logger.info(`[API] Making final immediate upload attempt`);
                                // Fire-and-forget final attempt
                                uploadPromise.then(result => {
                                    logger.success(`✅ [API] Final upload attempt succeeded for "${this.options.testName}"`);
                                    const upload = global._activeApiUploads.get(uploadId);
                                    if (upload) {
                                        upload.status = 'completed_after_timeout';
                                        upload.result = result;
                                    }
                                }).catch(finalError => {
                                    logger.error(`❌ [API] Final upload attempt failed for "${this.options.testName}": ${finalError.message}`);
                                    const upload = global._activeApiUploads.get(uploadId);
                                    if (upload) {
                                        upload.status = 'failed_after_timeout';
                                        upload.error = finalError.message;
                                    }
                                });
                            } catch (finalAttemptError) {
                                logger.error(`❌ [API] Could not make final upload attempt: ${finalAttemptError.message}`);
                            }
                            
                            // Mark as background operation
                            const upload = global._activeApiUploads.get(uploadId);
                            if (upload) {
                                upload.status = 'background_after_cleanup';
                                upload.note = 'Upload continuing in background after context closure';
                            }
                        } else {
                            throw uploadError;
                        }
                    }
                    
                } else {
                    throw new Error('Invalid tracking data - cannot upload to API');
                }
                
            } catch (error) {
                logger.error(`[API] TRACKED ERROR for "${this.options.testName}" (Worker ${this.workerId}): ${error.message}`);
                
                // Store the error in worker-specific data
                const errorRecord = {
                    testName: this.options.testName,
                    error: error.message,
                    timestamp: new Date().toISOString(),
                    workerId: this.workerId,
                    type: 'tracked_error',
                    stack: error.stack
                };
                global._workerData.apiErrors.push(errorRecord);
                
                // Write worker-specific error to file immediately
                this.writeWorkerApiResult(errorRecord, 'error');
                
                logger.info(`[API] Tracked error stored for "${this.options.testName}" in worker ${this.workerId}`);
                
                // Continue with cleanup even if API upload fails
            }
        } else {
            if (this._uploadCompletedInAfterEach) {
                logger.info(`[API] SKIPPED for "${this.options.testName}" - upload already completed in afterEach`);
            } else if (this._uploadCompletedInPageClose) {
                logger.info(`[API] SKIPPED for "${this.options.testName}" - upload already completed in page close`);
            } else if (this._uploadCompleted) {
                logger.info(`[API] SKIPPED for "${this.options.testName}" - upload already completed by auto upload`);
            } else {
                logger.warn(`[API] SKIPPED for "${this.options.testName}" (Worker ${this.workerId}):`);
                logger.warn(`[API]   - API upload enabled: ${this.options.enableApiUpload}`);
                logger.warn(`[API]   - API uploader exists: ${!!this.apiUploader}`);
                logger.warn(`[API]   - Tracking results count: ${this.trackingResults ? this.trackingResults.length : 0}`);
            
            // Debug credentials if API upload is enabled but uploader doesn't exist
            if (this.options.enableApiUpload && !this.apiUploader) {
                const username = this.options.username || process.env.LT_USERNAME;
                const accessKey = this.options.accessKey || process.env.LT_ACCESS_KEY;
                logger.warn(`[API]   - Username available: ${!!username}`);
                logger.warn(`[API]   - Access key available: ${!!accessKey}`);
            }
            
            // Store the skip reason in worker-specific data
            const skipRecord = {
                testName: this.options.testName,
                reason: `enableApiUpload: ${this.options.enableApiUpload}, hasUploader: ${!!this.apiUploader}, resultsCount: ${this.trackingResults ? this.trackingResults.length : 0}`,
                timestamp: new Date().toISOString(),
                workerId: this.workerId
            };
            global._workerData.apiSkips.push(skipRecord);
            
            // Write worker-specific skip to file immediately
            this.writeWorkerApiResult(skipRecord, 'skip');
            
            logger.info(`[API] Skip recording completed for "${this.options.testName}" in worker ${this.workerId}`);
            }
        }
        
        console.log(`[UrlTracker] === CLEANUP DEBUG END ===`);
        logger.info(`=== CLEANUP DEBUG END ===`);
        
        // Before cleanup, export the results to file (existing functionality)
        this.exportResults();
        
        // CRITICAL: Store session data IMMEDIATELY before any API uploads to ensure it's preserved
        if (this.trackingResults && this.trackingResults.length > 0) {
            try {
                logger.info('IMMEDIATELY storing session data for final HTML report generation...');
                
                // Create session data format expected by EnhancedHtmlReporter
                const sessionData = {
                    metadata: this.testMetadata || {},
                    navigations: this.trackingResults,
                    session_id: this.testMetadata?.session_id || this.testMetadata?.build_id || `session_${Date.now()}`,
                    spec_file: this.options.specFile,
                    test_name: this.options.testName,
                    workerId: this.workerId
                };
                
                // CRITICAL: Write session data to worker file IMMEDIATELY (before API upload)
                logger.info(`Writing session data immediately for "${this.options.testName}" with ${this.trackingResults.length} navigations`);
                this.writeWorkerSessionData(sessionData);
                
                // Store session data in worker-specific storage
                if (!global._workerData) {
                    global._workerData = { sessions: [], apiSuccesses: [], apiErrors: [], apiSkips: [], cleanupCalls: [] };
                }
                global._workerData.sessions.push(sessionData);
                
                // Debug: Log session data details
                logger.info(`Session data details for ${this.options.testName}:`);
                logger.info(`  Session ID: ${sessionData.session_id}`);
                logger.info(`  Test Name: ${sessionData.test_name || this.options.testName}`);
                logger.info(`  Spec File: ${sessionData.spec_file}`);
                logger.info(`  Worker ID: ${this.workerId}`);
                logger.info(`  Worker sessions count: ${global._workerData.sessions.length}`);
                
                // Create or get the global Enhanced HTML reporter (ensure it's always available if EnhancedHtmlReporter exists)
                if (EnhancedHtmlReporter && !globalHtmlReporter) {
                    try {
                        globalHtmlReporter = new EnhancedHtmlReporter({
                            outputDir: 'test-results',
                            title: 'Playwright URL Tracking Report',
                            theme: 'dark', // Default to dark theme
                            enableKeyboardShortcut: true,
                            autoOpen: false, // We'll handle opening manually for better control
                            enableSearch: true,
                            enableFilters: true,
                            showMetrics: true,
                            showTimeline: true
                        });
                        logger.info('Enhanced HTML Reporter initialized successfully');
                    } catch (reporterError) {
                        logger.error(`Failed to initialize Enhanced HTML Reporter: ${reporterError.message}`);
                        globalHtmlReporter = null;
                    }
                } else if (!EnhancedHtmlReporter) {
                    logger.verbose('Enhanced HTML Reporter not available - install @lambdatest/sdk-utils for HTML reports');
                }
                
                // FALLBACK: For non-fixture usage, generate report immediately if this appears to be the last test
                // This handles cases where the global cleanup might not be called
                if (!global._isUsingFixtureFramework) {
                    // Set a timeout to generate the report if no more sessions are added soon
                    clearTimeout(global._htmlReportTimeout);
                    global._htmlReportTimeout = setTimeout(() => {
                        try {
                            if (globalHtmlReporter && global._urlTrackerSessions && global._urlTrackerSessions.length > 0) {
                                logger.info(`Generating fallback HTML report with ${global._urlTrackerSessions.length} sessions...`);
                                const htmlReportPath = globalHtmlReporter.generateReport(global._urlTrackerSessions, 'playwright');
                                logger.success(`Fallback HTML report generated: ${htmlReportPath}`);
                            }
                        } catch (error) {
                            logger.error('Error generating fallback HTML report:', error);
                        }
                    }, 5000); // Wait 5 seconds before generating fallback report
                }
                
            } catch (htmlError) {
                logger.error(`Failed to store session data: ${htmlError.message}`);
            }
        }
        
        // IMMEDIATE: Complete cleanup without delays
        logger.info(`[CLEANUP] Cleanup completed IMMEDIATELY for "${this.options.testName}"`);
        
        this.preserveHistory = true;
        await this.destroy();
    }

    exportResults(outputPath = null) {
        // CRITICAL: Extract spec file from metadata if available
        let metadataSpecFile = null;
        if (this.testMetadata && this.testMetadata.data && this.testMetadata.data.name) {
            const testName = this.testMetadata.data.name;
            const specFileMatch = testName.match(/\s-\s(.+\.spec\.js)$/);
            if (specFileMatch && specFileMatch[1]) {
                metadataSpecFile = specFileMatch[1];
                
                // Override the spec file in options
                if (this.options.specFile !== metadataSpecFile) {
                    this.options.specFile = metadataSpecFile;
                }
            } else {
                // Fallback: try to extract any filename that ends with .spec.js
                const fallbackMatch = testName.match(/([^\s]+\.spec\.js)/);
                if (fallbackMatch && fallbackMatch[1]) {
                    metadataSpecFile = fallbackMatch[1];
                    
                    // Override the spec file in options
                    if (this.options.specFile !== metadataSpecFile) {
                        this.options.specFile = metadataSpecFile;
                    }
                }
            }
        }
        
        // IMPORTANT: Force update the spec file before export in all tracking results
        if (this.trackingResults && this.trackingResults.length > 0) {
            // Ensure all tracking results use the current spec file
            const currentSpecFile = metadataSpecFile || this.options.specFile;
            
            this.trackingResults.forEach(result => {
                if (result.spec_file !== currentSpecFile) {
                    result.spec_file = currentSpecFile;
                }
            });
        }
        
        // Force fix our tracking results one more time before export
        if (this.trackingResults && this.trackingResults.length > 0) {
            // Count how many have unknown spec file
            const unknownCount = this.trackingResults.filter(r => r.spec_file === 'unknown').length;
            if (unknownCount > 0) {
                // Fix all unknown spec files
                this.trackingResults.forEach(result => {
                    if (result.spec_file === 'unknown') {
                        result.spec_file = metadataSpecFile || "Unable to determine spec file";
                    }
                });
            }
        }
        
        // Use only test-results folder
        const outputPaths = [];
        
        // Make sure we have tracking results
        if (!this.trackingResults || this.trackingResults.length === 0) {
            // Only create a fallback if we're sure we need it
            try {
                const currentUrl = this.normalizeUrl(this.page.url());
                
                // Check if the URL is valid and worth recording
                if (currentUrl !== 'null' && currentUrl !== 'about:blank') {
                    this.addTrackingResult({
                        spec_file: this.options.specFile,
                        test_name: this.options.testName,
                        previous_url: 'null',
                        current_url: currentUrl,
                        timestamp: new Date().toISOString(),
                        navigation_type: 'fallback'
                    });
                }
            } catch (e) {
                logger.error('Failed to add fallback tracking result:', e);
                
                // Only add a dummy result if absolutely necessary
                if (!this.trackingResults || this.trackingResults.length === 0) {
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
            return;
        }
        
        if (!outputPath) {
            // Use only test-results directory
            const resultsDir = path.join(process.cwd(), 'test-results');
            
            // Ensure the directory exists with proper permissions
            if (!fs.existsSync(resultsDir)) {
                try {
                    fs.mkdirSync(resultsDir, { recursive: true, mode: 0o777 });
                } catch (err) {
                    logger.error(`Failed to create directory ${resultsDir}:`, err);
                    // Try with different approach for Windows
                    try {
                        require('child_process').execSync(`mkdir -p "${resultsDir}"`);
                    } catch (cmdErr) {
                        logger.error(`Failed to create directory using command ${resultsDir}:`, cmdErr);
                    }
                }
            }
            
            outputPaths.push(path.join(resultsDir, 'url-tracking-results.json'));
        } else {
            outputPaths.push(outputPath);
        }

        // Export to all output paths
        outputPaths.forEach(outputPath => {
            try {
                // Ensure the directory exists with full permissions
                const outputDir = path.dirname(outputPath);
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true, mode: 0o777 });
                }

                // Create current session data structure with consistent session ID per test
                const testIdentifier = `${this.options.testName}_${this.options.specFile}`.replace(/\s+/g, '_').toLowerCase();
                const currentSessionId = this.testMetadata?.session_id || this.testMetadata?.build_id || `session_${testIdentifier}_${Date.now()}`;
                
                const currentSessionData = {
                    metadata: this.testMetadata || {},
                    navigations: this.trackingResults,
                    session_id: currentSessionId,
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
                                    logger.error('Existing file is in an unknown format, creating a new one');
                                    shouldCreateNewFile = true;
                                }
                            } catch (parseError) {
                                logger.error('Error parsing existing results file, creating a new one:', parseError);
                                shouldCreateNewFile = true;
                            }
                        }
                    } catch (readError) {
                        logger.error('Error reading results file, creating a new one:', readError);
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
                        allSessions = [];
                    } catch (createError) {
                        logger.error(`Error creating new results file ${outputPath}:`, createError);
                        
                        // Try writing to current directory as a fallback
                        const fallbackPath = path.join(process.cwd(), 'url-tracking-results.json');
                        try {
                            fs.writeFileSync(fallbackPath, '[]', { encoding: 'utf8' });
                            outputPath = fallbackPath; // Update the path for further operations
                            allSessions = [];
                        } catch (fallbackErr) {
                            logger.error('Failed to create fallback file in current directory:', fallbackErr);
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

                // Check if this session already exists in the file (based on test name and spec file)
                const existingSessionIndex = allSessions.findIndex(session => 
                    session.session_id === currentSessionId || 
                    (session.metadata && session.metadata.session_id === currentSessionId) ||
                    (session.metadata && session.metadata.build_id === currentSessionId) ||
                    // Also match by test name and spec file to consolidate duplicate sessions
                    (session.spec_file === this.options.specFile && 
                     session.metadata && session.metadata.data && 
                     session.metadata.data.name && session.metadata.data.name.includes(this.options.testName))
                );

                if (existingSessionIndex >= 0) {
                    allSessions[existingSessionIndex] = currentSessionData;
                } else {
                    // Add current session to all sessions
                    allSessions.push(currentSessionData);
                }

                // Set file permissions to ensure it's writable
                try {
                    if (fs.existsSync(outputPath)) {
                        fs.chmodSync(outputPath, 0o666); // Make sure file is readable and writable
                    }
                } catch (permError) {
                    logger.error(`Error setting permissions on ${outputPath}:`, permError);
                }

                // Write the results to the file using multiple methods to ensure success
                try {
                    // First try with standard fs.writeFileSync
                    fs.writeFileSync(outputPath, JSON.stringify(allSessions, null, 2), { encoding: 'utf8', mode: 0o666 });
                    // Log results saved only in verbose mode or once per test
                    if (outputPath.includes('test-results')) {
                        logger.verbose(`URL tracking results saved to: ${outputPath}`);
                    } else {
                        logger.export(`Results saved successfully`);
                    }
                } catch (writeError) {
                    logger.error(`Error writing to ${outputPath} with writeFileSync:`, writeError);
                    
                    // Try alternate method with fs.writeFile
                    try {
                        fs.writeFile(outputPath, JSON.stringify(allSessions, null, 2), { encoding: 'utf8', mode: 0o666 }, (err) => {
                            if (err) {
                                logger.error(`Error writing to ${outputPath} with writeFile:`, err);
                            }
                        });
                    } catch (writeError2) {
                        logger.error(`Error writing to ${outputPath} with writeFile:`, writeError2);
                    }
                    
                    // Try writing to current directory as a last resort
                    const emergencyPath = path.join(process.cwd(), 'url-tracking-emergency.json');
                    try {
                        fs.writeFileSync(emergencyPath, JSON.stringify(allSessions, null, 2), { encoding: 'utf8' });
                        logger.info(`Emergency backup saved to ${emergencyPath}`);
                    } catch (emergencyError) {
                        logger.error(`Failed to create emergency file ${emergencyPath}:`, emergencyError);
                    }
                }
            } catch (error) {
                logger.error('Error exporting URL tracking results:', error);
                
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
                    logger.info(`Backup results saved to ${backupPath}`);
                } catch (backupError) {
                    logger.error('Failed to create backup results file:', backupError);
                }
            }
        });
    }

    getTrackingResults() {
        logger.info(`Getting ${this.trackingResults.length} tracking results for test: ${this.options.testName || 'unknown'}`);
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
            logger.error('Attempted to add null or undefined tracking result');
            return;
        }
        
        // Skip results with null URLs
        if (result.current_url === 'null' || result.current_url === null) {
            return;
        }
        
        // IMPORTANT: Always use the spec file from options, which may have been updated from metadata
        const targetSpecFile = this.options.specFile;
        
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
        }
        
        // Check again after normalization to ensure we're not adding null URLs
        if (finalResult.current_url === 'null') {
            return;
        }
        
        // Add the result to the array
        this.trackingResults.push(finalResult);
        
        // Update last navigation time for auto upload detection
        if (this.options.autoUploadOnTestEnd) {
            this.lastNavigationTime = Date.now();
        }
        
        // Log the navigation event
        logger.navigation(`${finalResult.previous_url} → ${finalResult.current_url} (${navigation_type})`);
        
        // Write results to file immediately after each addition to prevent data loss
        this.saveResultsToFile();
    }

    // New method to save results to file immediately
    saveResultsToFile() {
        try {
            // Use the class method to ensure output files exist
            this.ensureOutputFilesExist();
            
            // IMPORTANT: Do NOT export results after every navigation
            // Results will be exported only once during cleanup to prevent duplicates
            // This method now only ensures output files exist for final export
            
        } catch (e) {
            logger.error('Error in saveResultsToFile:', e);
        }
    }

    ensureOutputFilesExist() {
        try {
            // Use only test-results directory
            const resultsDir = path.join(process.cwd(), 'test-results');
            
            // Ensure the directory exists with proper permissions
            if (!fs.existsSync(resultsDir)) {
                try {
                    fs.mkdirSync(resultsDir, { recursive: true, mode: 0o777 });
                } catch (err) {
                    logger.error(`Failed to create directory ${resultsDir}:`, err);
                    // Try different approaches
                    try {
                        // Try mkdir directly if mkdirSync failed
                        require('child_process').execSync(`mkdir -p "${resultsDir}"`);
                    } catch (cmdErr) {
                        logger.error(`Failed to create directory using command ${resultsDir}:`, cmdErr);
                    }
                }
            }
            
            // Create test file in the directory
            const testFilePath = path.join(resultsDir, 'url-tracking-results.json');
            if (!fs.existsSync(testFilePath)) {
                try {
                    fs.writeFileSync(testFilePath, '[]', { encoding: 'utf8', mode: 0o666 });
                    
                    // Test read
                    const content = fs.readFileSync(testFilePath, 'utf-8');
                } catch (e) {
                    logger.error(`Error creating test file ${testFilePath}:`, e);
                    
                    // Try with current directory as fallback
                    try {
                        const fallbackPath = path.join(process.cwd(), 'url-tracking-results.json');
                        fs.writeFileSync(fallbackPath, '[]', { encoding: 'utf8' });
                    } catch (fallbackErr) {
                        logger.error('Failed to create fallback file in current directory:', fallbackErr);
                    }
                }
            } else {
                // Test if the file is readable/writable
                try {
                    fs.accessSync(testFilePath, fs.constants.R_OK | fs.constants.W_OK);
                } catch (accessErr) {
                    logger.error(`Cannot access ${testFilePath}:`, accessErr);
                    try {
                        fs.chmodSync(testFilePath, 0o666);
                    } catch (chmodErr) {
                        logger.error(`Failed to update permissions for ${testFilePath}:`, chmodErr);
                    }
                }
            }
        } catch (e) {
            logger.error('Error in ensureOutputFilesExist:', e);
        }
    }

    // New method to fetch test metadata from LambdaTest
    async fetchTestMetadata() {
        try {
            this.metadataFetchAttempts++;
            const response = JSON.parse(await this.page.evaluate(_ => {}, `lambdatest_action: ${JSON.stringify({ action: 'getTestDetails' })}`));
            
            this.testMetadata = response;
            
            // IMPORTANT: Extract spec file name directly from metadata
            if (response && response.data && response.data.name) {
                const testName = response.data.name;
                
                // Check if the test name contains a spec file reference
                const specFileMatch = testName.match(/\s-\s(.+\.spec\.js)$/);
                if (specFileMatch && specFileMatch[1]) {
                    const metadataSpecFile = specFileMatch[1];
                    
                    // Update the spec file in our options
                    this.options.specFile = metadataSpecFile;
                    
                    // Update all existing tracking results
                    if (this.trackingResults && this.trackingResults.length > 0) {
                        this.trackingResults.forEach(result => {
                            result.spec_file = metadataSpecFile;
                        });
                    }
                } else {
                    // Fallback: try to extract any filename that ends with .spec.js
                    const fallbackMatch = testName.match(/([^\s]+\.spec\.js)/);
                    if (fallbackMatch && fallbackMatch[1]) {
                        const fallbackSpecFile = fallbackMatch[1];
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
            logger.error(`Error fetching test metadata (attempt ${this.metadataFetchAttempts}):`, error);
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
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            
            // Retry fetch
            metadata = await this.fetchTestMetadata();
            
            // Increase delay for next attempt (exponential backoff)
            retryDelay = Math.min(retryDelay * 2, 10000); // Cap at 10 seconds
        }
        
        if (!metadata) {
            logger.error(`Failed to fetch test metadata after ${this.MAX_METADATA_FETCH_ATTEMPTS} attempts!`);
        }
        
        return metadata;
    }

    // NEW METHOD: Setup automatic cleanup triggers for manual usage
    setupAutomaticCleanup() {
        // Register in global registry for cleanup
        if (!global._urlTrackerRegistry) {
            global._urlTrackerRegistry = {
                trackers: new Map(),
                cleanupHandlersRegistered: false,
                testEndCallbacks: new Set()
            };
        }
        
        // Add this instance to the registry
        global._urlTrackerRegistry.trackers.set(this.instanceId, this);
        
        // Setup page event listeners for automatic cleanup and CRITICAL API upload
        if (this.page) {
            // CRITICAL: Listen for page close event to upload BEFORE context closes
            this.page.once('close', async () => {
                logger.info(`Page closed for test ${this.options.testName}, triggering IMMEDIATE API upload and cleanup`);
                
                // IMMEDIATE API upload BEFORE any other cleanup
                if (this.options.enableApiUpload && this.apiUploader && this.trackingResults.length > 0 && !this._uploadCompletedInPageClose) {
                    try {
                        logger.info(`PAGE CLOSE: Performing IMMEDIATE API upload for "${this.options.testName}"`);
                        
                        // Ensure metadata is available
                        if (!this.testMetadata) {
                            await this.fetchTestMetadataWithRetry();
                        }
                        
                        const trackingData = { navigations: this.trackingResults };
                        const testId = ApiUploader.extractTestId(this.testMetadata, this.options);
                        const uploadId = `pageclose_${this.workerId}_${Date.now()}`;
                        
                        // Perform immediate upload with very short timeout
                        const result = await Promise.race([
                            this.performTrackedApiUpload(trackingData, testId, uploadId),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Page close upload timeout')), 1000))
                        ]);
                        
                        logger.success(`✅ PAGE CLOSE: API upload completed for "${this.options.testName}"`);
                        this._uploadCompletedInPageClose = true;
                        
                    } catch (uploadError) {
                        logger.error(`❌ PAGE CLOSE: Upload failed for "${this.options.testName}": ${uploadError.message}`);
                    }
                }
                
                await this.performAutoCleanup();
            });
            
            // Listen for context close event if available
            try {
                const context = this.page.context();
                if (context) {
                    context.once('close', async () => {
                        logger.info(`Context closed for test ${this.options.testName}, triggering automatic cleanup`);
                        await this.performAutoCleanup();
                    });
                }
            } catch (e) {
                // Context might not be available in all scenarios
                logger.debug(`Could not attach to context close event: ${e.message}`, true);
            }
        }
        
        // Register global cleanup handlers if not already registered
        if (!global._urlTrackerRegistry.cleanupHandlersRegistered) {
            this.registerGlobalCleanupHandlers();
        }
        
        // Set a timeout-based cleanup as ultimate fallback
        this.cleanupTimeout = setTimeout(async () => {
            if (!this.cleanupCalled) {
                logger.warn(`Timeout-based cleanup triggered for test ${this.options.testName} after 5 minutes`);
                await this.performAutoCleanup();
            }
        }, 300000); // 5 minutes
    }
    
    // NEW METHOD: Register global cleanup handlers once
    registerGlobalCleanupHandlers() {
        logger.info('Registering global URL tracker cleanup handlers for manual usage...');
        
        // Process exit handler
        process.on('exit', () => {
            logger.info('Process exit detected - performing URL tracker cleanup');
            try {
                const registry = global._urlTrackerRegistry;
                if (registry && registry.trackers) {
                    registry.trackers.forEach((tracker, testName) => {
                        if (tracker && !tracker.cleanupCalled && typeof tracker.exportResults === 'function') {
                            tracker.exportResults();
                        }
                    });
                }
                
                // Generate API Upload Report
                generateApiUploadReport();
                
            } catch (e) {
                logger.error('Error during process exit cleanup:', e);
            }
        });

        // SIGINT handler (Ctrl+C) - this can be async and will wait
        process.on('SIGINT', async () => {
            logger.info('SIGINT received - performing comprehensive cleanup with waiting');
            try {
                // First wait a bit for any pending API uploads
                logger.info('Waiting for pending API uploads...');
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
                
                const registry = global._urlTrackerRegistry;
                if (registry && registry.trackers) {
                    for (const [id, tracker] of registry.trackers) {
                        if (tracker && !tracker.cleanupCalled) {
                            await tracker.performAutoCleanup();
                        }
                    }
                }
                await performGlobalUrlTrackerCleanup();
            } catch (e) {
                logger.error('Error during SIGINT cleanup:', e);
            }
            process.exit(0);
        });

        // SIGTERM handler (process termination) - this can be async and will wait
        process.on('SIGTERM', async () => {
            logger.info('SIGTERM received - performing comprehensive cleanup with waiting');
            try {
                // First wait a bit for any pending API uploads
                logger.info('Waiting for pending API uploads...');
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds
                
                const registry = global._urlTrackerRegistry;
                if (registry && registry.trackers) {
                    for (const [id, tracker] of registry.trackers) {
                        if (tracker && !tracker.cleanupCalled) {
                            await tracker.performAutoCleanup();
                        }
                    }
                }
                await performGlobalUrlTrackerCleanup();
            } catch (e) {
                logger.error('Error during SIGTERM cleanup:', e);
            }
            process.exit(0);
        });

        // Uncaught exception handler
        process.on('uncaughtException', async (err) => {
            logger.error('Uncaught exception - performing global cleanup:', err);
            try {
                const registry = global._urlTrackerRegistry;
                if (registry && registry.trackers) {
                    for (const [id, tracker] of registry.trackers) {
                        if (tracker && !tracker.cleanupCalled) {
                            await tracker.performAutoCleanup();
                        }
                    }
                }
                await performGlobalUrlTrackerCleanup();
            } catch (e) {
                logger.error('Error during uncaught exception cleanup:', e);
            }
            process.exit(1);
        });

        // Unhandled promise rejection handler
        process.on('unhandledRejection', async (reason, promise) => {
            logger.error('Unhandled promise rejection - performing global cleanup:', reason);
            try {
                const registry = global._urlTrackerRegistry;
                if (registry && registry.trackers) {
                    for (const [id, tracker] of registry.trackers) {
                        if (tracker && !tracker.cleanupCalled) {
                            await tracker.performAutoCleanup();
                        }
                    }
                }
                await performGlobalUrlTrackerCleanup();
            } catch (e) {
                logger.error('Error during unhandled rejection cleanup:', e);
            }
            process.exit(1);
        });

        global._urlTrackerRegistry.cleanupHandlersRegistered = true;
        logger.verbose('Global URL tracker cleanup handlers registered successfully');
    }
    
    // NEW METHOD: Setup automatic test end detection for upload
    setupTestEndDetection() {
        try {
            logger.info(`Setting up automatic test end detection for: ${this.options.testName}`);
            
            // Method 1: Monitor page navigation patterns to detect test completion
            this.setupNavigationBasedDetection();
            
            // Method 2: Use timeout-based detection as fallback
            this.setupTimeoutBasedDetection();
            
            // Method 3: Monitor for test completion signals
            this.setupTestCompletionSignals();
            
        } catch (error) {
            logger.error(`Error setting up test end detection: ${error.message}`);
        }
    }
    
    // NEW METHOD: Navigation-based test completion detection
    setupNavigationBasedDetection() {
        // Monitor for periods of navigation inactivity that suggest test completion
        this.lastNavigationTime = Date.now();
        this.navigationInactivityThreshold = 3000; // 3 seconds of no navigation
        
        // Set up interval to check for navigation inactivity
        this.navigationMonitor = setInterval(async () => {
            const timeSinceLastNavigation = Date.now() - this.lastNavigationTime;
            
            if (timeSinceLastNavigation > this.navigationInactivityThreshold && 
                !this._uploadCompleted && 
                this.trackingResults.length > 0) {
                
                logger.info(`🔍 Navigation inactivity detected (${timeSinceLastNavigation}ms) - triggering auto upload`);
                await this.performAutoUpload('navigation_inactivity');
            }
        }, 1000); // Check every second
    }
    
    // NEW METHOD: Timeout-based test completion detection
    setupTimeoutBasedDetection() {
        // Set a reasonable timeout for test completion (fallback)
        this.testCompletionTimeout = setTimeout(async () => {
            if (!this._uploadCompleted && this.trackingResults.length > 0) {
                logger.info(`⏰ Test timeout reached - triggering auto upload for: ${this.options.testName}`);
                await this.performAutoUpload('timeout_based');
            }
        }, 30000); // 30 seconds max per test
    }
    
    // NEW METHOD: Monitor for test completion signals
    setupTestCompletionSignals() {
        if (this.page) {
            // Monitor for console messages that might indicate test completion
            this.page.on('console', (msg) => {
                const text = msg.text().toLowerCase();
                if (text.includes('test complete') || text.includes('test finished') || text.includes('test done')) {
                    if (!this._uploadCompleted) {
                        logger.info(`📢 Test completion signal detected - triggering auto upload`);
                        this.performAutoUpload('console_signal').catch(e => 
                            logger.error(`Auto upload failed: ${e.message}`)
                        );
                    }
                }
            });
        }
    }
    
    // NEW METHOD: Perform automatic upload when test end is detected
    async performAutoUpload(trigger) {
        if (this._uploadCompleted || this._uploadInProgress) {
            logger.verbose(`Auto upload skipped - already completed or in progress`);
            return; // Already uploaded or in progress
        }
        
        this._uploadInProgress = true;
        const startTime = Date.now();
        
        try {
            logger.info(`🚀 AUTO UPLOAD: Triggered by ${trigger} for "${this.options.testName}"`);
            
            if (!this.options.enableApiUpload || !this.apiUploader || this.trackingResults.length === 0) {
                logger.info(`AUTO UPLOAD: Skipped - conditions not met (enableApiUpload: ${this.options.enableApiUpload}, hasUploader: ${!!this.apiUploader}, results: ${this.trackingResults.length})`);
                return;
            }
            
            // Ensure metadata is available
            if (!this.testMetadata) {
                await this.fetchTestMetadataWithRetry();
            }
            
            const trackingData = { navigations: this.trackingResults };
            const testId = ApiUploader.extractTestId(this.testMetadata, this.options);
            const uploadId = `auto_${trigger}_${this.workerId}_${Date.now()}`;
            
            logger.info(`AUTO UPLOAD: Starting upload with ${trackingData.navigations.length} navigations`);
            
            // Perform immediate upload without timeout
            const result = await this.apiUploader.uploadTrackingResults(trackingData, testId, {
                trackingType: 'url-tracker',
                framework: 'Playwright',
                uploadId: uploadId,
                workerId: this.workerId,
                trigger: trigger,
                autoUpload: true
            });
            
            logger.success(`✅ AUTO UPLOAD: Completed successfully for "${this.options.testName}" (trigger: ${trigger})`);
            this._uploadCompleted = true;
            
            // CRITICAL: Record successful auto upload in worker files
            const successRecord = {
                testName: this.options.testName,
                testId: testId,
                uploadId: uploadId,
                timestamp: new Date().toISOString(),
                status: 'auto_upload_success',
                response: result,
                workerId: this.workerId,
                navigationCount: trackingData.navigations.length,
                                 trigger: trigger,
                 duration: Date.now() - startTime
            };
            
            try {
                this.writeWorkerApiResult(successRecord, 'success');
                logger.info(`✅ AUTO UPLOAD: Success recorded for "${this.options.testName}"`);
            } catch (writeError) {
                logger.error(`❌ AUTO UPLOAD: Failed to record success: ${writeError.message}`);
            }
            
            // Clear detection timers since upload is complete
            this.clearTestEndDetection();
            
            return result;
            
        } catch (error) {
            logger.error(`❌ AUTO UPLOAD: Failed for "${this.options.testName}" (trigger: ${trigger}): ${error.message}`);
            
            // CRITICAL: Record failed auto upload in worker files
            const errorRecord = {
                testName: this.options.testName,
                uploadId: uploadId || `auto_${trigger}_${this.workerId}_${Date.now()}`,
                error: error.message,
                errorType: error.constructor.name,
                timestamp: new Date().toISOString(),
                workerId: this.workerId,
                trigger: trigger,
                type: 'auto_upload_error',
                stack: error.stack
            };
            
            try {
                this.writeWorkerApiResult(errorRecord, 'error');
                logger.info(`❌ AUTO UPLOAD: Error recorded for "${this.options.testName}"`);
            } catch (writeError) {
                logger.error(`❌ AUTO UPLOAD: Failed to record error: ${writeError.message}`);
            }
            
            throw error;
        } finally {
            this._uploadInProgress = false;
        }
    }
    
    // NEW METHOD: Clear test end detection timers
    clearTestEndDetection() {
        if (this.navigationMonitor) {
            clearInterval(this.navigationMonitor);
            this.navigationMonitor = null;
        }
        
        if (this.testCompletionTimeout) {
            clearTimeout(this.testCompletionTimeout);
            this.testCompletionTimeout = null;
        }
    }
    
    // NEW METHOD: Perform automatic cleanup
    async performAutoCleanup() {
        if (this.cleanupCalled) {
            return; // Already cleaned up
        }
        
        try {
            logger.info(`Performing automatic cleanup for URL tracker: ${this.options.testName}`);
            
            // Clear test end detection first
            this.clearTestEndDetection();
            
            await this.cleanup();
            
            // Remove from global registry
            if (global._urlTrackerRegistry && global._urlTrackerRegistry.trackers) {
                global._urlTrackerRegistry.trackers.delete(this.instanceId);
            }
            
            // Clear cleanup timeout
            if (this.cleanupTimeout) {
                clearTimeout(this.cleanupTimeout);
                this.cleanupTimeout = null;
            }
        } catch (e) {
            logger.error(`Error in automatic cleanup for ${this.options.testName}:`, e);
        }
    }

    // NEW METHOD: Perform initial setup automatically
    performInitialSetup() {
        try {
            // Ensure output directory exists
            const resultsDir = path.join(process.cwd(), 'test-results');
            
            if (!fs.existsSync(resultsDir)) {
                try {
                    fs.mkdirSync(resultsDir, { recursive: true, mode: 0o777 });
                } catch (err) {
                    logger.error(`URL Tracker: Failed to create directory ${resultsDir}:`, err);
                    try {
                        require('child_process').execSync(`mkdir -p "${resultsDir}"`);
                    } catch (cmdErr) {
                        logger.error(`URL Tracker: Failed to create directory using command ${resultsDir}:`, cmdErr);
                    }
                }
            }
            
            // Initialize results file if it doesn't exist
            const resultsFile = path.join(resultsDir, 'url-tracking-results.json');
            if (!fs.existsSync(resultsFile)) {
                try {
                    fs.writeFileSync(resultsFile, '[]', { encoding: 'utf8', mode: 0o666 });
                } catch (writeErr) {
                    logger.error(`URL Tracker: Failed to create initial results file ${resultsFile}:`, writeErr);
                }
            }
        } catch (setupErr) {
            logger.error('URL Tracker: Error during automatic initial setup:', setupErr);
        }
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
    // Helper function to detect spec file from command line and environment
    function detectSpecFileFromEnvironment() {
        try {
            // Try to get from process.argv
            const args = process.argv || [];
            
            // Method 1: Check for direct spec file references in args
            for (let i = 0; i < args.length; i++) {
                const arg = args[i];
                // Check for direct spec file references
                if (arg.includes('.spec.js') || arg.includes('.test.js')) {
                    return path.basename(arg);
                }
                // Check for --spec or similar flags followed by a file
                if ((arg === '--spec' || arg.startsWith('--spec=')) && i + 1 < args.length) {
                    const nextArg = arg.startsWith('--spec=') ? arg.split('=')[1] : args[i + 1];
                    if (nextArg && (nextArg.includes('.spec.js') || nextArg.includes('.test.js'))) {
                        return path.basename(nextArg);
                    }
                }
            }
            
            // Method 2: Check the full command line for paths
            const fullCommand = args.join(' ');
            
            // Enhanced Windows paths detection (more patterns)
            const windowsPatterns = [
                /tests[\\\/]([^\\\/\s]+\.spec\.js)/,  // tests\file.spec.js or tests/file.spec.js
                /test[\\\/]([^\\\/\s]+\.spec\.js)/,   // test\file.spec.js or test/file.spec.js  
                /([^\\\/\s]+\.spec\.js)/,             // any file.spec.js
                /([^\\\/\s]+\.test\.js)/              // any file.test.js
            ];
            
            for (const pattern of windowsPatterns) {
                const match = fullCommand.match(pattern);
                if (match && match[1]) {
                    logger.verbose(`Detected spec file from command line: ${match[1]}`);
                    return match[1];
                }
            }
            
            // Method 3: Check environment variables set by Playwright
            const envVars = [
                'PLAYWRIGHT_TEST_FILE',
                'JEST_WORKER_ID', // Might contain test info
                'npm_config_argv' // npm run command args
            ];
            
            for (const envVar of envVars) {
                if (process.env[envVar]) {
                    const envValue = process.env[envVar];
                    const specMatch = envValue.match(/([^\\\/\s]+\.spec\.js)/);
                    if (specMatch) {
                        logger.verbose(`Detected spec file from ${envVar}: ${specMatch[1]}`);
                        return specMatch[1];
                    }
                }
            }
            
            // Method 4: Check current working directory for spec files (last resort)
            try {
                const fs = require('fs');
                const cwd = process.cwd();
                
                // Check common test directories
                const testDirs = ['tests', 'test', 'spec', 'specs', '.'];
                
                for (const testDir of testDirs) {
                    const fullTestDir = path.join(cwd, testDir);
                    if (fs.existsSync(fullTestDir)) {
                        const files = fs.readdirSync(fullTestDir);
                        const specFiles = files.filter(file => 
                            file.endsWith('.spec.js') || file.endsWith('.test.js')
                        );
                        
                        if (specFiles.length === 1) {
                            // If there's only one spec file, use it
                            logger.verbose(`Auto-detected single spec file: ${specFiles[0]}`);
                            return specFiles[0];
                        } else if (specFiles.length > 1) {
                            // If multiple spec files, try to find one that matches current test context
                            // This is a heuristic and may not always be accurate
                            const likelyFiles = specFiles.filter(file => 
                                fullCommand.toLowerCase().includes(file.toLowerCase().replace('.spec.js', ''))
                            );
                            if (likelyFiles.length === 1) {
                                logger.verbose(`Auto-detected likely spec file: ${likelyFiles[0]}`);
                                return likelyFiles[0];
                            }
                        }
                    }
                }
            } catch (fsError) {
                // Ignore filesystem errors
                logger.verbose(`Filesystem detection failed: ${fsError.message}`);
            }
            
            return null;
        } catch (e) {
            logger.verbose(`Spec file detection error: ${e.message}`);
            return null;
        }
    }
    
    // Helper function to extract test file from stack trace
    function getTestFileFromStack() {
        try {
            const stack = new Error().stack;
            const lines = stack.split('\n');
            
            // Look through stack trace for test files
            for (const line of lines) {
                if (line.includes('.spec.js') || line.includes('.test.js')) {
                    // Try different patterns to extract the filename
                    const patterns = [
                        /([^\/\\]+\.(?:spec|test)\.js)/,           // Basic filename extraction
                        /tests[\\\/]([^\\\/\s]+\.spec\.js)/,       // tests/filename.spec.js
                        /test[\\\/]([^\\\/\s]+\.spec\.js)/,        // test/filename.spec.js
                        /at.*?([^\/\\]+\.(?:spec|test)\.js)/       // from "at" stack traces
                    ];
                    
                    for (const pattern of patterns) {
                        const match = line.match(pattern);
                        if (match && match[1]) {
                            logger.verbose(`Detected spec file from stack trace: ${match[1]}`);
                            return match[1];
                        }
                    }
                }
            }
            
            // If no direct matches, try to find any .js file that might be a test
            for (const line of lines) {
                if (line.includes('test') && line.includes('.js')) {
                    const match = line.match(/([^\/\\]+\.js)/);
                    if (match && match[1] && (match[1].includes('test') || match[1].includes('spec'))) {
                        logger.verbose(`Detected possible test file from stack trace: ${match[1]}`);
                        return match[1];
                    }
                }
            }
            
            return null;
        } catch (e) {
            logger.verbose(`Stack trace detection failed: ${e.message}`);
            return null;
        }
    }

    // IMPORTANT: Add function to extract spec file from test name/metadata
    function extractSpecFileFromTestName(testName) {
        try {
            if (!testName) return null;
            
            // Look for spec file patterns in test name
            const specFileMatch = testName.match(/([^\/\\]+\.(?:spec|test)\.js)/);
            if (specFileMatch) {
                return specFileMatch[1];
            }
            
            return null;
        } catch (e) {
            return null;
        }
    }

    // Helper function to detect spec file from Playwright test context
    function getSpecFileFromPlaywrightContext() {
        try {
            // Check if we're in a Playwright test context
            if (typeof test !== 'undefined' && test.info) {
                const testInfo = test.info();
                if (testInfo.file) {
                    return path.basename(testInfo.file);
                }
            }
            
            // Try to access global test context
            if (global.__playwright_test_info && global.__playwright_test_info.file) {
                return path.basename(global.__playwright_test_info.file);
            }
            
            return null;
        } catch (e) {
            return null;
        }
    }

    // Detect spec file using multiple methods, prioritizing automatic detection
    const detectedSpecFile = detectSpecFileFromEnvironment() || 
                             getTestFileFromStack() || 
                             getSpecFileFromPlaywrightContext() ||
                             options.specFile ||  // Only use user input as fallback
                             'unknown.spec.js';
    const specFile = detectedSpecFile;

    // Log detected configuration
    logger.info(`URL Tracker Fixture created - Spec: ${specFile}`);
    logger.verbose(`=== URL TRACKER FIXTURE CONFIGURATION ===`);
    logger.verbose(`Detected spec file: ${specFile}`);
    logger.verbose(`Options passed: ${JSON.stringify(options, null, 2)}`);
    logger.verbose(`Verbose mode: ${options.verbose || false}`);
    logger.verbose(`API upload enabled: ${options.enableApiUpload !== false}`);
    
    // Initialize global tracker registry if it doesn't exist
    if (!global._urlTrackerRegistry) {
        global._urlTrackerRegistry = {
            trackers: new Map(),
            cleanupHandlersRegistered: false,
            testEndCallbacks: new Set()
        };
        logger.verbose('Initialized global URL tracker registry');
    } else {
        logger.verbose('Global URL tracker registry already exists');
    }
    
    // Mark that we're using the fixture framework
    global._isUsingFixtureFramework = true;

    // Register global cleanup handlers only once
    if (!global._urlTrackerRegistry.cleanupHandlersRegistered) {
        logger.verbose('Registering global URL tracker cleanup handlers...');
        
        // CRITICAL: Remove unreliable beforeExit handler completely
        // beforeExit is not triggered in Playwright worker processes that exit abruptly
        // Instead, we rely on immediate cleanup triggers (page/context close) and worker fixtures
        
        // Process exit handler - synchronous, no async operations allowed
        process.on('exit', () => {
            logger.info('Process exit detected - performing coordinated cleanup with active upload tracking');
            try {
                // Check for active uploads before exiting
                const activeUploads = global._activeApiUploads ? global._activeApiUploads.size : 0;
                if (activeUploads > 0) {
                    logger.warn(`⚠️  PROCESS EXIT: ${activeUploads} API uploads still active - some data may be lost`);
                    logger.warn('Consider increasing cleanup wait time or using process coordination');
                    
                    // Log details of active uploads
                    if (global._activeApiUploads) {
                        for (const [uploadId, upload] of global._activeApiUploads) {
                            const duration = Date.now() - upload.startTime;
                            logger.warn(`  Active upload: ${uploadId} (${upload.testName}, ${duration}ms elapsed, status: ${upload.status})`);
                        }
                    }
                }
                
                // Only do synchronous operations here
                const registry = global._urlTrackerRegistry;
                if (registry && registry.trackers) {
                    registry.trackers.forEach((tracker, testName) => {
                        if (tracker && typeof tracker.exportResults === 'function') {
                            tracker.exportResults();
                        }
                    });
                }
                
                // CRITICAL: Generate final HTML report with aggregated sessions from all workers
                try {
                    const aggregatedSessions = aggregateWorkerSessions();
                    
                    logger.info(`HTML Report Debug: EnhancedHtmlReporter available: ${!!EnhancedHtmlReporter}`);
                    logger.info(`HTML Report Debug: Aggregated sessions count: ${aggregatedSessions.length}`);
                    
                    if (EnhancedHtmlReporter && aggregatedSessions.length > 0) {
                        logger.info(`PROCESS EXIT: Generating final HTML report with ${aggregatedSessions.length} aggregated sessions...`);
                        
                        // Create reporter if needed
                        if (!globalHtmlReporter) {
                            logger.info(`Creating new EnhancedHtmlReporter instance...`);
                            globalHtmlReporter = new EnhancedHtmlReporter({
                                outputDir: 'test-results',
                                title: 'LambdaTest Playwright URL Tracking Report (Multi-Worker)',
                                theme: 'dark',
                                enableKeyboardShortcut: true,
                                autoOpen: true, // Enable auto-open for better UX
                                enableSearch: true,
                                enableFilters: true,
                                showMetrics: true,
                                showTimeline: true
                            });
                            logger.info(`EnhancedHtmlReporter instance created successfully`);
                        }
                        
                        // Generate the final report with all aggregated sessions
                        logger.info(`Calling generateReport with ${aggregatedSessions.length} sessions...`);
                        const htmlReportPath = globalHtmlReporter.generateReport(aggregatedSessions, 'playwright');
                        logger.success(`PROCESS EXIT: Final HTML report generated with ${aggregatedSessions.length} sessions: ${htmlReportPath}`);
                        
                        // Show the HTML report prompt
                        showHtmlReportPrompt(globalHtmlReporter, htmlReportPath);
                    } else if (!EnhancedHtmlReporter) {
                        logger.warn('PROCESS EXIT: EnhancedHtmlReporter not available - generating basic HTML report');
                        // Generate a basic HTML report as fallback
                        try {
                            if (aggregatedSessions.length > 0) {
                                generateBasicHtmlReport(aggregatedSessions);
                            } else {
                                logger.info('PROCESS EXIT: No sessions for basic HTML report either');
                            }
                        } catch (basicError) {
                            logger.error('PROCESS EXIT: Basic HTML report generation also failed:', basicError.message);
                        }
                    } else if (aggregatedSessions.length === 0) {
                        logger.info('PROCESS EXIT: No sessions found for HTML report generation');
                        
                        // Debug: Check what session files exist
                        try {
                            const workersDir = path.join(process.cwd(), 'test-results', 'workers');
                            if (fs.existsSync(workersDir)) {
                                const sessionFiles = fs.readdirSync(workersDir).filter(f => f.includes('sessions'));
                                logger.info(`Found ${sessionFiles.length} session files: ${sessionFiles.join(', ')}`);
                                
                                // Try to read first session file for debugging
                                if (sessionFiles.length > 0) {
                                    const firstSessionFile = path.join(workersDir, sessionFiles[0]);
                                    const content = fs.readFileSync(firstSessionFile, 'utf-8');
                                    const lines = content.trim().split('\n').filter(line => line.trim());
                                    logger.info(`First session file has ${lines.length} lines`);
                                    if (lines.length > 0) {
                                        try {
                                            const firstSession = JSON.parse(lines[0]);
                                            logger.info(`Sample session: ${JSON.stringify(firstSession, null, 2).substring(0, 200)}...`);
                                        } catch (parseError) {
                                            logger.error(`Error parsing first session: ${parseError.message}`);
                                        }
                                    }
                                }
                            } else {
                                logger.info('No workers directory found');
                            }
                        } catch (debugError) {
                            logger.error(`Error checking session files: ${debugError.message}`);
                        }
                    }
                } catch (htmlError) {
                    logger.error('PROCESS EXIT: Error generating final HTML report:', htmlError);
                    logger.error('HTML Error stack:', htmlError.stack);
                }
                
                // Generate API Upload Report with active upload awareness
                try {
                    generateApiUploadReportWithCoordination();
                } catch (reportError) {
                    logger.error('Error generating coordinated API upload report:', reportError);
                }
                
            } catch (e) {
                logger.error('Error during process exit cleanup:', e);
            }
        });

        // SIGINT handler (Ctrl+C) - IMPROVED with upload coordination
        process.on('SIGINT', async () => {
            logger.info('SIGINT received - performing COORDINATED cleanup with upload awareness');
            try {
                // Check active uploads first
                const activeUploads = global._activeApiUploads ? global._activeApiUploads.size : 0;
                if (activeUploads > 0) {
                    logger.info(`SIGINT: Found ${activeUploads} active API uploads - waiting briefly for completion`);
                    
                    // Wait for a short time for uploads to complete
                    const waitTime = 5000; // 5 seconds
                    const startWait = Date.now();
                    
                    while ((Date.now() - startWait) < waitTime && global._activeApiUploads && global._activeApiUploads.size > 0) {
                        logger.info(`SIGINT: Waiting for ${global._activeApiUploads.size} uploads... (${Math.ceil((waitTime - (Date.now() - startWait)) / 1000)}s remaining)`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                    
                    const remainingUploads = global._activeApiUploads ? global._activeApiUploads.size : 0;
                    if (remainingUploads > 0) {
                        logger.warn(`SIGINT: ${remainingUploads} uploads still active after ${waitTime}ms - proceeding with exit`);
                    } else {
                        logger.success('SIGINT: All uploads completed successfully');
                    }
                }
                
                // Force immediate cleanup of trackers
                const registry = global._urlTrackerRegistry;
                if (registry && registry.trackers && registry.trackers.size > 0) {
                    logger.info(`SIGINT: Found ${registry.trackers.size} pending trackers - forcing immediate export`);
                    
                    for (const [testId, tracker] of registry.trackers) {
                        if (tracker && typeof tracker.exportResults === 'function') {
                            logger.info(`SIGINT: Forcing export for tracker: ${testId}`);
                            tracker.exportResults();
                        }
                    }
                }
                
                generateApiUploadReportWithCoordination();
            } catch (e) {
                logger.error('Error during SIGINT cleanup:', e);
            }
            process.exit(0);
        });

        // SIGTERM handler (process termination) - IMPROVED with upload coordination
        process.on('SIGTERM', async () => {
            logger.info('SIGTERM received - performing COORDINATED cleanup with upload awareness');
            try {
                // Check active uploads first
                const activeUploads = global._activeApiUploads ? global._activeApiUploads.size : 0;
                if (activeUploads > 0) {
                    logger.info(`SIGTERM: Found ${activeUploads} active API uploads - waiting briefly for completion`);
                    
                    // Wait for a shorter time for uploads to complete (SIGTERM is more urgent)
                    const waitTime = 3000; // 3 seconds
                    const startWait = Date.now();
                    
                    while ((Date.now() - startWait) < waitTime && global._activeApiUploads && global._activeApiUploads.size > 0) {
                        logger.info(`SIGTERM: Waiting for ${global._activeApiUploads.size} uploads... (${Math.ceil((waitTime - (Date.now() - startWait)) / 1000)}s remaining)`);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                    
                    const remainingUploads = global._activeApiUploads ? global._activeApiUploads.size : 0;
                    if (remainingUploads > 0) {
                        logger.warn(`SIGTERM: ${remainingUploads} uploads still active after ${waitTime}ms - proceeding with exit`);
                    } else {
                        logger.success('SIGTERM: All uploads completed successfully');
                    }
                }
                
                // Force immediate cleanup of trackers
                const registry = global._urlTrackerRegistry;
                if (registry && registry.trackers && registry.trackers.size > 0) {
                    logger.info(`SIGTERM: Found ${registry.trackers.size} pending trackers - forcing immediate export`);
                    
                    for (const [testId, tracker] of registry.trackers) {
                        if (tracker && typeof tracker.exportResults === 'function') {
                            logger.info(`SIGTERM: Forcing export for tracker: ${testId}`);
                            tracker.exportResults();
                        }
                    }
                }
                
                generateApiUploadReportWithCoordination();
            } catch (e) {
                logger.error('Error during SIGTERM cleanup:', e);
            }
            process.exit(0);
        });
    
        // Uncaught exception handler - SYNCHRONOUS for reliability
        process.on('uncaughtException', (err) => {
            logger.error('Uncaught exception - performing IMMEDIATE synchronous cleanup:', err);
            try {
                // Force immediate cleanup without waiting
                const registry = global._urlTrackerRegistry;
                if (registry && registry.trackers) {
                    for (const [testId, tracker] of registry.trackers) {
                        if (tracker && typeof tracker.exportResults === 'function') {
                            tracker.exportResults();
                        }
                    }
                }
                
                // SIMPLIFIED: With fire-and-forget approach, uploads continue in background
                logger.info('Exception: Fire-and-forget API uploads may continue in background');
                
                generateApiUploadReport();
            } catch (e) {
                logger.error('Error during uncaught exception cleanup:', e);
            }
            process.exit(1);
        });

        // Unhandled promise rejection handler - SYNCHRONOUS for reliability
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled promise rejection - performing IMMEDIATE synchronous cleanup:', reason);
            try {
                // Force immediate cleanup without waiting
                const registry = global._urlTrackerRegistry;
                if (registry && registry.trackers) {
                    for (const [testId, tracker] of registry.trackers) {
                        if (tracker && typeof tracker.exportResults === 'function') {
                            tracker.exportResults();
                        }
                    }
                }
                
                // SIMPLIFIED: With fire-and-forget approach, uploads continue in background
                logger.info('Rejection: Fire-and-forget API uploads may continue in background');
                
                generateApiUploadReport();
            } catch (e) {
                logger.error('Error during unhandled rejection cleanup:', e);
            }
            process.exit(1);
        });

        global._urlTrackerRegistry.cleanupHandlersRegistered = true;
        logger.info('Global URL tracker cleanup handlers registered successfully');
    }

    // NEW: Perform global setup actions automatically
    // This eliminates the need for users to create a globalSetup file
    (function performGlobalSetup() {
        // Ensure output directory exists
        try {
            const resultsDir = path.join(process.cwd(), 'test-results');
            
            if (!fs.existsSync(resultsDir)) {
                try {
                    fs.mkdirSync(resultsDir, { recursive: true, mode: 0o777 });
                } catch (err) {
                    logger.error(`URL Tracker: Failed to create directory ${resultsDir}:`, err);
                    try {
                        require('child_process').execSync(`mkdir -p "${resultsDir}"`);
                    } catch (cmdErr) {
                        logger.error(`URL Tracker: Failed to create directory using command ${resultsDir}:`, cmdErr);
                    }
                }
            }
            
            // Initialize results file if it doesn't exist
            const resultsFile = path.join(resultsDir, 'url-tracking-results.json');
            if (!fs.existsSync(resultsFile)) {
                try {
                    fs.writeFileSync(resultsFile, '[]', { encoding: 'utf8', mode: 0o666 });
                } catch (writeErr) {
                    logger.error(`URL Tracker: Failed to create initial results file ${resultsFile}:`, writeErr);
                }
            }
        } catch (setupErr) {
            logger.error('URL Tracker: Error during automatic global setup:', setupErr);
        }
    })();

    return {
        // Add a worker-scoped fixture to handle cleanup at worker level
        workerUrlTracker: [async ({}, use, workerInfo) => {
            // This runs once per worker - setup
            const workerId = workerInfo.parallelIndex.toString(); // Use parallelIndex (0-based) for consistency
            logger.info(`WORKER ${workerId}: URL tracker worker fixture starting`);
            logger.verbose(`WORKER ${workerId}: Worker index: ${workerInfo.workerIndex}, Parallel index: ${workerInfo.parallelIndex}`);
            
            // Set environment variables for this worker
            process.env.TEST_PARALLEL_INDEX = workerInfo.parallelIndex.toString();
            process.env.TEST_WORKER_INDEX = workerInfo.workerIndex.toString();
            
            // Store cleanup functions for this worker
            if (!global._workerCleanupFunctions) {
                global._workerCleanupFunctions = new Set();
            }
            
            // Initialize worker-specific directories
            const workersDir = path.join(process.cwd(), 'test-results', 'workers');
            if (!fs.existsSync(workersDir)) {
                fs.mkdirSync(workersDir, { recursive: true, mode: 0o777 });
                logger.verbose(`WORKER ${workerId}: Created workers directory: ${workersDir}`);
            }
            
            // Initialize worker-specific data storage
            if (!global._workerData) {
                global._workerData = {
                    workerId: workerId,
                    sessions: [],
                    apiSuccesses: [],
                    apiErrors: [],
                    apiSkips: [],
                    cleanupCalls: []
                };
                logger.verbose(`WORKER ${workerId}: Initialized worker data storage`);
            }
            
            await use();
            
            // This runs at worker teardown - MOST RELIABLE
            logger.info(`WORKER ${workerId}: URL tracker worker fixture cleanup starting`);
            
            // Execute all cleanup functions for this worker
            if (global._workerCleanupFunctions && global._workerCleanupFunctions.size > 0) {
                logger.info(`WORKER ${workerId}: Executing ${global._workerCleanupFunctions.size} cleanup functions`);
                
                for (const cleanupFn of global._workerCleanupFunctions) {
                    try {
                        await cleanupFn();
                    } catch (error) {
                        logger.error(`WORKER ${workerId}: Error in cleanup function:`, error);
                    }
                }
                
                global._workerCleanupFunctions.clear();
            }
            
            // Write worker completion marker
            try {
                const completionFile = path.join(workersDir, `worker-${workerId}-completed.json`);
                const completionData = {
                    workerId: workerId,
                    completedAt: new Date().toISOString(),
                    testsRun: global._workerData ? global._workerData.sessions.length : 0,
                    apiUploads: global._workerData ? global._workerData.apiSuccesses.length : 0,
                    apiErrors: global._workerData ? global._workerData.apiErrors.length : 0
                };
                fs.writeFileSync(completionFile, JSON.stringify(completionData, null, 2));
                logger.info(`WORKER ${workerId}: Completion marker written`);
            } catch (error) {
                logger.error(`WORKER ${workerId}: Error writing completion marker:`, error);
            }
            
            // IMPORTANT: Don't generate final HTML report at worker level
            // This will be done by the main process after all workers complete
            logger.info(`WORKER ${workerId}: Worker-specific cleanup completed`);
            
            // SIMPLIFIED: With fire-and-forget approach, no need to wait for uploads
            logger.info(`WORKER ${workerId}: Fire-and-forget API uploads may continue in background - this is expected`);
            
            logger.info(`WORKER ${workerId}: URL tracker worker fixture cleanup completed`);
        }, { scope: 'worker', auto: true }],
        
        // Setup a handler that will be executed before each test
        beforeEach: async ({ page }, testInfo) => {
            // Create a URL tracker with the test name and spec file
            const testName = testInfo.title ? testInfo.title.replace(/\s+/g, '_').toLowerCase() : 'unknown_test';
            const uniqueTestId = `${testName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Try to get spec file from testInfo first (most accurate)
            let actualSpecFile = specFile;
            if (testInfo && testInfo.file) {
                actualSpecFile = path.basename(testInfo.file);
                logger.verbose(`Spec file detected from testInfo: ${actualSpecFile}`);
            } else if (testInfo && testInfo._projectConfig && testInfo._projectConfig.testDir) {
                // Try to extract from project config
                try {
                    const testDir = testInfo._projectConfig.testDir;
                    const cwdFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.spec.js'));
                    if (cwdFiles.length === 1) {
                        actualSpecFile = cwdFiles[0];
                        logger.verbose(`Spec file detected from project testDir: ${actualSpecFile}`);
                    }
                } catch (fsError) {
                    // Ignore filesystem errors
                    logger.verbose(`Project testDir detection failed: ${fsError.message}`);
                }
            }
            
            // Set worker environment variables for consistent worker ID detection
            if (testInfo && testInfo.parallelIndex !== undefined) {
                process.env.TEST_PARALLEL_INDEX = testInfo.parallelIndex.toString();
            }
            if (testInfo && testInfo.workerIndex !== undefined) {
                process.env.TEST_WORKER_INDEX = testInfo.workerIndex.toString();
            }
            
            const urlTracker = new UrlTrackerPlugin(page, {
                ...options,
                testName: options.testName || testName,
                specFile: actualSpecFile,  // Use the most accurate spec file we can find
                verbose: options.verbose || false  // Pass through verbose option
            });

            // Store the tracker in the test info AND global registry
            testInfo.urlTracker = urlTracker;
            global._urlTrackerRegistry.trackers.set(uniqueTestId, urlTracker);
            
            try {
                // Initialize the tracker
                await urlTracker.init();
                logger.info(`URL tracker initialized for test: ${testName}`);
                logger.info(`Tracker stored in global registry with ID: ${uniqueTestId}`);
            } catch (error) {
                logger.error(`Error initializing URL tracker for test ${testName}:`, error);
            }
            
            // CRITICAL: Store the cleanup function that MUST run in afterEach
            const criticalCleanupFunction = async () => {
                logger.info(`=== CRITICAL CLEANUP STARTING FOR: ${testName} ===`);
                try {
                    if (urlTracker && !urlTracker.cleanupCalled) {
                        logger.info(`Performing CRITICAL cleanup for URL tracker: ${testName}`);
                        
                        // SIMPLIFIED: Just run cleanup immediately - no waiting for uploads
                        await urlTracker.cleanup();
                        logger.info(`CRITICAL: Cleanup completed for URL tracker: ${testName}`);
                        
                        // Remove from global registry after cleanup
                        global._urlTrackerRegistry.trackers.delete(uniqueTestId);
                    } else {
                        if (urlTracker && urlTracker.cleanupCalled) {
                            logger.info(`CRITICAL: Cleanup already called for URL tracker: ${testName}`);
                        } else {
                            logger.warn(`CRITICAL: No URL tracker found for cleanup: ${testName}`);
                        }
                    }
                } catch (e) {
                    logger.error(`CRITICAL: Error in cleanup for ${testName}:`, e);
                    // Force export even on error
                    if (urlTracker && typeof urlTracker.exportResults === 'function') {
                        urlTracker.exportResults();
                    }
                }
                logger.info(`=== CRITICAL CLEANUP COMPLETED FOR: ${testName} ===`);
            };
            
            // Store the critical cleanup function for afterEach
            testInfo._criticalCleanup = criticalCleanupFunction;
            
            // Add upload function to testInfo for manual triggering during test
            testInfo.uploadUrlTracking = async () => {
                if (urlTracker && urlTracker.options.enableApiUpload && urlTracker.apiUploader && urlTracker.trackingResults.length > 0) {
                    logger.info(`Manual upload triggered for test: ${testName}`);
                    
                    try {
                        if (!urlTracker.testMetadata) {
                            await urlTracker.fetchTestMetadataWithRetry();
                        }
                        
                        const trackingData = { navigations: urlTracker.trackingResults };
                        const testId = ApiUploader.extractTestId(urlTracker.testMetadata, urlTracker.options);
                        const uploadId = `manual_${urlTracker.workerId}_${Date.now()}`;
                        
                        const result = await urlTracker.performTrackedApiUpload(trackingData, testId, uploadId);
                        logger.success(`✅ Manual upload completed for test: ${testName}`);
                        return result;
                        
                    } catch (error) {
                        logger.error(`❌ Manual upload failed for test ${testName}: ${error.message}`);
                        throw error;
                    }
                } else {
                    logger.warn(`Manual upload skipped for test ${testName} - conditions not met`);
                    return null;
                }
            };
            
            // CRITICAL: Register cleanup with worker-scoped fixture (most reliable)
            if (global._workerCleanupFunctions) {
                global._workerCleanupFunctions.add(criticalCleanupFunction);
                logger.info(`CRITICAL: Registered cleanup function for ${testName} with worker fixture`);
            }
        },
        
        // Setup a handler that will be executed after each test - THIS IS CRITICAL
        afterEach: async ({ page }, testInfo) => {
            const testName = testInfo.title || 'unknown';
            logger.info(`=== AFTEREACH STARTING FOR: ${testName} ===`);
            
            const urlTracker = testInfo.urlTracker;
            
            // AUTO UPLOAD: Check if auto upload completed successfully
            if (urlTracker && urlTracker._uploadCompleted) {
                logger.success(`✅ AFTEREACH: Auto upload already completed for: ${testName}`);
            } else if (urlTracker && urlTracker.options.autoUploadOnTestEnd) {
                logger.info(`AFTEREACH: Auto upload detection is active for: ${testName}`);
            }
            
            // CRITICAL: Update session data with actual Playwright test status
            if (urlTracker && global._urlTrackerSessions) {
                try {
                    // Find the session for this test and update its status
                    const normalizedTestName = testName.toLowerCase().replace(/\s+/g, '_');
                    const sessionIndex = global._urlTrackerSessions.findIndex(session => {
                        const sessionTestName = (session.test_name || '').toLowerCase().replace(/\s+/g, '_');
                        const sessionOriginalName = session.metadata?.data?.name || '';
                        
                        return session.test_name === testName || 
                               sessionTestName === normalizedTestName ||
                               sessionOriginalName.includes(testName) ||
                               session.session_id.includes(normalizedTestName);
                    });
                    
                    if (sessionIndex >= 0) {
                        // Get actual Playwright test status
                        const playwrightStatus = testInfo.status || 'unknown';
                        const oldStatus = global._urlTrackerSessions[sessionIndex].status;
                        
                        global._urlTrackerSessions[sessionIndex].status = playwrightStatus;
                        global._urlTrackerSessions[sessionIndex].playwrightStatus = playwrightStatus;
                        
                        // Also store error information if test failed
                        if (playwrightStatus === 'failed' && testInfo.error) {
                            global._urlTrackerSessions[sessionIndex].error = {
                                message: testInfo.error.message,
                                stack: testInfo.error.stack
                            };
                        }
                        
                        // Store additional test metadata
                        global._urlTrackerSessions[sessionIndex].duration = testInfo.duration;
                        global._urlTrackerSessions[sessionIndex].startTime = testInfo.startTime;
                        global._urlTrackerSessions[sessionIndex].timeout = testInfo.timeout;
                        
                        logger.info(`AFTEREACH: Updated session status from '${oldStatus}' to '${playwrightStatus}' for test: ${testName}`);
                    } else {
                        logger.warn(`AFTEREACH: Could not find session to update status for test: ${testName}`);
                    }
                } catch (statusError) {
                    logger.error(`AFTEREACH: Error updating test status:`, statusError);
                }
            }
            
            // CRITICAL: Execute the cleanup function IMMEDIATELY but wait for uploads
            if (testInfo._criticalCleanup && typeof testInfo._criticalCleanup === 'function') {
                logger.info(`AFTEREACH: Executing CRITICAL cleanup for: ${testName}`);
                try {
                    // Execute cleanup and wait for any API uploads it initiates
                    await testInfo._criticalCleanup();
                    
                    // After cleanup, wait a bit more for any uploads that were started
                    if (global._activeApiUploads && global._activeApiUploads.size > 0) {
                        logger.info(`AFTEREACH: Cleanup completed, but ${global._activeApiUploads.size} uploads still active - waiting`);
                        
                        const postCleanupWait = 2000; // 2 seconds post-cleanup wait
                        const postStartWait = Date.now();
                        
                        while ((Date.now() - postStartWait) < postCleanupWait && global._activeApiUploads.size > 0) {
                            await new Promise(resolve => setTimeout(resolve, 50)); // Check every 50ms
                        }
                        
                        const finalActiveUploads = global._activeApiUploads.size;
                        if (finalActiveUploads > 0) {
                            logger.warn(`AFTEREACH: ${finalActiveUploads} uploads still active after post-cleanup wait`);
                        } else {
                            logger.success(`AFTEREACH: All uploads completed after cleanup`);
                        }
                    }
                    
                    logger.info(`AFTEREACH: CRITICAL cleanup completed for: ${testName}`);
                } catch (cleanupError) {
                    logger.error(`AFTEREACH: Error in CRITICAL cleanup for ${testName}:`, cleanupError);
                }
            } else {
                logger.warn(`AFTEREACH: No critical cleanup function found for: ${testName}`);
            }
            
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
                            
                            // Add to tracking results with new format
                            urlTracker.addTrackingResult({
                                spec_file: specFile,
                                test_name: testInfo.title ? testInfo.title.replace(/\s+/g, '_').toLowerCase() : 'unknown_test',
                                previous_url: urlTracker.lastUrl || 'null',
                                current_url: normalizedUrl,
                                timestamp: new Date().toISOString(),
                                navigation_type: 'final'
                            });
                        }
                    }
                } catch (e) {
                    // Ignore errors in final navigation recording
                }
                
                // Export tracking results one last time to ensure they're saved
                try {
                    urlTracker.exportResults();
                } catch (exportError) {
                    logger.error(`AFTEREACH: Error exporting final tracking results for test ${testInfo.title}:`, exportError);
                }
            }
            
            // SIMPLIFIED: With fire-and-forget approach, no need to check for active uploads
            logger.info(`AFTEREACH: Fire-and-forget API uploads initiated, no waiting required`);
            
            logger.info(`=== AFTEREACH COMPLETED FOR: ${testName} ===`);
        }
    };
};

/**
 * Aggregate API results from all worker files
 * This function reads all worker-specific JSONL files and combines the data
 */
function aggregateWorkerApiResults() {
    const apiErrors = [];
    const apiSuccesses = [];
    const apiSkips = [];
    const cleanupCalls = [];
    let workersFound = 0;
    let filesProcessed = 0;
    
    try {
        const workersDir = path.join(process.cwd(), 'test-results', 'workers');
        
        logger.verbose(`Looking for workers directory: ${workersDir}`);
        
        if (!fs.existsSync(workersDir)) {
            logger.verbose('No workers directory found, returning empty aggregation');
            return { apiErrors, apiSuccesses, apiSkips, cleanupCalls, workersFound, filesProcessed };
        }
        
        const workerFiles = fs.readdirSync(workersDir);
        const workerIds = new Set();
        
        logger.verbose(`Found ${workerFiles.length} files in workers directory: ${workerFiles.join(', ')}`);
        
        // Debug: List all files found
        workerFiles.forEach(file => {
            const filePath = path.join(workersDir, file);
            const stats = fs.statSync(filePath);
            logger.verbose(`  ${file}: ${stats.size} bytes, modified: ${stats.mtime}`);
        });
        
        // Process all worker API result files
        for (const file of workerFiles) {
            if (file.startsWith('worker-') && file.endsWith('.jsonl')) {
                filesProcessed++;
                const filePath = path.join(workersDir, file);
                
                // Extract worker ID from filename
                const workerIdMatch = file.match(/worker-(\d+)-/);
                const fileWorkerId = workerIdMatch ? workerIdMatch[1] : 'unknown';
                
                logger.verbose(`Processing worker file: ${file} (Worker ID: ${fileWorkerId})`);
                
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const lines = content.trim().split('\n').filter(line => line.trim());
                    
                    logger.verbose(`  File content: ${lines.length} lines`);
                    
                    if (lines.length === 0) {
                        logger.verbose(`  File is empty: ${file}`);
                        continue;
                    }
                    
                    // Add this worker ID to the set regardless of content
                    workerIds.add(fileWorkerId);
                    
                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line);
                            
                            // Ensure workerId is set from filename if not in data
                            if (!data.workerId) {
                                data.workerId = fileWorkerId;
                            }
                            
                            logger.verbose(`  Parsed data: ${JSON.stringify(data).substring(0, 100)}...`);
                            
                            // Categorize based on file type
                            if (file.includes('api-success')) {
                                apiSuccesses.push(data);
                                logger.verbose(`  Added to apiSuccesses`);
                            } else if (file.includes('api-error')) {
                                apiErrors.push(data);
                                logger.verbose(`  Added to apiErrors`);
                            } else if (file.includes('api-skip')) {
                                apiSkips.push(data);
                                logger.verbose(`  Added to apiSkips`);
                            }
                        } catch (parseError) {
                            logger.verbose(`Error parsing line in ${file}: ${parseError.message}`);
                            logger.verbose(`Problematic line: ${line}`);
                        }
                    }
                } catch (readError) {
                    logger.error(`Error reading worker file ${file}: ${readError.message}`);
                }
            } else {
                logger.verbose(`Skipping non-worker file: ${file}`);
            }
        }
        
        // Also try to get cleanup calls from worker data if available
        if (global._workerData && global._workerData.cleanupCalls) {
            cleanupCalls.push(...global._workerData.cleanupCalls);
        }
        
        // Also read cleanup files
        for (const file of workerFiles) {
            if (file.startsWith('worker-') && file.includes('cleanup') && file.endsWith('.jsonl')) {
                const filePath = path.join(workersDir, file);
                const workerIdMatch = file.match(/worker-(\d+)-/);
                const fileWorkerId = workerIdMatch ? workerIdMatch[1] : 'unknown';
                
                logger.verbose(`Processing cleanup file: ${file} (Worker ID: ${fileWorkerId})`);
                
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const lines = content.trim().split('\n').filter(line => line.trim());
                    
                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line);
                            if (!data.workerId) {
                                data.workerId = fileWorkerId;
                            }
                            cleanupCalls.push(data);
                            logger.verbose(`  Added cleanup call from file: ${data.testName}`);
                        } catch (parseError) {
                            logger.verbose(`Error parsing cleanup line in ${file}: ${parseError.message}`);
                        }
                    }
                } catch (readError) {
                    logger.error(`Error reading cleanup file ${file}: ${readError.message}`);
                }
            }
        }
        
        workersFound = workerIds.size;
        
        logger.verbose(`Aggregation complete: ${workersFound} workers, ${filesProcessed} files, ${apiSuccesses.length} successes, ${apiErrors.length} errors, ${apiSkips.length} skips`);
        
    } catch (error) {
        logger.error(`Error during API results aggregation: ${error.message}`);
    }
    
    return { apiErrors, apiSuccesses, apiSkips, cleanupCalls, workersFound, filesProcessed };
}

/**
 * Aggregate session data from all worker files
 * This function reads all worker-specific session JSONL files and combines the data
 */
function aggregateWorkerSessions() {
    const sessions = [];
    
    try {
        const workersDir = path.join(process.cwd(), 'test-results', 'workers');
        
        logger.info(`SESSION AGGREGATION: Looking for workers directory: ${workersDir}`);
        
        if (!fs.existsSync(workersDir)) {
            logger.info('SESSION AGGREGATION: No workers directory found for session aggregation');
            return sessions;
        }
        
        const workerFiles = fs.readdirSync(workersDir);
        logger.info(`SESSION AGGREGATION: Found ${workerFiles.length} files in workers directory: ${workerFiles.join(', ')}`);
        
        // Process all worker session files
        for (const file of workerFiles) {
            if (file.startsWith('worker-') && file.includes('sessions') && file.endsWith('.jsonl')) {
                const filePath = path.join(workersDir, file);
                logger.info(`SESSION AGGREGATION: Processing session file: ${file}`);
                
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const lines = content.trim().split('\n').filter(line => line.trim());
                    logger.info(`SESSION AGGREGATION: File ${file} has ${lines.length} lines`);
                    
                    for (const line of lines) {
                        try {
                            const sessionData = JSON.parse(line);
                            
                            // Add worker ID to session if not present
                            if (!sessionData.workerId) {
                                const workerIdMatch = file.match(/worker-(\d+)-/);
                                if (workerIdMatch) {
                                    sessionData.workerId = workerIdMatch[1];
                                }
                            }
                            
                            sessions.push(sessionData);
                            logger.verbose(`SESSION AGGREGATION: Added session: ${sessionData.test_name || sessionData.session_id}`);
                        } catch (parseError) {
                            logger.error(`SESSION AGGREGATION: Error parsing session line in ${file}: ${parseError.message}`);
                            logger.error(`SESSION AGGREGATION: Problematic line: ${line.substring(0, 100)}...`);
                        }
                    }
                } catch (readError) {
                    logger.error(`SESSION AGGREGATION: Error reading worker session file ${file}: ${readError.message}`);
                }
            } else {
                logger.verbose(`SESSION AGGREGATION: Skipping non-session file: ${file}`);
            }
        }
        
        logger.info(`SESSION AGGREGATION: Complete - ${sessions.length} sessions from worker files`);
        
        // Debug: Log sample session data
        if (sessions.length > 0) {
            logger.info(`SESSION AGGREGATION: Sample session: ${JSON.stringify(sessions[0], null, 2).substring(0, 300)}...`);
        }
        
    } catch (error) {
        logger.error(`SESSION AGGREGATION: Error during session aggregation: ${error.message}`);
        logger.error(`SESSION AGGREGATION: Error stack: ${error.stack}`);
    }
    
    return sessions;
}

/**
 * Generate a comprehensive API upload report by aggregating from all worker files
 * This function reads all worker-specific API result files and creates a unified report
 */
function generateApiUploadReport() {
    try {
        // Aggregate data from all worker files
        const aggregatedData = aggregateWorkerApiResults();
        const { apiErrors, apiSuccesses, apiSkips, cleanupCalls } = aggregatedData;
        
        // Debug logging to help identify issues
        logger.verbose(`=== API UPLOAD REPORT DEBUG (AGGREGATED) ===`);
        logger.verbose(`API Upload Report Debug: Found ${apiErrors.length} errors, ${apiSuccesses.length} successes, ${apiSkips.length} skips`);
        logger.verbose(`Cleanup calls made: ${cleanupCalls.length}`);
        logger.verbose(`Workers found: ${aggregatedData.workersFound}`);
        logger.verbose(`Total files processed: ${aggregatedData.filesProcessed}`);
        
        // Show cleanup call details
        if (cleanupCalls.length > 0) {
            logger.verbose(`Cleanup calls details (aggregated from all workers):`);
            cleanupCalls.forEach((call, index) => {
                logger.verbose(`  ${index + 1}. ${call.testName} (Worker ${call.workerId}) - API Upload: ${call.apiUploadEnabled}, Has Uploader: ${call.hasApiUploader}, Results: ${call.trackingResultsCount}`);
            });
        } else {
            logger.verbose(`NO CLEANUP CALLS DETECTED! This means cleanup() method was never called.`);
            logger.verbose(`This indicates the URL tracker fixture is not being used correctly.`);
            logger.verbose(`Make sure you are using createUrlTrackerFixture() and test.use(fixture).`);
        }
        
        // Show aggregated contents summary
        if (apiErrors.length > 0) {
            logger.verbose(`API Errors summary: ${apiErrors.length} errors across workers`);
            if (logger.verboseMode) {
                apiErrors.forEach((error, index) => {
                    logger.verbose(`  Error ${index + 1}: ${error.testName} (Worker ${error.workerId}) - ${error.error}`);
                });
            }
        }
        if (apiSuccesses.length > 0) {
            logger.verbose(`API Successes summary: ${apiSuccesses.length} successes across workers`);
        }
        if (apiSkips.length > 0) {
            logger.verbose(`API Skips summary: ${apiSkips.length} skips across workers`);
        }
        
        // Count total tests that attempted API upload
        const totalApiAttempts = apiErrors.length + apiSuccesses.length;
        
        if (totalApiAttempts === 0) {
            logger.verbose('API Upload Report: No API upload attempts detected');
            
            if (cleanupCalls.length === 0) {
                logger.verbose('ROOT CAUSE: cleanup() method was never called!');
                logger.verbose('SOLUTION: Use the new self-contained fixture approach:');
                logger.verbose('  1. Import: const { createUrlTrackerFixture } = require("@lambdatest/playwright-driver");');
                logger.verbose('  2. Create fixture: const fixture = createUrlTrackerFixture({ enableApiUpload: true });');
                logger.verbose('  3. Use fixture: test.use(fixture);');
                logger.verbose('  4. Remove any manual URL tracker setup from your tests');
            } else {
                logger.verbose('Cleanup was called but no API uploads occurred. Possible reasons:');
                logger.verbose('  1. API upload is disabled (enableApiUpload: false)');
                logger.verbose('  2. No URL tracking results were generated');
                logger.verbose('  3. API upload conditions were not met in cleanup()');
                logger.verbose('  4. API uploader was not properly initialized');
            }
            return;
        }
        
        logger.info('🔗 URL TRACKER - API UPLOAD REPORT');
        
        if (apiSuccesses.length > 0) {
            logger.apiUpload(`✅ Successful uploads: ${apiSuccesses.length}`);
            if (logger.verboseMode) {
                apiSuccesses.forEach(success => {
                    logger.success(`   ✓ ${success.testName} (${success.timestamp})`);
                });
            }
        }
        
        if (apiErrors.length > 0) {
            logger.error(`❌ Failed uploads: ${apiErrors.length}`);
            apiErrors.forEach(error => {
                logger.error(`   ✗ ${error.testName}: ${error.error} (${error.timestamp})`);
            });
            
            // If there are API upload failures, throw an error to fail the test run
            logger.error('⚠️  API UPLOAD FAILURES DETECTED - TEST RUN FAILED');
            
            // Create a detailed error message
            const errorMessage = `API Upload Failed: ${apiErrors.length} out of ${totalApiAttempts} tests failed to upload tracking data to LambdaTest API. ` +
                                `Failed tests: ${apiErrors.map(e => e.testName).join(', ')}`;
            
            // Write error report to file
            const errorReportPath = path.join(process.cwd(), 'api-upload-error-report.json');
            try {
                fs.writeFileSync(errorReportPath, JSON.stringify({
                    summary: {
                        totalAttempts: totalApiAttempts,
                        successful: apiSuccesses.length,
                        failed: apiErrors.length,
                        timestamp: new Date().toISOString()
                    },
                    failures: apiErrors,
                    successes: apiSuccesses
                }, null, 2));
                logger.error(`Detailed error report saved to: ${errorReportPath}`);
            } catch (writeError) {
                logger.error(`Failed to write error report: ${writeError.message}`);
            }
            
            // Throw error to fail the test run
            throw new Error(errorMessage);
        } else {
            logger.apiUpload(`✅ All ${apiSuccesses.length} API uploads completed successfully`);
        }
        
    } catch (error) {
        if (error.message.includes('API Upload Failed:')) {
            // Re-throw API upload errors
            throw error;
        } else {
            logger.error('Error generating API upload report:', error);
        }
    }
}

/**
 * IMPROVED: Generate API upload report with coordination awareness
 * This version includes information about active uploads and provides better coordination
 */
function generateApiUploadReportWithCoordination() {
    try {
        logger.info('🔗 URL TRACKER - COORDINATED API UPLOAD REPORT');
        
        // Check for active uploads
        const activeUploads = global._activeApiUploads ? global._activeApiUploads.size : 0;
        if (activeUploads > 0) {
            logger.warn(`⚠️  ${activeUploads} API uploads still active during report generation`);
            
            // Log details of active uploads
            if (global._activeApiUploads) {
                for (const [uploadId, upload] of global._activeApiUploads) {
                    const duration = Date.now() - upload.startTime;
                    const status = upload.status || 'unknown';
                    logger.warn(`  Active: ${uploadId} (${upload.testName}, ${duration}ms elapsed, status: ${status})`);
                }
            }
        }
        
        // Aggregate data from all worker files
        const aggregatedData = aggregateWorkerApiResults();
        const { apiErrors, apiSuccesses, apiSkips, cleanupCalls } = aggregatedData;
        
        // Enhanced debugging with coordination info
        logger.verbose(`=== COORDINATED API UPLOAD REPORT DEBUG ===`);
        logger.verbose(`Found ${apiErrors.length} errors, ${apiSuccesses.length} successes, ${apiSkips.length} skips`);
        logger.verbose(`Active uploads during report: ${activeUploads}`);
        logger.verbose(`Cleanup calls made: ${cleanupCalls.length}`);
        logger.verbose(`Workers found: ${aggregatedData.workersFound}`);
        logger.verbose(`Total files processed: ${aggregatedData.filesProcessed}`);
        
        // Count total tests that attempted API upload
        const totalApiAttempts = apiErrors.length + apiSuccesses.length;
        
        if (totalApiAttempts === 0 && activeUploads === 0) {
            logger.verbose('No API upload attempts detected and no active uploads');
            return;
        }
        
        // Report results with coordination awareness
        const totalExpected = totalApiAttempts + activeUploads;
        logger.info(`📊 Upload Summary: ${totalExpected} total (${apiSuccesses.length} ✅, ${apiErrors.length} ❌, ${activeUploads} ⏳)`);
        
        if (apiSuccesses.length > 0) {
            logger.apiUpload(`✅ Successful uploads: ${apiSuccesses.length}`);
            if (logger.verboseMode) {
                apiSuccesses.forEach(success => {
                    const duration = success.duration ? `${success.duration}ms` : 'unknown duration';
                    logger.success(`   ✓ ${success.testName} (${success.timestamp}, ${duration})`);
                });
            }
        }
        
        if (apiErrors.length > 0) {
            logger.error(`❌ Failed uploads: ${apiErrors.length}`);
            apiErrors.forEach(error => {
                logger.error(`   ✗ ${error.testName}: ${error.error} (${error.timestamp})`);
            });
        }
        
        if (activeUploads > 0) {
            logger.warn(`⏳ In-progress uploads: ${activeUploads} (may complete in background)`);
        }
        
        // Only fail the test run if there are confirmed errors and no active uploads
        if (apiErrors.length > 0 && activeUploads === 0) {
            logger.error('⚠️  API UPLOAD FAILURES DETECTED - TEST RUN FAILED');
            
            const errorMessage = `API Upload Failed: ${apiErrors.length} out of ${totalApiAttempts} tests failed to upload tracking data to LambdaTest API. ` +
                                `Failed tests: ${apiErrors.map(e => e.testName).join(', ')}`;
            
            // Write coordinated error report
            const errorReportPath = path.join(process.cwd(), 'api-upload-coordinated-error-report.json');
            try {
                fs.writeFileSync(errorReportPath, JSON.stringify({
                    summary: {
                        totalAttempts: totalApiAttempts,
                        successful: apiSuccesses.length,
                        failed: apiErrors.length,
                        active: activeUploads,
                        timestamp: new Date().toISOString(),
                        coordination: 'enabled'
                    },
                    failures: apiErrors,
                    successes: apiSuccesses,
                    activeUploads: activeUploads > 0 ? Array.from(global._activeApiUploads.values()) : []
                }, null, 2));
                logger.error(`Coordinated error report saved to: ${errorReportPath}`);
            } catch (writeError) {
                logger.error(`Failed to write coordinated error report: ${writeError.message}`);
            }
            
            throw new Error(errorMessage);
        } else if (apiErrors.length === 0) {
            logger.apiUpload(`✅ All completed uploads successful (${apiSuccesses.length} confirmed${activeUploads > 0 ? `, ${activeUploads} in progress` : ''})`);
        } else if (activeUploads > 0) {
            logger.warn(`⚠️  ${apiErrors.length} uploads failed, but ${activeUploads} still in progress - final result pending`);
        }
        
    } catch (error) {
        if (error.message.includes('API Upload Failed:')) {
            // Re-throw API upload errors
            throw error;
        } else {
            logger.error('Error generating coordinated API upload report:', error);
        }
    }
}

/**
 * Global cleanup function to clean up all remaining URL trackers
 * This is automatically called by process handlers, but can also be called manually
 */
function performGlobalUrlTrackerCleanup() {
    return new Promise(async (resolve) => {
        try {
            // Prevent multiple cleanup calls
            if (global._urlTrackerGlobalCleanupCalled) {
                logger.info('Global cleanup already called, skipping');
                resolve();
                return;
            }
            global._urlTrackerGlobalCleanupCalled = true;
            
            logger.info('=== PERFORMING GLOBAL URL TRACKER CLEANUP ===');
            
            const registry = global._urlTrackerRegistry;
            if (!registry) {
                logger.info('No URL tracker registry found');
                resolve();
                return;
            }
            
            // Set flag to indicate all tests are complete
            allTestsComplete = true;
            
            // Clean up all remaining trackers
            if (registry.trackers && registry.trackers.size > 0) {
                logger.info(`Cleaning up ${registry.trackers.size} remaining URL trackers`);
                
                for (const [testId, tracker] of registry.trackers) {
                    try {
                        if (tracker && typeof tracker.cleanup === 'function') {
                            logger.info(`Cleaning up tracker: ${testId}`);
                            await tracker.cleanup();
                        }
                    } catch (error) {
                        logger.error(`Error cleaning up tracker ${testId}:`, error);
                    }
                }
                
                // Clear the registry
                registry.trackers.clear();
            } else {
                logger.info('No remaining URL trackers to clean up');
            }
            
            // Execute any remaining test end callbacks
            if (registry.testEndCallbacks && registry.testEndCallbacks.size > 0) {
                logger.info(`Executing ${registry.testEndCallbacks.size} remaining test end callbacks`);
                
                for (const callback of registry.testEndCallbacks) {
                    try {
                        await callback();
                    } catch (error) {
                        logger.error('Error executing test end callback:', error);
                    }
                }
                
                registry.testEndCallbacks.clear();
            }
            
            // Wait for any pending cleanup operations and API uploads to complete
            logger.info('Waiting for any pending cleanup operations and API uploads to complete...');
            
            // Store the initial count of cleanup calls
            const initialCleanupCalls = global._urlTrackerCleanupCalls ? global._urlTrackerCleanupCalls.length : 0;
            const initialApiSuccesses = global._urlTrackerApiSuccesses ? global._urlTrackerApiSuccesses.length : 0;
            
            logger.info(`Initial state: ${initialCleanupCalls} cleanup calls, ${initialApiSuccesses} API successes`);
            
            // Wait much longer for cleanup operations to complete - this is the critical part
            let waitTime = 0;
            const maxWaitTime = 60000; // Maximum 60 seconds total (doubled)
            const checkInterval = 2000; // Check every 2 seconds (increased for stability)
            let lastLogTime = 0;
            
            while (waitTime < maxWaitTime) {
                const currentCleanupCalls = global._urlTrackerCleanupCalls ? global._urlTrackerCleanupCalls.length : 0;
                const currentApiSuccesses = global._urlTrackerApiSuccesses ? global._urlTrackerApiSuccesses.length : 0;
                const currentApiErrors = global._urlTrackerApiErrors ? global._urlTrackerApiErrors.length : 0;
                const totalApiAttempts = currentApiSuccesses + currentApiErrors;
                const activeUploads = global._activeApiUploads ? global._activeApiUploads.size : 0;
                
                // Log progress every 5 seconds
                if (waitTime - lastLogTime >= 5000) {
                    const currentApiSkips = global._urlTrackerApiSkips ? global._urlTrackerApiSkips.length : 0;
                    logger.info(`Progress: ${currentCleanupCalls} cleanup calls, ${currentApiSuccesses} successes, ${currentApiErrors} errors, ${currentApiSkips} skips, ${activeUploads} active uploads`);
                    lastLogTime = waitTime;
                }
                
                // Check if all cleanup calls have corresponding API results (success or error)
                // We need to account for both API uploads and potential skips
                const currentApiSkips = global._urlTrackerApiSkips ? global._urlTrackerApiSkips.length : 0;
                const totalApiOperations = currentApiSuccesses + currentApiErrors + currentApiSkips;
                
                // Also check if there are any active API uploads still in progress
                if (activeUploads > 0) {
                    logger.info(`Still waiting for ${activeUploads} active API uploads to complete...`);
                    await new Promise(resolve => setTimeout(resolve, checkInterval));
                    waitTime += checkInterval;
                    continue;
                }
                
                if (currentCleanupCalls > 0 && totalApiOperations >= currentCleanupCalls) {
                    logger.info(`All cleanup operations completed after waiting ${waitTime}ms`);
                    logger.info(`Final: ${currentCleanupCalls} cleanup calls, ${totalApiOperations} total API operations (${currentApiSuccesses} successes, ${currentApiErrors} errors, ${currentApiSkips} skips)`);
                    break;
                }
                
                // Also check if there are any active trackers still processing
                let hasActiveTrackers = false;
                if (registry.trackers && registry.trackers.size > 0) {
                    for (const [testId, tracker] of registry.trackers) {
                        if (tracker && !tracker.cleanupCalled) {
                            hasActiveTrackers = true;
                            break;
                        }
                    }
                }
                
                if (!hasActiveTrackers && currentCleanupCalls > 0 && totalApiOperations >= currentCleanupCalls) {
                    logger.info(`No active trackers and all API operations completed after waiting ${waitTime}ms`);
                    break;
                }
                
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                waitTime += checkInterval;
            }
            
            if (waitTime >= maxWaitTime) {
                const finalCleanupCalls = global._urlTrackerCleanupCalls ? global._urlTrackerCleanupCalls.length : 0;
                const finalApiSuccesses = global._urlTrackerApiSuccesses ? global._urlTrackerApiSuccesses.length : 0;
                const finalApiErrors = global._urlTrackerApiErrors ? global._urlTrackerApiErrors.length : 0;
                logger.warn(`Timed out after ${maxWaitTime}ms waiting for operations to complete`);
                logger.warn(`Final state: ${finalCleanupCalls} cleanup calls, ${finalApiSuccesses} API successes, ${finalApiErrors} API errors`);
            }
            
            // Clean up duplicate sessions before generating reports
            try {
                const resultsFile = path.join(process.cwd(), 'test-results', 'url-tracking-results.json');
                if (fs.existsSync(resultsFile)) {
                    logger.info('Cleaning up duplicate session entries...');
                    const fileContent = fs.readFileSync(resultsFile, 'utf-8');
                    const allSessions = JSON.parse(fileContent);
                    
                    // Deduplicate sessions by test name and spec file, keeping the one with most navigations
                    const deduplicatedSessions = [];
                    const seenTests = new Map();
                    
                    for (const session of allSessions) {
                        const testKey = `${session.spec_file}_${session.metadata?.data?.name || 'unknown'}`;
                        const existing = seenTests.get(testKey);
                        
                        if (!existing || (session.navigations && session.navigations.length > existing.navigations.length)) {
                            seenTests.set(testKey, session);
                        }
                    }
                    
                    // Convert back to array
                    deduplicatedSessions.push(...seenTests.values());
                    
                    if (deduplicatedSessions.length !== allSessions.length) {
                        logger.info(`Removed ${allSessions.length - deduplicatedSessions.length} duplicate session entries`);
                        fs.writeFileSync(resultsFile, JSON.stringify(deduplicatedSessions, null, 2));
                    }
                }
            } catch (cleanupError) {
                logger.error('Error cleaning up duplicate sessions:', cleanupError);
            }
            
            // Clear any pending fallback HTML report generation
            if (global._htmlReportTimeout) {
                clearTimeout(global._htmlReportTimeout);
                global._htmlReportTimeout = null;
            }
            
            // Generate final HTML report with aggregated sessions from all workers
            try {
                // Aggregate sessions from all worker files
                const aggregatedSessions = aggregateWorkerSessions();
                
                logger.info(`GLOBAL CLEANUP: HTML Report Debug: EnhancedHtmlReporter available: ${!!EnhancedHtmlReporter}`);
                logger.info(`GLOBAL CLEANUP: HTML Report Debug: Aggregated sessions count: ${aggregatedSessions.length}`);
                
                if (EnhancedHtmlReporter && aggregatedSessions.length > 0) {
                    logger.info(`Generating final HTML report with ${aggregatedSessions.length} sessions from ${aggregatedSessions.filter((s, i, arr) => arr.findIndex(ss => ss.workerId === s.workerId) === i).length} workers...`);
                    
                    // If no global reporter exists, create one
                    if (!globalHtmlReporter) {
                        logger.info(`GLOBAL CLEANUP: Creating new EnhancedHtmlReporter instance...`);
                        globalHtmlReporter = new EnhancedHtmlReporter({
                            outputDir: 'test-results',
                            title: 'Playwright URL Tracking Report (Multi-Worker)',
                            theme: 'dark',
                            enableKeyboardShortcut: true,
                            autoOpen: true, // Enable auto-open for better UX
                            enableSearch: true,
                            enableFilters: true,
                            showMetrics: true,
                            showTimeline: true
                        });
                        logger.info(`GLOBAL CLEANUP: EnhancedHtmlReporter instance created successfully`);
                    }
                    
                    // Generate the final report with all aggregated sessions
                    logger.info(`GLOBAL CLEANUP: Calling generateReport with ${aggregatedSessions.length} sessions...`);
                    const htmlReportPath = globalHtmlReporter.generateReport(aggregatedSessions, 'playwright');
                    logger.success(`Final HTML report generated with ${aggregatedSessions.length} sessions: ${htmlReportPath}`);
                    
                    // Show the HTML report prompt
                    showHtmlReportPrompt(globalHtmlReporter, htmlReportPath);
                } else if (!EnhancedHtmlReporter) {
                    logger.warn('GLOBAL CLEANUP: EnhancedHtmlReporter not available - generating basic HTML report');
                    // Generate a basic HTML report as fallback
                    try {
                        if (aggregatedSessions.length > 0) {
                            generateBasicHtmlReport(aggregatedSessions);
                        } else {
                            logger.info('GLOBAL CLEANUP: No sessions for basic HTML report either');
                        }
                    } catch (basicError) {
                        logger.error('GLOBAL CLEANUP: Basic HTML report generation also failed:', basicError.message);
                    }
                } else if (aggregatedSessions.length === 0) {
                    logger.info('No sessions found for HTML report generation');
                    logger.verbose('Checking for session files...');
                    
                    // Debug: Check what session files exist
                    try {
                        const workersDir = path.join(process.cwd(), 'test-results', 'workers');
                        if (fs.existsSync(workersDir)) {
                            const sessionFiles = fs.readdirSync(workersDir).filter(f => f.includes('sessions'));
                            logger.verbose(`Found ${sessionFiles.length} session files: ${sessionFiles.join(', ')}`);
                        }
                    } catch (debugError) {
                        logger.verbose(`Error checking session files: ${debugError.message}`);
                    }
                }
            } catch (htmlError) {
                logger.error('Error generating final HTML report:', htmlError);
                logger.error('GLOBAL CLEANUP: HTML Error stack:', htmlError.stack);
            }
            
            // Generate final API upload report
            try {
                generateApiUploadReport();
            } catch (error) {
                logger.error('Error generating API upload report:', error);
            }
            
            logger.info('=== GLOBAL URL TRACKER CLEANUP COMPLETED ===');
            resolve();
            
        } catch (error) {
            logger.error('Error during global URL tracker cleanup:', error);
            resolve();
        }
    });
}

/**
 * Generate a basic HTML report as fallback when EnhancedHtmlReporter is not available
 */
function generateBasicHtmlReport(sessions) {
    try {
        if (!sessions || sessions.length === 0) {
            logger.warn('No sessions available for basic HTML report');
            return null;
        }
        
        logger.info(`Generating basic HTML report with ${sessions.length} sessions...`);
        
        // Ensure output directory exists
        const outputDir = path.join(process.cwd(), 'test-results');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Generate basic HTML content
        const htmlContent = generateBasicHtmlContent(sessions);
        
        // Write HTML file
        const reportPath = path.join(outputDir, 'url-tracking-basic-report.html');
        fs.writeFileSync(reportPath, htmlContent, 'utf8');
        
        logger.success(`✅ Basic HTML report generated: ${reportPath}`);
        
        // Show notification
        setTimeout(() => {
            console.log('\n📄 Basic URL Tracking Report Generated!');
            console.log(`📁 Report: ${reportPath}`);
            console.log('💡 For enhanced features, ensure @lambdatest/sdk-utils is properly installed\n');
        }, 100);
        
        return reportPath;
        
    } catch (error) {
        logger.error('Error generating basic HTML report:', error.message);
        throw error;
    }
}

/**
 * Generate basic HTML content for the report
 */
function generateBasicHtmlContent(sessions) {
    const totalNavigations = sessions.reduce((sum, session) => sum + (session.navigations?.length || 0), 0);
    const uniqueUrls = new Set();
    
    sessions.forEach(session => {
        if (session.navigations) {
            session.navigations.forEach(nav => {
                if (nav.current_url && nav.current_url !== 'null') {
                    uniqueUrls.add(nav.current_url);
                }
            });
        }
    });
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LambdaTest URL Tracking Report</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            margin: 0; 
            padding: 20px; 
            background: #f6f8fa; 
            color: #24292f;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { 
            background: white; 
            padding: 24px; 
            border-radius: 8px; 
            box-shadow: 0 1px 3px rgba(0,0,0,0.1); 
            margin-bottom: 24px; 
        }
        .header h1 { margin: 0; color: #0969da; }
        .stats { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
            gap: 16px; 
            margin-bottom: 24px; 
        }
        .stat-card { 
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            box-shadow: 0 1px 3px rgba(0,0,0,0.1); 
            text-align: center; 
        }
        .stat-number { font-size: 32px; font-weight: bold; color: #0969da; }
        .stat-label { color: #656d76; margin-top: 8px; }
        .session { 
            background: white; 
            margin-bottom: 16px; 
            border-radius: 8px; 
            overflow: hidden; 
            box-shadow: 0 1px 3px rgba(0,0,0,0.1); 
        }
        .session-header { 
            background: #f6f8fa; 
            padding: 16px; 
            border-bottom: 1px solid #d0d7de; 
            font-weight: 600; 
        }
        .navigation { 
            padding: 12px 16px; 
            border-bottom: 1px solid #f6f8fa; 
            display: flex; 
            align-items: center; 
        }
        .navigation:last-child { border-bottom: none; }
        .nav-arrow { margin: 0 12px; color: #656d76; }
        .url { 
            font-family: 'SFMono-Regular', Consolas, monospace; 
            background: #f6f8fa; 
            padding: 4px 8px; 
            border-radius: 4px; 
            font-size: 12px; 
        }
        .nav-type { 
            background: #ddf4ff; 
            color: #0969da; 
            padding: 2px 8px; 
            border-radius: 12px; 
            font-size: 11px; 
            margin-left: auto; 
        }
        .timestamp { color: #656d76; font-size: 11px; margin-left: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔗 LambdaTest URL Tracking Report</h1>
            <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">${sessions.length}</div>
                <div class="stat-label">Test Sessions</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${totalNavigations}</div>
                <div class="stat-label">Total Navigations</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${uniqueUrls.size}</div>
                <div class="stat-label">Unique URLs</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${Math.round(totalNavigations / sessions.length)}</div>
                <div class="stat-label">Avg per Session</div>
            </div>
        </div>
        
        ${sessions.map(session => `
            <div class="session">
                <div class="session-header">
                    📝 ${session.test_name || 'Unknown Test'} 
                    <span style="color: #656d76; font-weight: normal;">
                        (${session.spec_file || 'unknown.spec.js'})
                    </span>
                </div>
                ${(session.navigations || []).map(nav => `
                    <div class="navigation">
                        <span class="url">${nav.previous_url === 'null' ? '🏠 Start' : nav.previous_url}</span>
                        <span class="nav-arrow">→</span>
                        <span class="url">${nav.current_url}</span>
                        <span class="nav-type">${nav.navigation_type || 'navigation'}</span>
                        <span class="timestamp">${new Date(nav.timestamp).toLocaleTimeString()}</span>
                    </div>
                `).join('')}
            </div>
        `).join('')}
        
        <div style="text-align: center; margin-top: 40px; color: #656d76; font-size: 14px;">
            <p>💡 For enhanced features including search, filters, and metrics dashboard, 
               ensure @lambdatest/sdk-utils is properly installed</p>
            <p>Generated by LambdaTest URL Tracker</p>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Export the global cleanup function for manual use
 */
module.exports.performGlobalUrlTrackerCleanup = performGlobalUrlTrackerCleanup; 
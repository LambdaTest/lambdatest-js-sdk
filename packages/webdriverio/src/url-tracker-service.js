const path = require('path');
const UrlTracker = require('./url-tracker');

class UrlTrackerService {
    constructor(options = {}) {
        this.options = {
            resetFileOnStart: true,
            ...options
        };
        this.urlTracker = null;
        this.currentSpecFile = '';
        this.browser = null;
        this.specs = [];
        this.isDestroyed = false;
    }

    async before(capabilities, specs, browser) {
        console.log('URL Tracker Service - before() starting up');
        // Store browser and specs for later use
        this.browser = browser;
        this.specs = specs;
        
        console.log('URL Tracker Service - File reset is disabled to preserve data across sessions');
        
        // Get a clean spec file name from the specs array
        if (specs.length > 0) {
            this.currentSpecFile = path.basename(specs[0]);
            console.log('URL Tracker Service - Using spec file:', this.currentSpecFile);
        }
        
        // Initialize the URL tracker
        this.urlTracker = new UrlTracker(browser, {
            ...this.options,
            // Force this to be false to preserve data across sessions
            resetFileOnStart: false
        });
        await this.urlTracker.init();

        // Pass the spec file to the URL tracker
        if (this.currentSpecFile && this.urlTracker) {
            this.urlTracker.setSpecFile(this.currentSpecFile);
        }

        // Set up global test info object
        if (typeof global !== 'undefined') {
            global.currentTestInfo = global.currentTestInfo || {
                file: this.currentSpecFile || '',
                name: '',
                suite: ''
            };
            
            // Set the file if not already set
            if (this.currentSpecFile && !global.currentTestInfo.file) {
                global.currentTestInfo.file = this.currentSpecFile;
            }
        }

        // Add getUrlTracker method to browser object
        browser.getUrlTracker = () => {
            if (!this.urlTracker) {
                throw new Error('UrlTracker is not initialized');
            }
            return this.urlTracker;
        };

        // Add setTestContext method to browser object
        browser.setTestContext = (specFile, testName) => {
            if (!this.urlTracker) {
                throw new Error('UrlTracker is not initialized');
            }
            
            // Update the current spec file
            this.currentSpecFile = specFile;
            
            // Update global test info
            if (typeof global !== 'undefined') {
                global.currentTestInfo = global.currentTestInfo || {};
                global.currentTestInfo.file = specFile;
                global.currentTestInfo.name = testName;
            }
            
            this.urlTracker.setTestContext(specFile, testName);
        };

        console.log('URL Tracker Service - before() completed');
    }

    // Hook for custom command registration
    async beforeCommand(commandName, args) {
        console.log('URL Tracker Service - beforeCommand():', commandName);
        
        // Additional handling for URL navigation commands
        if (this.urlTracker && (commandName === 'url' || commandName === 'navigateTo')) {
            if (args && args.length > 0 && typeof args[0] === 'string') {
                console.log('URL Tracker Service - Navigation command detected:', commandName, args[0]);
            }
        }
    }

    // Hook for URL changes via commands
    async afterCommand(commandName, args, result, error) {
        console.log('URL Tracker Service - afterCommand():', commandName, 'completed');
        
        if (this.urlTracker && !error && (commandName === 'url' || commandName === 'navigateTo')) {
            // After a navigation command, force a URL check
            try {
                const currentUrl = await this.browser.getUrl();
                console.log('URL Tracker Service - After navigation command, current URL:', currentUrl);
            } catch (err) {
                console.error('URL Tracker Service - Error getting URL after command:', err);
            }
        }
    }

    // Hook that runs before each test
    beforeTest(test) {
        console.log('URL Tracker Service - beforeTest():', test?.title);
        
        if (this.urlTracker && test) {
            // Use the test info to set context
            const specFile = test.file ? path.basename(test.file) : this.currentSpecFile;
            const testName = test.fullTitle || test.title || test.description || 'Unknown Test';
            
            console.log('URL Tracker Service - beforeTest - Setting test context:', specFile, testName);
            
            // Update global test info
            if (typeof global !== 'undefined') {
                global.currentTestInfo = global.currentTestInfo || {};
                global.currentTestInfo.file = specFile;
                global.currentTestInfo.name = testName;
            }
            
            this.urlTracker.setTestContext(specFile, testName);
        }
    }
    
    // Hook that runs after each test
    afterTest(test) {
        console.log('URL Tracker Service - afterTest():', test?.title);
        
        // Save navigation events after each test to ensure data is preserved
        if (this.urlTracker) {
            this.urlTracker.saveReport();
        }
    }

    // Hook that runs before each suite
    beforeSuite(suite) {
        console.log('URL Tracker Service - beforeSuite():', suite?.title);
        
        if (this.urlTracker && suite) {
            // Use the suite file if available
            if (suite.file) {
                const specFile = path.basename(suite.file);
                console.log('URL Tracker Service - beforeSuite - Setting spec file:', specFile);
                
                // Update global test info
                if (typeof global !== 'undefined') {
                    global.currentTestInfo = global.currentTestInfo || {};
                    global.currentTestInfo.file = specFile;
                    global.currentTestInfo.suite = suite.title || '';
                }
                
                this.urlTracker.setSpecFile(specFile);
            }
        }
    }
    
    // Hook for browser reloads
    onReload(oldSessionId, newSessionId) {
        console.log('URL Tracker Service - onReload():', oldSessionId, '->', newSessionId);
        
        // Save the current report before reloading
        if (this.urlTracker) {
            this.urlTracker.saveReport();
        }
    }

    // Hook for after the session is ended
    async after() {
        console.log('URL Tracker Service - after() cleaning up');
        
        if (this.urlTracker && !this.isDestroyed) {
            // Record final URL
            await this.urlTracker.onBeforeExit();
            
            // Clean up resources
            this.urlTracker.destroy();
            this.isDestroyed = true;
        }
        
        console.log('URL Tracker Service - after() completed');
    }

    // Final cleanup as the process is exiting
    onComplete() {
        console.log('URL Tracker Service - onComplete() final cleanup');
        
        if (this.urlTracker && !this.isDestroyed) {
            this.urlTracker.destroy();
            this.isDestroyed = true;
        }
    }

    // Utility to get the URL tracker instance directly
    getUrlTracker() {
        return this.urlTracker;
    }
}

// Export service instance factory
module.exports = UrlTrackerService; 
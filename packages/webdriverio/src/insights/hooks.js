/**
 * WebdriverIO hooks for the URL Tracker plugin
 * 
 * This file contains helper functions to enhance test information capturing
 * Add these hooks to your wdio.conf.js file to improve spec file detection
 */

/**
 * Builds a full test name from a test object
 * @param {Object} test Mocha test object
 * @returns {string} Full test name including parent suites
 */
function buildFullTestName(test) {
    if (!test) {
        return '';
    }
    
    // Collect all parent titles
    const titles = [];
    let current = test;
    
    // Add the test's own title
    if (current.title) {
        titles.unshift(current.title);
    }
    
    // Add parent suite titles
    while (current.parent) {
        current = current.parent;
        if (current.title) {
            titles.unshift(current.title);
        }
    }
    
    // Filter out empty titles and join
    return titles.filter(Boolean).join(' - ');
}

/**
 * Extends WebdriverIO configuration with hooks to track test information
 * @param {Object} config WebdriverIO configuration object
 * @returns {Object} Enhanced WebdriverIO configuration
 */
function enhanceConfigWithUrlTracking(config) {
    // Create storage for current test information
    if (typeof global !== 'undefined') {
        global.currentTestInfo = {
            file: '',
            name: '',
            suite: ''
        };
        
        // Create global Mocha context
        global.mochaContext = {
            currentTest: null,
            currentSuite: null
        };
    }

    // Create or extend existing hooks
    const hooks = {
        beforeTest: async function(test, context) {
            console.log('URL Tracker - beforeTest hook - Test starting:', test?.title);
            
            // Store test information globally
            if (test) {
                // Build full test name
                const fullTestName = buildFullTestName(test);
                
                if (typeof global !== 'undefined') {
                    global.currentTestInfo = {
                        file: test.file || '',
                        name: fullTestName || test.title || '',
                        suite: test.parent ? test.parent.title || '' : ''
                    };
                }
                
                console.log('URL Tracker - Test info captured:', {
                    file: test.file || 'unknown.js',
                    name: fullTestName || test.title || 'Unknown Test',
                    suite: test.parent ? test.parent.title || '' : ''
                });
                
                // Store in Mocha context as well
                if (typeof global !== 'undefined') {
                    global.mochaContext.currentTest = {
                        title: fullTestName || test.title || '',
                        file: test.file || '',
                        fullPath: test.file || ''
                    };
                }
                
                // If browser instance is available, set the test context
                if (context && context.browser && context.browser.setTestContext) {
                    await context.browser.setTestContext(
                        test.file || 'unknown.js',
                        fullTestName || test.title || 'Unknown Test'
                    );
                }
            }
            
            // Call original hook if it exists
            if (config.hooks && typeof config.hooks.beforeTest === 'function') {
                await config.hooks.beforeTest(test, context);
            }
        },
        
        beforeSuite: async function(suite, context) {
            console.log('URL Tracker - beforeSuite hook - Suite starting:', suite?.title);
            
            // Store suite information globally
            if (suite) {
                if (typeof global !== 'undefined') {
                    global.currentTestInfo.suite = suite.title || '';
                    
                    // Store in Mocha context
                    global.mochaContext.currentSuite = {
                        title: suite.title || '',
                        file: suite.file || ''
                    };
                }
                
                if (suite.file) {
                    if (typeof global !== 'undefined') {
                        global.currentTestInfo.file = suite.file;
                    }
                    
                    // If browser instance is available, set the spec file
                    if (context && context.browser && context.browser.getUrlTracker) {
                        const urlTracker = context.browser.getUrlTracker();
                        if (urlTracker && typeof urlTracker.setSpecFile === 'function') {
                            urlTracker.setSpecFile(suite.file);
                        }
                    }
                    
                    console.log('URL Tracker - Suite info captured:', {
                        file: suite.file,
                        title: suite.title || 'Unknown Suite'
                    });
                }
            }
            
            // Call original hook if it exists
            if (config.hooks && typeof config.hooks.beforeSuite === 'function') {
                await config.hooks.beforeSuite(suite, context);
            }
        },
        
        // After command hook - runs after each browser command
        afterCommand: async function(commandName, args, result, error, context) {
            // Check for navigation commands and refresh URL tracking
            if (!error && (commandName === 'url' || commandName === 'navigateTo' || 
                commandName === 'click' || commandName === 'refresh' || 
                commandName === 'back' || commandName === 'forward')) {
                
                console.log(`URL Tracker - afterCommand hook - Navigation command ${commandName} completed`);
                
                // Give time for the navigation to complete
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // Force URL check after navigation commands
                if (context && context.browser) {
                    try {
                        // Get current URL to trigger detection
                        const currentUrl = await context.browser.getUrl();
                        console.log(`URL Tracker - URL after ${commandName} command:`, currentUrl);
                        
                        // Execute script to force URL change detection
                        await context.browser.execute(() => {
                            // Dispatch a custom event to notify URL tracking
                            if (window.dispatchEvent) {
                                const event = new CustomEvent('wdio:urlChange', {
                                    detail: { type: 'navigation', url: window.location.href }
                                });
                                window.dispatchEvent(event);
                                console.log('URL Tracker - Dispatched urlChange event after navigation command');
                                
                                // Also update the wdioUrlChange property
                                window.wdioUrlChange = { 
                                    type: 'navigation', 
                                    url: window.location.href 
                                };
                            }
                            
                            // For GitHub-specific tracking
                            if (window.location.hostname.includes('github.com')) {
                                console.log('URL Tracker - GitHub site detected, adding specialized monitoring');
                                
                                // Force check on all link clicks
                                document.querySelectorAll('a').forEach(link => {
                                    if (!link.getAttribute('data-wdio-tracked')) {
                                        link.addEventListener('click', () => {
                                            console.log('URL Tracker - GitHub link clicked:', link.href);
                                            
                                            setTimeout(() => {
                                                window.wdioUrlChange = { 
                                                    type: 'navigation', 
                                                    url: window.location.href 
                                                };
                                            }, 100);
                                        });
                                        link.setAttribute('data-wdio-tracked', 'true');
                                    }
                                });
                            }
                        }).catch(e => console.error('Error dispatching URL change event:', e));
                    } catch (err) {
                        console.error('Error in afterCommand hook:', err);
                    }
                }
            }
            
            // Call original hook if it exists
            if (config.hooks && typeof config.hooks.afterCommand === 'function') {
                await config.hooks.afterCommand(commandName, args, result, error, context);
            }
        },
        
        // Add before hook to ensure reset state
        before: async function(capabilities, specs, browser) {
            console.log('URL Tracker - before hook - Test session starting');
            
            // Ensure global test info is initialized
            if (typeof global !== 'undefined') {
                global.currentTestInfo = {
                    file: specs && specs.length > 0 ? specs[0] : '',
                    name: '',
                    suite: ''
                };
            }
            
            // Call original hook if it exists
            if (config.hooks && typeof config.hooks.before === 'function') {
                await config.hooks.before(capabilities, specs, browser);
            }
        },
        
        // Add after hook to ensure cleanup
        after: async function(result, capabilities, specs, browser) {
            console.log('URL Tracker - after hook - Test session ending');
            
            // Save any pending URL tracking data
            if (browser && browser.getUrlTracker) {
                try {
                    const urlTracker = browser.getUrlTracker();
                    if (urlTracker) {
                        // Save final report
                        await urlTracker.onBeforeExit();
                    }
                } catch (error) {
                    console.error('Error saving URL tracking data in after hook:', error);
                }
            }
            
            // Call original hook if it exists
            if (config.hooks && typeof config.hooks.after === 'function') {
                await config.hooks.after(result, capabilities, specs, browser);
            }
        }
    };

    // Merge hooks with existing config
    if (!config.hooks) {
        config.hooks = {};
    }

    // Only override hooks that don't exist or merge with existing hooks
    for (const [hookName, hookFn] of Object.entries(hooks)) {
        if (!config.hooks[hookName]) {
            config.hooks[hookName] = hookFn;
        } else {
            // Save the original hook
            const originalHook = config.hooks[hookName];
            
            // Replace with a wrapper function that calls both
            config.hooks[hookName] = async function(...args) {
                // Call our hook first
                await hookFn.apply(this, args);
                
                // Then call the original
                return originalHook.apply(this, args);
            };
        }
    }

    return config;
}

module.exports = { enhanceConfigWithUrlTracking }; 
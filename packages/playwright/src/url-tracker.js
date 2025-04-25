const { EventEmitter } = require('events');

class UrlTrackerPlugin extends EventEmitter {
    constructor(page, options = {}) {
        super();
        this.page = page;
        this.options = {
            enabled: options.enabled ?? true,
            trackHashChanges: options.trackHashChanges ?? true
        };
        this.navigationHistory = [];
        this.isInitialized = false;
        this.lastEventTime = 0;
        this.DEBOUNCE_TIME = 100; // ms
    }

    async setup(page) {
        if (!this.options.enabled || this.isInitialized) {
            return;
        }

        // Track initial URL
        const currentUrl = page.url();
        this.navigationHistory.push({
            url: currentUrl,
            type: 'navigation'
        });

        // Listen for URL changes and print them to console
        page.on('urlchange', async (event) => {
            const now = Date.now();
            if (now - this.lastEventTime < this.DEBOUNCE_TIME) {
                return;
            }
            this.lastEventTime = now;

            this.navigationHistory.push({
                url: event.newUrl,
                type: 'navigation'
            });

            this.emit('urlChange', event);
            console.log(`[URL Tracker] Navigation: ${event.oldUrl} -> ${event.newUrl}`);
        });

        // Listen for hash changes if enabled
        if (this.options.trackHashChanges) {
            page.on('hashchange', async (event) => {
                const now = Date.now();
                if (now - this.lastEventTime < this.DEBOUNCE_TIME) {
                    return;
                }
                this.lastEventTime = now;

                this.navigationHistory.push({
                    url: event.newURL,
                    type: 'hashchange'
                });

                this.emit('hashChange', event);
                console.log(`[URL Tracker] Hash Change: ${event.oldURL} -> ${event.newURL}`);
            });
        }

        // Store the tracker in the page context for cleanup
        page._urlTracker = this;
        this.isInitialized = true;
    }

    async teardown(page) {
        if (page._urlTracker) {
            page.removeAllListeners('urlchange');
            page.removeAllListeners('hashchange');
            this.clearHistory();
            delete page._urlTracker;
            this.isInitialized = false;
        }
    }

    async afterEach(page) {
        if (page._urlTracker) {
            console.log('\n[URL Tracker] Navigation History:');
            this.navigationHistory.forEach((entry, index) => {
                console.log(`[${index + 1}] ${entry.type}: ${entry.url}`);
            });
        }
    }

    clearHistory() {
        this.navigationHistory = [];
    }

    getNavigationHistory() {
        return [...this.navigationHistory];
    }

    getCurrentUrl() {
        return this.navigationHistory[this.navigationHistory.length - 1]?.url || '';
    }

    isEnabled() {
        return this.options.enabled;
    }
}

module.exports = UrlTrackerPlugin; 
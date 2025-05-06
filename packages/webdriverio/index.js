const { smartuiSnapshot } = require('./src/smartui');
const UrlTracker = require('./src/url-tracker');
const UrlTrackerService = require('./src/url-tracker-service');
const { enhanceConfigWithUrlTracking } = require('./src/hooks');

module.exports = {
    smartuiSnapshot,
    UrlTracker,
    UrlTrackerService,
    enhanceConfigWithUrlTracking
}

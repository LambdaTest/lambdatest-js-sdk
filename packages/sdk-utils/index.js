const { isSmartUIRunning, fetchDOMSerializer, postSnapshot } = require('./src/smartui');
const logger = require('./src/lib/logger'); 

module.exports = {
    logger,
    fetchDOMSerializer,
    postSnapshot,
    isSmartUIRunning
}

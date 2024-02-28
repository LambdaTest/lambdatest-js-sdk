const client = require('./httpClient');
const logger = require('./logger');

const log = logger(require('../../package.json').name);

async function isSmartUIRunning() {
    try {
        await client.isSmartUIRunning();
        return true;
    } catch (error) {
        log.debug(error);
        return false;
    }
}

async function fetchDOMSerializer() {
    try {
        return await client.fetchDOMSerializer();
    } catch (error) {
        log.debug(error);
        throw new Error(`fetch DOMSerializer failed; ${error.message}`);
    }
}

module.exports = {
    isSmartUIRunning,
    fetchDOMSerializer
}

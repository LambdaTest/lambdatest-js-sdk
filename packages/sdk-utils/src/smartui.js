const client = require('./lib/httpClient');
const logger = require('./lib/logger');
const utils = require('./lib/utils');
const log = logger(require('../package.json').name);

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

async function postSnapshot(snapshot, testType) {
    const data = JSON.stringify({
        snapshot,
        testType
    });
      
    try {
        return await client.postSnapshot(data);
    } catch (error) {
        log.debug(error);
        throw new Error(`post snapshot failed; ${error.message}`);
    }
}

async function getSnapshotStatus(contextId,snapshotName,pollTimeout=600) {
    try {
        return await client.getSnapshotStatus(contextId,snapshotName,pollTimeout);
    } catch (error) {
        log.debug(error);
        throw new Error(`get snapshot status failed; ${error.message}`);
    }
}

module.exports = {
    isSmartUIRunning,
    fetchDOMSerializer,
    postSnapshot,
    getSnapshotStatus
}
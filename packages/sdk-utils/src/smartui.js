import client from './lib/httpClient.js'
import logger from './lib/logger.js'
import utils from './lib/utils.js'
const log = logger(utils.getPackageName())

export async function isSmartUIRunning() {
    try {
        await client.isSmartUIRunning();
        return true;
    } catch (error) {
        log.debug(error);
        return false;
    }
}

export async function fetchDOMSerializer() {
    try {
        return await client.fetchDOMSerializer();
    } catch (error) {
        log.debug(error);
        throw new Error(`fetch DOMSerializer failed`);
    }
}

export async function postSnapshot(snapshotDOM, snapshotName, testType) {
    const data = JSON.stringify({
        snapshot: {
            dom: snapshotDOM,
            name: snapshotName
        },
        testType
    });
      
    try {
        return await client.postSnapshot(data);
    } catch (error) {
        log.debug(error);
        throw new Error(`post snapshot failed`);
    }
}

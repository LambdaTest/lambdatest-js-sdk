const utils = require('@lambdatest/sdk-utils');
const pkgName = require('../package.json').name;
const testType = 'js-selenium-driver';
const crypto = require('crypto');

async function smartuiSnapshot(driver, name, options = {}) {
    if (!driver) throw new Error('An instance of the selenium driver object is required.');
    if (!name || typeof name !== 'string') throw new Error('The `name` argument is required.');
    if (!(await utils.isSmartUIRunning())) throw new Error('Cannot find SmartUI server.');

    // Append sessionId to options
    try {
        const sessionId = await driver.getSession().then(session => session.getId());
        options.sessionId = sessionId;
    } catch (error) {
        console.log("Unable to append sessionId in snapshot options")
    }

    let log = utils.logger(pkgName);
    try {
        let resp = await utils.fetchDOMSerializer();
        await driver.executeScript(resp.body.data.dom);

        let { dom, url } = await driver.executeScript(options => ({
            dom: SmartUIDOM.serialize(options),
            url: document.URL
        }), {});
        
        if(options?.sync){
            options.contextId = crypto.randomUUID();
            let { body } = await utils.postSnapshot({url, name, dom, options}, pkgName);
            if (body && body.data && body.data.warnings?.length !== 0) body.data.warnings.map(e => log.warn(e));
            log.info(`Snapshot captured: ${name}`);
            let timeout = options?.timeout || 600;
            if(timeout<30||timeout>900){
                log.info(`Timeout value must be between 30 and 900 seconds. Using default value of 600 seconds.`);
                timeout = 600;
            }
            let snapshotStatus = await utils.getSnapshotStatus(options.contextId,name,timeout);
            return snapshotStatus.body;
        }
        else{
            let { body } = await utils.postSnapshot({url, name, dom, options}, pkgName);
            if (body && body.data && body.data.warnings?.length !== 0) body.data.warnings.map(e => log.warn(e));
            log.info(`Snapshot captured: ${name}`);
        }
    } catch (error) {
        log.error(`SmartUI snapshot failed "${name}"`);
        log.error(error);
    }
}

module.exports = {
    smartuiSnapshot
}

const utils = require('@lambdatest/sdk-utils');
const pkgName = require('../package.json').name;

async function smartuiSnapshot(driver, name, options = {}) {
    // TODO: check if driver is selenium webdriver object
    if (!driver) throw new Error('An instance of the selenium driver object is required.');
    if (!name) throw new Error('The `name` argument is required.');
    if (!(await utils.isSmartUIRunning())) throw new Error('SmartUI server is not running.');
    let log = utils.logger(pkgName);

    try {
        let resp = await utils.fetchDOMSerializer();
        await driver.executeScript(resp.body.data.dom);

        let { dom, url } = await driver.executeScript(options => ({
            dom: SmartUIDOM.serialize(options),
            url: document.URL
        }), {});

        let { body } = await utils.postSnapshot({url, name, dom, options}, pkgName);
        log.info(`Snapshot captured: ${name}`);
        if (body && body.data && body.data.warnings?.length !== 0) body.data.warnings.map(e => log.warn(e));
    } catch (error) {
        throw new Error(error);
    }
}

module.exports = {
    smartuiSnapshot
}

const utils = require('@lambdatest/sdk-utils');
const pkgName = require('../package.json').name;
const testType = 'wdio-driver';

async function smartuiSnapshot(browser, name, options = {}) {
    if (!browser) throw new Error('The WebdriverIO `browser` object is required.');
    if (!name || typeof name !== 'string') throw new Error('The `name` argument is required.');
    if (!(await utils.isSmartUIRunning())) throw new Error('Cannot find SmartUI server.');
    let log = utils.logger(pkgName);

    try {
        let resp = await utils.fetchDOMSerializer();
        await browser.execute(resp.body.data.dom);

        let { dom, url } = await browser.execute(options => ({
            dom: SmartUIDOM.serialize(options),
            url: document.URL
        }), {});

        let { body } = await utils.postSnapshot({ url, name, dom, options }, testType);
        if (body && body.data && body.data.warnings?.length !== 0) body.data.warnings.map(e => log.warn(e));

        log.info(`Snapshot captured: ${name}`);
    } catch (error) {
        log.error(`SmartUI snapshot failed "${name}"`);
        log.error(error);
    }
}

module.exports = {
    smartuiSnapshot
}

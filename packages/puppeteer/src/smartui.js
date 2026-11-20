const utils = require('@lambdatest/sdk-utils');
const pkgName = require('../package.json').name;
const testType = 'js-puppeteer-driver';

// on LambdaTest the hub answers this action with the test details; elsewhere it evaluates to undefined
async function getTestSessionId(page) {
    try {
        const details = await page.evaluate(_ => {}, `lambdatest_action: ${JSON.stringify({ action: 'getTestDetails' })}`);
        return details ? JSON.parse(details)?.data?.session_id || '' : '';
    } catch (error) {
        return '';
    }
}

async function smartuiSnapshot(page, name, options = {}) {
    if (!page) throw new Error('puppeteer `page` argument is required.');
    if (!name || typeof name !== 'string') throw new Error('The `name` argument is required.');
    if (!(await utils.isSmartUIRunning())) throw new Error('Cannot find SmartUI server.');

    let log = utils.logger(pkgName);
    try {
        let resp = await utils.fetchDOMSerializer();
        await page.evaluate(resp.body.data.dom);

        let { dom, url } = await page.evaluate(options => ({
            dom: SmartUIDOM.serialize(options),
            url: document.URL
        }), {});

        if (!options.sessionId) {
            const sessionId = await getTestSessionId(page);
            if (sessionId) options = { ...options, sessionId };
        }

        let { body } = await utils.postSnapshot({ dom, url, name, options }, testType);
        if (body && body.data && body.data.warnings?.length !== 0) body.data.warnings.map(e => log.warn(e));

        log.info(`Snapshot captured: ${name}`);
    } catch (error) {
        log.error(`SmartUI snapshot failed "${name}"`);
        log.error(error);
    }
}

module.exports = {
    smartuiSnapshot
};

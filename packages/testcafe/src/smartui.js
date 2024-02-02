const utils = require('@lambdatest/sdk-utils');
const pkgName = require('../package.json').name;
const testType = 'testcafe-driver';

async function smartuiSnapshot(t, name, options = {}) {
    if (!t) throw new Error("The test function's `t` argument is required.");
    if (!name || typeof name !== 'string') throw new Error('The `name` argument is required.');
    if (!(await utils.isSmartUIRunning())) throw new Error('Cannot find SmartUI server.');
  
    let log = utils.logger(pkgName);
    try {
        const resp = await utils.fetchDOMSerializer();
        await t.eval(new Function(resp.body.data.dom), { boundTestRun: t });

        let { dom, url } = await t.eval((options) => ({
            dom: SmartUIDOM.serialize(options),
            url: window.location.href || document.URL,
        }), { boundTestRun: t, dependencies: {} });

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
}

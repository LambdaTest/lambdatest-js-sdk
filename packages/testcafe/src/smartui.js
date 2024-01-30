const utils = require('@lambdatest/sdk-utils');
const pkgName = require('../package.json').name;

async function smartuiSnapshot(t, snapshotName, options) {
    if (!t) throw new Error("The test function's `t` argument is required.");
    if (!snapshotName) throw new Error('The `name` argument is required.');
    if (!(await utils.isSmartUIRunning())) throw new Error('SmartUI server is not running.');
  
    let log = utils.logger(pkgName);

    try {
        // Inject the DOM serialization script
        /* eslint-disable-next-line no-new-func */
        const resp = await utils.fetchDOMSerializer();

        await t.eval(new Function(resp.body.data.dom), { boundTestRun: t });

        // Serialize and capture the DOM
        /* istanbul ignore next: no instrumenting injected code */
        let { dom, url } = await t.eval((options) => ({
            /* eslint-disable-next-line no-undef */
            dom: SmartUIDOM.serialize(options),
            url: window.location.href || document.URL,
        }), { boundTestRun: t, dependencies: {} });

        let { body } = await utils.postSnapshot({
            dom: dom,
            url,
            name: snapshotName,
            options
        }, pkgName);

        log.info(`Snapshot captured: ${snapshotName}`);

        if (body && body.data && body.data.warnings?.length !== 0) body.data.warnings.map(e => log.warn(e));
    } catch (error) {
        // Handle errors
        throw error;
    }
}

module.exports = {
    smartuiSnapshot
}
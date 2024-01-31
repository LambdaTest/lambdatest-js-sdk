const utils = require('@lambdatest/sdk-utils');
const pkgName = require('../package.json').name;


async function smartuiSnapshot(page, name, options = {}) {
    if (!page) throw new Error('puppeteer `page` argument is required.');
    if (!name || typeof name !== 'string') throw new Error('The `name` argument is required.');
    if (!(await utils.isSmartUIRunning())) throw new Error('Cannot find SmartUI server.');

    let log = utils.logger(pkgName);

    try {
        // Fetch the DOM serializer from the SmartUI server.
        let resp = await utils.fetchDOMSerializer();
        
        // Inject the DOM serializer into the page.
        await page.evaluate(resp.body.data.dom);

        // Serialize the DOM
        let { dom, url } = await page.evaluate(options => ({
            dom: SmartUIDOM.serialize(options),
            url: document.URL
        }), {});


        // Post it to the SmartUI server.
        let { body } = await utils.postSnapshot({
            dom,
            url,
            name,
            options
        }, pkgName);

        log.info(`Snapshot captured: ${name}`);
        
        if (body && body.data && body.data.warnings?.length !== 0) body.data.warnings.map(e => log.warn(e));
    } catch (error) {
        throw new Error(error);
    }
}

module.exports = {
    smartuiSnapshot
};
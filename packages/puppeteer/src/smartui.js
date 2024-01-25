const utils = require('@lambdatest/sdk-utils');
const pkgName = require('../package.json').name;


async function smartuiSnapshot(page, name, options = {}) {
    if (!page) throw new Error('puppeteer `page` argument is required.');
    if (!name) throw new Error('The `name` argument is required.');
    if (!(await utils.isSmartUIRunning())) throw new Error('SmartUI server is not running.');

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
        await utils.postSnapshot({
            dom: dom.html,
            url,
            name,
            options
        }, pkgName);

        log.info(`Snapshot captured: ${name}`);
    } catch (error) {
        throw new Error(error);
    }
}

module.exports = {
    smartuiSnapshot
};
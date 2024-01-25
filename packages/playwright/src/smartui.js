const utils = require('@lambdatest/sdk-utils');
const pkgName = require('../package.json').name;

// Take a DOM snapshot and post it to the snapshot endpoint
async function smartuiSnapshot(page, snapshotName, options) {
  if (!page) throw new Error('A Playwright `page` object is required.');
  if (!snapshotName) throw new Error('The `name` argument is required.');
  if (!(await utils.isSmartUIRunning())) throw new Error('SmartUI server is not running.');

  let log = utils.logger(pkgName);

  try {
    // Inject the DOM serialization script
    const resp = await utils.fetchDOMSerializer();
    await page.evaluate(resp.body.data.dom);
    
    // Serialize and capture the DOM
    /* istanbul ignore next: no instrumenting injected code */
    let { dom } = await page.evaluate((options) => ({
      /* eslint-disable-next-line no-undef */
      dom: SmartUIDOM.serialize(options)
    }), {});

    // Post the DOM to the snapshot endpoint with snapshot options and other info
    await utils.postSnapshot({
      dom: dom.html,
      url: page.url(),
      name: snapshotName,
      options
    }, pkgName);

    log.info(`Snapshot captured: ${snapshotName}`);
  } catch (err) {
    throw err;
  }
}

module.exports = {
  smartuiSnapshot
}
const utils = require('@lambdatest/sdk-utils');
const pkgName = require('../package.json').name;

// Take a DOM snapshot and post it to the snapshot endpoint
async function smartuiSnapshot(page, name, options) {
  if (!page) throw new Error('A Playwright `page` object is required.');
  if (!name || typeof name !== 'string') throw new Error('The `name` argument is required.');
  if (!(await utils.isSmartUIRunning())) throw new Error('Cannot find SmartUI server.');

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
    let { body } = await utils.postSnapshot({
      dom,
      url: page.url(),
      name,
      options
    }, pkgName);

    log.info(`Snapshot captured: ${name}`);

    if (body && body.data && body.data.warnings?.length !== 0) body.data.warnings.map(e => log.warn(e));
  } catch (err) {
    throw err;
  }
}

module.exports = {
  smartuiSnapshot
}
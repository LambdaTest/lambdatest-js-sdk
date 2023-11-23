import utils from '@lambdatest/sdk-utils'
import { getPackageName } from './utils.js';
const pkgName = getPackageName()

export async function smartuiSnapshot(driver, snapshotName) {
    // TODO: check if driver is selenium webdriver object
    if (!driver) throw new Error('An instance of the selenium driver object is required.');
    if (!snapshotName) throw new Error('The `snapshotName` argument is required.');
    if (!(await utils.isSmartUIRunning())) throw new Error('SmartUI server is not running.');
    let log = utils.logger(pkgName);

    try {
        let resp = await utils.fetchDOMSerializer();
        await driver.executeScript(resp.body.data.dom);

        let { dom } = await driver.executeScript(options => ({
            dom: SmartUIDOM.serialize(options)
        }), {});

        await utils.postSnapshot(dom.html, snapshotName, pkgName);
        log.info(`Snapshot captured: ${snapshotName}`);
    } catch (error) {
        throw new Error(error);
    }
}

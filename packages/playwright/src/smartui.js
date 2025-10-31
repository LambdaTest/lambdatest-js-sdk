const utils = require('@lambdatest/sdk-utils');
const pkgName = require('../package.json').name;
const testType = 'js-playwright-driver';

async function smartuiSnapshot(page, name, options = {}) {
	if (!page) throw new Error('A Playwright `page` object is required.');
	if (!name || typeof name !== 'string') throw new Error('The `name` argument is required.');
	if (!(await utils.isSmartUIRunning())) throw new Error('Cannot find SmartUI server.');

	let log = utils.logger(pkgName);
	try {
		if (process.env.UPLOAD_SDK_SCREENSHOT) {
			try {
				const screenshotBuffer = await page.screenshot({ fullPage: true });
				const screenshotBlob = new Blob([screenshotBuffer], { type: 'image/png' });
				const form = new FormData();
				form.append('screenshotName', name);
				form.append('uploadToS3Only', true);
				form.append('buildId', process.env.SMARTUI_BUILD_ID || '');
				form.append('screenshot', screenshotBlob, {
					filename: `${name.replace(/[^a-z0-9]/gi, '_')}.png`,
					contentType: 'image/png',
				});
				const uploadUrl = 'https://api.lambdatest.com/visualui/1.0/screenshot';
				let response;
				try {
					response = await fetch(uploadUrl, {
						method: 'POST',
						headers: {
							projectToken: process.env.PROJECT_TOKEN || '',
						},
						body: form,
					});
				} catch (uploadError) {
					
				}
			} catch (screenshotError) {

			}
		}
		const resp = await utils.fetchDOMSerializer();
		await page.evaluate(resp.body.data.dom);

		let { dom } = await page.evaluate((options) => ({
			dom: SmartUIDOM.serialize(options)
		}), {});

		let { body } = await utils.postSnapshot({
			dom,
			url: page.url(),
			name,
			options
		}, testType);
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

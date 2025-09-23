const { cylog, log } = require('./utils/logger');
const client = require('./utils/httpClient');
const testType = 'cypress-driver';
const CY_TIMEOUT = 30 * 1000 * 1.5;

function smartuiSnapshot(name, options = {}) {
	// Default name to test title
    name = name || cy.state('runnable').fullTitle();

    return cy.then({ timeout: CY_TIMEOUT }, async () => {
        if (Cypress.config('isInteractive') && !Cypress.config('enableSmartUIInteractiveMode')) {
            // return cylog('smartuiSnapshot', 'Disabled in interactive mode', {
            //     details: 'use "cypress run" instead of "cypress open"',
            //     snapshot: name,
            // });
            cy.task('log', log('info', 'SmartUI snapshot skipped in interactive mode; use "cypress run" instead of "cypress open"'));
            return;
        }
    
        let resp = await client.isSmartUIRunning()
        if (!resp.body.cliVersion) throw new Error(`cannot find SmartUI server; ${JSON.stringify(resp)}`);

        resp = await client.fetchDOMSerializer();
        eval(resp.body.data.dom);
    
        return cy.document({ log: false }).then({ timeout: CY_TIMEOUT }, dom => {
            let domSnapshot = window.SmartUIDOM.serialize({ ...options, dom });

            return client.postSnapshot({
                dom: domSnapshot,
                url: dom.URL,
                name,
                options
            }, testType).then(resp => {
                if (resp.status >= 200 && resp.status < 300) {
                    if (resp.body.data.warnings.length) {
                        resp.body.data.warnings.map(e => cy.task('log', log('warn', e)));
                    }
                    // cylog('smartuiSnapshot', `Snapshot captured: ${name}`);
                    cy.task('log', log('info', `Snapshot captured: ${name}`));
                } else {
                    throw new Error(resp.body.error.message);
                }
            }).catch(error => {
                cy.task('log', log('error', `SmartUI snapshot failed "${name}"`));
                cy.task('log', log('error', error.message));
            });
        });
    });
}

module.exports = {
	smartuiSnapshot
}

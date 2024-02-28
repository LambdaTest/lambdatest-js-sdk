const cypressUtils = require('./lib/utils')
const { getSmartUIServerAddress } = require('./lib/helpers');
const testType = 'js-cypress-driver';

Cypress.Commands.add('smartuiSnapshot', smartuiSnapshot);

function smartuiSnapshot(name, options = {}) {
    return cy.then(async () => {
        Cypress.log({
            name: 'SMARTUI_SERVER_ADDRESS: ' + Cypress.env('SMARTUI_SERVER_ADDRESS'),
        })
        if (!name || typeof name !== 'string') throw new Error('The `name` argument is required.');
        if (!(await cypressUtils.isSmartUIRunning())) throw new Error('Cannot find SmartUI server.');
    
        Cypress.log({
            name: 'SmartUI Snapshot',
            message: name
        });
    
        try {
            const resp = await cypressUtils.fetchDOMSerializer();
            const smartUIAddress = getSmartUIServerAddress();

            eval(resp.body.data.dom)

            return cy.document().then(dom => {
                let domSnapshot = window.SmartUIDOM.serialize({...options, dom});
                let url = dom.URL;
                let snapshotObj = { dom:domSnapshot, url, name, options }
                const data = JSON.stringify({
                    snapshot:snapshotObj,
                    testType
                });

                return Cypress.backend('http:request', {
                    url: `${smartUIAddress}/snapshot`,
                    method: 'POST',
                    body: data,
                    headers: {
                        'Content-Type': 'application/json',
                    }
                }).then(snapshot => {
                    Cypress.log({
                        name: 'postSnapshot body',
                        message: snapshot.body.data
                    })
                    Cypress.log({
                        name: 'Snapshot captured: ',
                        message: name
                    })
                    if (snapshot?.body?.data?.warnings?.length !== 0) body.data.warnings.map(e => Cypress.log({
                        name: 'Warning: ',
                        message: e
                    }));
                })
            })
        } catch (error) {
            Cypress.log({
                name: 'SmartUI Snapshot Failed',
                message: name,
                consoleProps: () => ({
                    'Error Message': error.message,
                    'Error Stack': error.stack
                })
            });
            throw new Error(`SmartUI Snapshot Failed: ${error.message}`);
        }
    });
}

module.exports = {
    smartuiSnapshot
};

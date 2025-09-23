const utils = require('./utils');

module.exports = new class httpClient {
    async request(options) {
        return Cypress.backend('http:request', {
            retryOnNetworkFailure: false, ...options
        });
    }

    isSmartUIRunning() {
        return this.request({
            url: `${utils.getSmartUIServerAddress()}/healthcheck`,
            method: 'GET',
        })
    }

    fetchDOMSerializer() {
        return this.request({
            url: `${utils.getSmartUIServerAddress()}/domserializer`,
            method: 'GET'
        })
    }

    postSnapshot(snapshot, testType) {
        return this.request({
            url: `${utils.getSmartUIServerAddress()}/snapshot`,
            method: 'POST',
            body: JSON.stringify({
                snapshot,
                testType
            }),
            headers: {
                'Content-Type': 'application/json',
            }
        })
    }
};

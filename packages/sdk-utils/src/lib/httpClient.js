const axios = require('axios'); 
const utils = require('./utils');

module.exports = new class httpClient {
    async request(config) {
        return axios.request(config)
            .then(resp => {
                return {
                    status: resp.status,
                    statusMessage: resp.statusMessage,
                    headers: resp.headers,
                    body: resp.data
                };
            })
            .catch(error => {
                if (error.response) {
                    throw new Error(error.response.data.error.message);
                }
                if (error.request) {
                    throw new Error(error.toJSON().message);
                }
                throw error;
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

    postSnapshot(data) {
        return this.request({
            url: `${utils.getSmartUIServerAddress()}/snapshot`,
            method: 'POST',
            data: data,
            headers: {
                'Content-Type': 'application/json',
            }
        })
    }

    getSnapshotStatus(contextId, snapshotName, pollTimeout) {
        return this.request({
            url: `${utils.getSmartUIServerAddress()}/snapshot/status`,
            method: 'GET',
            params: {
                contextId: contextId,
                snapshotName: snapshotName,
                pollTimeout: pollTimeout
            }
        });
    }
    
};

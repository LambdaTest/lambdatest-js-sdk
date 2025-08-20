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
                if (error.code === 'ECONNABORTED') {
                    // Custom response for timeout on /snapshot/status
                    if (config.url.includes('/snapshot/status')) {
                        return {
                            status: 408, 
                            statusMessage: 'Request Timeout',
                            body: `Request timed out after ${config.timeout / 1000} seconds-> Snapshot still processing`
                        };
                    }
                    return {
                        status: 408, 
                        statusMessage: 'Request Timeout',
                        body: `Request timed out after ${config.timeout / 1000} seconds`
                    };
                }
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

    getSnapshotStatus(contextId, timeout = 600) {
        return this.request({
            url: `${utils.getSmartUIServerAddress()}/snapshot/status`,
            method: 'GET',
            params: {
                contextId: contextId
            },
            timeout: timeout * 1000 // Convert timeout from seconds to milliseconds
        });
    }
    
};

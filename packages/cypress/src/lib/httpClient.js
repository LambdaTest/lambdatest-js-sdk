const axios = require('axios');
const { getSmartUIServerAddress } = require('./helpers');

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
            url: `${getSmartUIServerAddress()}/healthcheck`,
            method: 'GET',
        })
    }

    fetchDOMSerializer() {
        return this.request({
            url: `${getSmartUIServerAddress()}/domserializer`,
            method: 'GET'
        })
    }
};

function getSmartUIServerAddress() {
    if (!Cypress.env('SMARTUI_SERVER_ADDRESS')) return 'http://localhost:49152';
    return Cypress.env('SMARTUI_SERVER_ADDRESS');
}

module.exports = {
    getSmartUIServerAddress
};

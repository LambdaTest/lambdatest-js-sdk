function getSmartUIServerAddress() {
    if (!Cypress.env('SMARTUI_SERVER_ADDRESS')) throw new Error('SmartUI server address not found');
    return Cypress.env('SMARTUI_SERVER_ADDRESS');
}

module.exports = {
    getSmartUIServerAddress
};

function getSmartUIServerAddress() {
    if (!process.env.SMARTUI_SERVER_ADDRESS) {
        return 'http://localhost:49152';
    }
    return process.env.SMARTUI_SERVER_ADDRESS;
}

module.exports = {
    getSmartUIServerAddress
};

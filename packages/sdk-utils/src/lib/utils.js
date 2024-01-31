function getSmartUIServerAddress() {
    if (!process.env.SMARTUI_SERVER_ADDRESS) throw new Error('SmartUI server address not found');
    return process.env.SMARTUI_SERVER_ADDRESS
}

module.exports = {
    getSmartUIServerAddress
};

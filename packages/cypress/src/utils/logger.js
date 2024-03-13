const chalk = require('chalk');
const pkgName = require('../../package.json').name;

function cylog(name, message, meta = {}) {
    return Cypress.log({
      name,
      message,
      displayName: pkgName,
      consoleProps: () => meta
    });
}

function log(level, message) {
    if (typeof message === 'object') {
        message = JSON.stringify(message);
    }
    switch (level) {
        case 'debug':
            message = chalk.blue(message);
            break;
        case 'warn':
            message = chalk.yellow(`Warning: ${message}`);
            break;
        case 'error':
            message = chalk.red(`Error: ${message}`);
            break;
    }
    return `[${pkgName}] ${message}`;
}

module.exports = {
    cylog,
    log
}

const { createLogger, transports, format } = require('winston');
const chalk = require('chalk');

const logLevel = () => {
    let debug = (process.env.LT_SDK_DEBUG === 'true') ? 'debug' : undefined;
    return debug || process.env.LT_SDK_LOG_LEVEL || 'info'
}

module.exports = function logger(logContext) {
  	return createLogger({
    	level: logLevel(),
    	format: format.combine(
      		format.timestamp(),
      		format.printf(({ message, level }) => {
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
				return `[${logContext}] ${message}`;
			})
    	),
    	transports: [new transports.Console()]
  	});
};

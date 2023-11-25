import { createLogger, transports, format, config } from 'winston'
import chalk from 'chalk'

const logLevel = () => {
    let debug = (process.env.LT_SDK_DEBUG === 'true') ? 'debug' : undefined;
    return debug || process.env.LT_SDK_LOG_LEVEL || 'info'
}

export default (logContext) => {
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
						message = chalk.yellow(message);
						break;
					case 'error':
						message = chalk.red(message);
						break;
				}
				return `[${logContext}] ${message}`;
			})
    	),
    	transports: [new transports.Console()]
  	});
};

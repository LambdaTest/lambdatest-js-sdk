import { Logger as WinstonLogger } from 'winston';

declare function logger(logContext: string): WinstonLogger;

export default logger;

import { Browser } from 'webdriverio';
import { Logger } from '@lambdatest/sdk-utils';

export declare function smartuiSnapshot(browser: Browser<'async'>, name: string, options?: object): Promise<void>;

export declare const logger: Logger;

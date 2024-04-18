import { WebDriver } from 'selenium-webdriver';
import { Logger } from '@lambdatest/sdk-utils';

export declare function smartuiSnapshot(driver: WebDriver, name: string, options?: object): Promise<void>;

export declare const logger: Logger;
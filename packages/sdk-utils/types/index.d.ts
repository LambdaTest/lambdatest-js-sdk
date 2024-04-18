import { Logger } from './src/lib/logger';

export declare function isSmartUIRunning(): Promise<boolean>;
export declare function fetchDOMSerializer(): Promise<any>;
export declare function postSnapshot(snapshot: any, testType: string): Promise<any>;

export declare const logger: Logger;

import { Logger } from './lib/logger';
import { HttpClient } from './lib/httpClient';

export declare function isSmartUIRunning(): Promise<boolean>;
export declare function fetchDOMSerializer(): Promise<any>;
export declare function postSnapshot(snapshot: any, testType: string): Promise<any>;

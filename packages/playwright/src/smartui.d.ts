import { Page } from 'playwright';
import { Logger } from '@lambdatest/sdk-utils';

declare module '@lambdatest/sdk-utils' {
    export function isSmartUIRunning(): Promise<boolean>;
    export function fetchDOMSerializer(): Promise<Response>;
    export function postSnapshot(data: any, testType: string): Promise<Response>;
    export function logger(pkgName: string): Logger;
}

export async function smartuiSnapshot(page: Page, name: string, options: object = {}): Promise<void>;

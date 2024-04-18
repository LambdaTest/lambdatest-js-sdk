/// <reference types="cypress" />
/// <reference path="./utils/logger.d.ts" />
/// <reference path="./utils/httpClient.d.ts" />

declare module 'smartui' {
    export function smartuiSnapshot(name?: string, options?: object): Cypress.Chainable<void>;
}
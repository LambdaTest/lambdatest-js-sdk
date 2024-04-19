/// <reference types="cypress" />

declare global {
    namespace Cypress {
        interface Chainable<Subject = any> {
            /**
             * Captures a SmartUI snapshot.
             * @param name The name of the snapshot.
             * @param options Additional options for snapshot capture.
             */
            smartuiSnapshot(name?: string, options?: object): Chainable<Subject>;
        }
    }
}

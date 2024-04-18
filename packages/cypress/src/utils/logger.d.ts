declare module 'logger' {
    import { Log } from 'cypress';

    export function cylog(name: string, message: string, meta?: object): Log;

    export function log(level: 'debug' | 'warn' | 'error', message: string | object): string;
}

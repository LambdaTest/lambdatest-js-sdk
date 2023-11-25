import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

export function getSmartUIServerAddress() {
    return process.env.SMARTUI_SERVER_ADDRESS || 'http://localhost:8080'
}

export function getPackageName() {
    return JSON.parse(fs.readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf-8')).name
}

export * as default from './utils.js';

import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

export function getPackageName() {
    return JSON.parse(fs.readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8')).name
}

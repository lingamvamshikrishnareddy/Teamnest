import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { themeCss } from '../src/tokens';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
writeFileSync(path.join(dir, 'theme.css'), themeCss('web'));
writeFileSync(path.join(dir, 'theme.native.css'), themeCss('native'));
console.log('wrote src/theme.css and src/theme.native.css');

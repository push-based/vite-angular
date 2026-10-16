// ngp-extract-i18n: writes the app's i18n messages to a translation file. See extract.ts.
import {parseArgs} from 'node:util';
import {extractMessages, type ExtractFormat} from './extract.js';

const {values} = parseArgs({
  options: {
    root: {type: 'string'},
    config: {type: 'string', short: 'c'},
    format: {type: 'string', short: 'f'},
    'out-file': {type: 'string', short: 'o'},
    duplicates: {type: 'string'},
    help: {type: 'boolean', short: 'h'},
  },
});

if (values.help) {
  console.log(`Usage: ngp-extract-i18n [options]

Extracts i18n messages from an Angular app built with vite-plugin-ngp.

  --root <dir>          Vite project root (default: current directory)
  -c, --config <file>   Vite config file (default: Vite's lookup in the root)
  -f, --format <fmt>    xlf (default), xlf2, xmb, json or arb
  -o, --out-file <file> Output file (default: src/locale/messages.<ext>)
  --duplicates <how>    Same id, different text: error, warning (default) or ignore`);
  process.exit(0);
}

try {
  const {outFile, messages} = await extractMessages({
    root: values.root,
    configFile: values.config,
    format: values.format as ExtractFormat | undefined,
    outFile: values['out-file'],
    duplicates: values.duplicates as 'error' | 'warning' | 'ignore' | undefined,
  });
  console.log(`Extracted ${messages} messages to ${outFile}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

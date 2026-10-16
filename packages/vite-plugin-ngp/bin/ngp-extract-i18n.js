#!/usr/bin/env node
// A checked-in wrapper, so pnpm can link the bin before the plugin's dist/ has been built.
import '../dist/extract-cli.js';

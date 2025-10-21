#!/usr/bin/env node

// Wrapper script that launches the CLI with increased heap size
// This is necessary for large conversation histories (200+ conversations)

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the actual CLI script
const cliPath = join(__dirname, '..', 'src', 'cli.js');

// Get command-line arguments (everything after 'claude-logs')
const userArgs = process.argv.slice(2);

// Launch with increased heap size (8GB) and forward all user arguments
const child = spawn('node', ['--max-old-space-size=8192', cliPath, ...userArgs], {
  stdio: 'inherit',
  env: process.env
});

// Forward exit code
child.on('exit', (code) => {
  process.exit(code || 0);
});

// Handle errors
child.on('error', (err) => {
  console.error('Failed to start CLI:', err.message);
  process.exit(1);
});

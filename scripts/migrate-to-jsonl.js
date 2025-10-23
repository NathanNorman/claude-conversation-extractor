#!/usr/bin/env node

/**
 * Migration Script: Convert Markdown Archives to JSONL
 *
 * This script converts archived markdown conversations that no longer have
 * JSONL sources back to JSONL format for unified storage.
 */

import { homedir } from 'os';
import { join } from 'path';
import { readdir } from 'fs/promises';
import ora from 'ora';
import chalk from 'chalk';
import { MarkdownToJsonlConverter } from '../src/migration/markdown-to-jsonl.js';

const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.cyan,
  dim: chalk.gray
};

async function main() {
  console.log(colors.primary('\n📦 Markdown → JSONL Migration Tool\n'));
  console.log(colors.dim('━'.repeat(60)));

  const mdDir = join(homedir(), '.claude', 'claude_conversations');
  const projectsDir = join(homedir(), '.claude', 'projects');

  // Find all markdown files
  const spinner = ora('Scanning for markdown files...').start();
  const mdFiles = (await readdir(mdDir))
    .filter(f => f.endsWith('.md'))
    .map(f => join(mdDir, f));

  // Find all active JSONL session IDs
  const jsonlSessions = new Set();
  const projects = await readdir(projectsDir);
  for (const project of projects) {
    try {
      const projectPath = join(projectsDir, project);
      const files = await readdir(projectPath);
      for (const file of files) {
        if (file.endsWith('.jsonl')) {
          jsonlSessions.add(file.replace('.jsonl', ''));
        }
      }
    } catch {
      // Skip if can't read
    }
  }

  // Filter markdown files that need conversion
  const filesToConvert = [];
  for (const mdPath of mdFiles) {
    const filename = mdPath.split('/').pop();
    const sessionMatch = filename.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);

    if (sessionMatch) {
      const sessionId = sessionMatch[1];
      if (!jsonlSessions.has(sessionId)) {
        // This markdown has no JSONL source - needs conversion
        filesToConvert.push(mdPath);
      }
    }
  }

  spinner.succeed(`Found ${mdFiles.length} markdown files`);
  console.log(colors.info(`  ${jsonlSessions.size} have JSONL sources (will copy directly)`));
  console.log(colors.warning(`  ${filesToConvert.length} need conversion (MD→JSONL)`));
  console.log(colors.dim('━'.repeat(60)));

  // Ask for confirmation
  console.log(colors.primary('\nWhat will happen:'));
  console.log(colors.dim('  1. Convert ' + filesToConvert.length + ' markdown files to JSONL'));
  console.log(colors.dim('  2. Preserve session IDs and conversation dates'));
  console.log(colors.dim('  3. Accept data loss: message timestamps, UUIDs, metadata'));
  console.log(colors.dim('  4. Output to same directory as JSONL files\n'));

  // Get user confirmation (skip in --yes mode)
  const shouldProceed = process.argv.includes('--yes') || process.argv.includes('-y');

  if (!shouldProceed) {
    console.log(colors.warning('Run with --yes to proceed with conversion'));
    console.log(colors.dim('\nUsage: node scripts/migrate-to-jsonl.js --yes\n'));
    process.exit(0);
  }

  // Run conversion
  console.log(colors.primary('\n🔄 Starting conversion...\n'));

  const converter = new MarkdownToJsonlConverter({
    logger: {
      info: (msg) => console.log(colors.info(msg)),
      warn: (msg) => console.log(colors.warning(msg)),
      error: (msg) => console.log(colors.error(msg)),
      debug: (msg) => process.env.DEBUG && console.log(colors.dim(msg))
    }
  });

  const conversionSpinner = ora('Converting files...').start();
  let lastUpdate = Date.now();

  const stats = await converter.convertBatch(filesToConvert, mdDir, (progress) => {
    // Update spinner every 100ms
    if (Date.now() - lastUpdate > 100) {
      const pct = Math.round((progress.processed / progress.total) * 100);
      conversionSpinner.text = `Converting: ${pct}% (${progress.converted} done, ${progress.failed} failed)`;
      lastUpdate = Date.now();
    }
  });

  conversionSpinner.stop();

  // Show results
  console.log(colors.success('\n✅ Conversion Complete!\n'));
  console.log(colors.info(`📊 Statistics:`));
  console.log(colors.dim(`   Processed: ${stats.processed}`));
  console.log(colors.success(`   Converted: ${stats.converted}`));
  console.log(colors.dim(`   Skipped: ${stats.skipped}`));

  if (stats.failed > 0) {
    console.log(colors.error(`   Failed: ${stats.failed}`));
    console.log(colors.error(`\n❌ Errors (first 5):`));
    for (const error of stats.errors.slice(0, 5)) {
      console.log(colors.error(`   - ${error.file}: ${error.error}`));
    }
    if (stats.errors.length > 5) {
      console.log(colors.dim(`   ... and ${stats.errors.length - 5} more errors\n`));
    }
  }

  console.log(colors.dim('\n━'.repeat(60)));
  console.log(colors.primary('\n📝 Next Steps:'));
  console.log(colors.dim('  1. Copy fresh JSONL files from .claude/projects'));
  console.log(colors.dim('  2. Update MiniSearchEngine to parse JSONL'));
  console.log(colors.dim('  3. Rebuild search index'));
  console.log(colors.dim('  4. Update background export service\n'));
}

main().catch(error => {
  console.error(colors.error('\n❌ Migration failed:'), error);
  process.exit(1);
});

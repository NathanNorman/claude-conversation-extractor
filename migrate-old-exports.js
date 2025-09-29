#!/usr/bin/env node

/**
 * Migrate Old Conversation Exports to New Format
 *
 * This script migrates conversations from the old extracted_conversations directory
 * to the new claude_conversations format WITHOUT deleting originals.
 *
 * Old format: ~/.claude/extracted_conversations/{project}/claude-conversation-{date}-{hash}.md
 * New format: ~/.claude/claude_conversations/{project}/claude-conversation-{date}-{hash}.md
 *            OR: ~/.claude/claude_conversations/{normalized-project-name}_{date}.md
 */

import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import ora from 'ora';
import chalk from 'chalk';

const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.blue,
  dim: chalk.gray
};

const OLD_EXPORT_DIR = join(homedir(), '.claude', 'extracted_conversations');
const NEW_EXPORT_DIR = join(homedir(), '.claude', 'claude_conversations');
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

class ConversationMigrator {
  constructor() {
    this.stats = {
      found: 0,
      skipped: 0,
      migrated: 0,
      errors: 0,
      duplicates: 0
    };
    this.migratedFiles = [];
  }

  /**
   * Parse the old markdown file to extract metadata
   */
  async parseOldConversation(filePath) {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    const metadata = {
      project: null,
      date: null,
      sessionId: null,
      file: null
    };

    // Extract metadata from the markdown headers
    for (const line of lines.slice(0, 20)) {
      if (line.includes('**Project:**')) {
        metadata.project = line.split('**Project:**')[1].trim();
      } else if (line.includes('**Date:**')) {
        metadata.date = line.split('**Date:**')[1].trim();
      } else if (line.includes('**File:**')) {
        metadata.file = line.split('**File:**')[1].trim();
      }
    }

    // Try to extract session ID from filename
    const filename = basename(filePath, '.md');
    const hashMatch = filename.match(/([a-f0-9]{8})$/);
    if (hashMatch) {
      metadata.sessionId = hashMatch[1];
    }

    // Try to extract date from filename if not in metadata
    const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch && !metadata.date) {
      metadata.date = dateMatch[1];
    }

    return metadata;
  }

  /**
   * Generate new filename following the current convention
   */
  generateNewFilename(oldPath, metadata) {
    const projectDir = basename(dirname(oldPath));
    const filename = basename(oldPath);

    // If metadata has a project name, use it; otherwise use directory name
    const projectName = metadata.project || projectDir;

    // Extract date and hash from filename
    const dateMatch = filename.match(/(\d{4}-\d{2}-\d{2})/);
    const hashMatch = filename.match(/([a-f0-9]{8})\.md$/);

    if (dateMatch && hashMatch) {
      const date = dateMatch[1];
      const hash = hashMatch[1];
      return {
        subdirName: projectDir,
        filename: `claude-conversation-${date}-${hash}.md`
      };
    }

    // Fallback: keep original filename
    return {
      subdirName: projectDir,
      filename: filename
    };
  }

  /**
   * Check if conversation already exists in new location
   */
  async conversationExists(newPath) {
    return existsSync(newPath);
  }

  /**
   * Copy conversation to new location (non-destructive)
   */
  async migrateConversation(oldPath) {
    try {
      this.stats.found++;

      if (VERBOSE) {
        console.log(colors.dim(`\n  Processing: ${basename(oldPath)}`));
      }

      // Parse metadata
      const metadata = await this.parseOldConversation(oldPath);

      // Generate new path
      const { subdirName, filename } = this.generateNewFilename(oldPath, metadata);
      const newSubdir = join(NEW_EXPORT_DIR, subdirName);
      const newPath = join(newSubdir, filename);

      // Check if already exists
      if (await this.conversationExists(newPath)) {
        this.stats.duplicates++;
        if (VERBOSE) {
          console.log(colors.warning(`    ⏭  Already exists: ${basename(newPath)}`));
        }
        return;
      }

      // Check if conversation is already in the new location with same hash
      const hash = filename.match(/([a-f0-9]{8})\.md$/)?.[1];
      if (hash) {
        const allFilesInNewLocation = existsSync(newSubdir)
          ? await readdir(newSubdir)
          : [];

        const duplicateFound = allFilesInNewLocation.some(f => f.includes(hash));
        if (duplicateFound) {
          this.stats.duplicates++;
          if (VERBOSE) {
            console.log(colors.warning(`    ⏭  Duplicate hash found: ${hash}`));
          }
          return;
        }
      }

      if (DRY_RUN) {
        this.stats.migrated++;
        console.log(colors.info(`    [DRY RUN] Would copy to: ${newPath}`));
        return;
      }

      // Create subdirectory if needed
      if (!existsSync(newSubdir)) {
        await mkdir(newSubdir, { recursive: true });
      }

      // Copy file (non-destructive)
      const content = await readFile(oldPath, 'utf-8');
      await writeFile(newPath, content);

      this.stats.migrated++;
      this.migratedFiles.push({
        old: oldPath,
        new: newPath,
        project: subdirName,
        metadata
      });

      if (VERBOSE) {
        console.log(colors.success(`    ✓ Migrated to: ${basename(newPath)}`));
      }

    } catch (error) {
      this.stats.errors++;
      console.error(colors.error(`\n  ✗ Error migrating ${basename(oldPath)}: ${error.message}`));
    }
  }

  /**
   * Scan old exports directory and migrate all conversations
   */
  async migrateAll() {
    const spinner = ora('Scanning old exports directory...').start();

    try {
      // Check if old directory exists
      if (!existsSync(OLD_EXPORT_DIR)) {
        spinner.fail('Old exports directory not found');
        console.log(colors.error(`Expected location: ${OLD_EXPORT_DIR}`));
        return;
      }

      spinner.text = 'Finding all conversation files...';

      // Get all project directories
      const projectDirs = await readdir(OLD_EXPORT_DIR);
      const conversationFiles = [];

      for (const projectDir of projectDirs) {
        const projectPath = join(OLD_EXPORT_DIR, projectDir);
        const projectStat = await stat(projectPath);

        if (projectStat.isDirectory()) {
          const files = await readdir(projectPath);
          for (const file of files) {
            if (file.endsWith('.md')) {
              conversationFiles.push(join(projectPath, file));
            }
          }
        }
      }

      spinner.succeed(`Found ${conversationFiles.length} conversation files`);

      if (conversationFiles.length === 0) {
        console.log(colors.warning('\n⚠  No conversations found to migrate'));
        return;
      }

      // Show what will happen
      if (DRY_RUN) {
        console.log(colors.info('\n🔍 DRY RUN MODE - No files will be modified\n'));
      } else {
        console.log(colors.primary('\n📦 Starting migration...\n'));
      }

      // Migrate each conversation
      const progressSpinner = ora({
        text: 'Migrating conversations...',
        color: 'cyan'
      }).start();

      for (let i = 0; i < conversationFiles.length; i++) {
        const file = conversationFiles[i];
        progressSpinner.text = `Migrating conversations... ${i + 1}/${conversationFiles.length}`;
        await this.migrateConversation(file);
      }

      progressSpinner.succeed(`Processed ${conversationFiles.length} conversations`);

      // Show summary
      this.showSummary();

      // Ask about index rebuild
      if (!DRY_RUN && this.stats.migrated > 0) {
        console.log(colors.info('\n💡 To make these conversations searchable, rebuild the search index:'));
        console.log(colors.highlight('   npm start (then choose Quick Setup)\n'));
      }

    } catch (error) {
      spinner.fail('Migration failed');
      console.error(colors.error(`Error: ${error.message}`));
      throw error;
    }
  }

  /**
   * Display migration summary
   */
  showSummary() {
    console.log(colors.primary('\n📊 Migration Summary\n'));
    console.log(`  ${colors.success('✓')} Found:      ${this.stats.found} conversations`);
    console.log(`  ${colors.success('✓')} Migrated:   ${this.stats.migrated} conversations`);
    console.log(`  ${colors.warning('⏭')}  Duplicates: ${this.stats.duplicates} (skipped)`);

    if (this.stats.errors > 0) {
      console.log(`  ${colors.error('✗')} Errors:     ${this.stats.errors}`);
    }

    if (this.migratedFiles.length > 0) {
      console.log(colors.dim('\n  Migrated to:'));
      console.log(colors.dim(`  ${NEW_EXPORT_DIR}`));

      // Show project breakdown
      const projectCounts = {};
      for (const file of this.migratedFiles) {
        projectCounts[file.project] = (projectCounts[file.project] || 0) + 1;
      }

      console.log(colors.dim('\n  By project:'));
      for (const [project, count] of Object.entries(projectCounts).sort((a, b) => b[1] - a[1])) {
        console.log(colors.dim(`    ${project}: ${count} conversations`));
      }
    }

    console.log(colors.success('\n✨ Migration complete!\n'));
  }
}

// Main execution
async function main() {
  console.log(colors.primary('\n🔄 Claude Conversation Migration Tool\n'));
  console.log(colors.dim('This tool migrates old conversation exports to the new format.'));
  console.log(colors.dim('Original files will NOT be deleted.\n'));

  if (DRY_RUN) {
    console.log(colors.warning('⚠  Running in DRY RUN mode - no changes will be made\n'));
  }

  const migrator = new ConversationMigrator();

  try {
    await migrator.migrateAll();
  } catch (error) {
    console.error(colors.error('\n❌ Migration failed:'), error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

export { ConversationMigrator };
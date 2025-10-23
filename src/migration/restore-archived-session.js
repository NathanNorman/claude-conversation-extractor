/**
 * Restore Archived Session - Makes archived JSONL resumable
 *
 * Takes a converted JSONL file (missing metadata) and enriches it with
 * sensible defaults so Claude Code can potentially resume it.
 */

import { readFile, writeFile } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class SessionRestorer {
  constructor(options = {}) {
    this.logger = options.logger || this.createDefaultLogger();
  }

  createDefaultLogger() {
    return {
      info: (msg) => console.log(msg),
      warn: (msg) => console.warn(msg),
      error: (msg) => console.error(msg),
      debug: (msg) => process.env.DEBUG && console.log('[DEBUG]', msg)
    };
  }

  /**
   * Get current Claude Code version
   */
  async getClaudeCodeVersion() {
    try {
      const { stdout } = await execAsync('claude --version');
      return stdout.trim();
    } catch {
      return '2.0.0'; // Fallback
    }
  }

  /**
   * Convert project name to directory path
   * Example: "toast-analytics" -> "/Users/nathan.norman/toast-analytics"
   */
  projectNameToPath(projectName) {
    // Remove any prefix artifacts
    const cleanProject = projectName
      .replace(/^-?Users-[^-]+-[^-]+-/, '')
      .replace(/^-/, '');

    // Common mappings
    if (cleanProject === 'home' || cleanProject === 'Users-nathan-norman') {
      return homedir();
    }

    // Default to ~/projectname
    return join(homedir(), cleanProject);
  }

  /**
   * Find project directory in .claude/projects by project name
   */
  async findProjectDirectory(projectName) {
    const projectsDir = join(homedir(), '.claude', 'projects');
    const { readdir } = await import('fs/promises');

    try {
      const dirs = await readdir(projectsDir);

      // Try exact match first
      const exactMatch = dirs.find(d => d === projectName);
      if (exactMatch) {
        return join(projectsDir, exactMatch);
      }

      // Try partial match (project name in directory name)
      const partialMatch = dirs.find(d => d.includes(projectName));
      if (partialMatch) {
        return join(projectsDir, partialMatch);
      }

      // No match - create new directory
      const newDir = `-Users-nathan-norman-${projectName}`;
      return join(projectsDir, newDir);
    } catch {
      // Can't read projects dir
      return null;
    }
  }

  /**
   * Enrich JSONL message with missing metadata fields
   */
  enrichMessage(message, context) {
    const enriched = { ...message };

    // Add missing fields if not present
    if (!enriched.cwd) {
      enriched.cwd = context.cwd;
    }
    if (!enriched.gitBranch) {
      enriched.gitBranch = context.gitBranch || 'main';
    }
    if (!enriched.isSidechain) {
      enriched.isSidechain = false;
    }
    if (!enriched.parentUuid) {
      enriched.parentUuid = null;
    }
    if (!enriched.userType) {
      enriched.userType = 'external';
    }
    if (!enriched.version) {
      enriched.version = context.version;
    }

    return enriched;
  }

  /**
   * Restore an archived JSONL file to .claude/projects for resuming
   * @param {string} archivedJsonlPath - Path to archived JSONL in claude_conversations
   * @param {Object} options - Restore options
   * @returns {Promise<Object>} Restore result
   */
  async restoreSession(archivedJsonlPath, options = {}) {
    try {
      this.logger.info(`Restoring session from: ${archivedJsonlPath}`);

      // Read the archived JSONL
      const content = await readFile(archivedJsonlPath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l.trim());

      // Parse to extract session info
      let sessionId = null;
      let projectName = null;

      // Extract from filename first
      const filename = basename(archivedJsonlPath);
      const sessionMatch = filename.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (sessionMatch) {
        sessionId = sessionMatch[1];
        projectName = filename.split(sessionMatch[1])[0].replace(/_+$/, '');
      }

      // Also check first message for session ID
      if (!sessionId) {
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.sessionId) {
              sessionId = data.sessionId;
              break;
            }
          } catch {
            continue;
          }
        }
      }

      if (!sessionId) {
        throw new Error('Could not extract session ID from file');
      }

      this.logger.info(`Session ID: ${sessionId}`);
      this.logger.info(`Project: ${projectName}`);

      // Find or create project directory
      const projectDir = await this.findProjectDirectory(projectName);
      if (!projectDir) {
        throw new Error('Could not determine project directory');
      }

      this.logger.info(`Project directory: ${projectDir}`);

      // Ensure project directory exists
      const { mkdir } = await import('fs/promises');
      await mkdir(projectDir, { recursive: true });

      // Get context for enrichment
      const version = await this.getClaudeCodeVersion();
      const cwd = this.projectNameToPath(projectName);
      const context = {
        cwd,
        gitBranch: 'main',
        version,
        userType: 'external',
        isSidechain: false,
        parentUuid: null
      };

      this.logger.info(`Enriching with: cwd=${cwd}, version=${version}`);

      // Enrich messages with metadata
      const enrichedLines = [];
      for (const line of lines) {
        try {
          const data = JSON.parse(line);

          // Enrich user/assistant messages
          if (data.type === 'user' || data.type === 'assistant') {
            const enriched = this.enrichMessage(data, context);
            enrichedLines.push(JSON.stringify(enriched));
          } else {
            // Keep summary and other types as-is
            enrichedLines.push(line);
          }
        } catch {
          // Keep malformed lines as-is
          enrichedLines.push(line);
        }
      }

      // Write to project directory
      const outputPath = join(projectDir, `${sessionId}.jsonl`);
      const enrichedContent = enrichedLines.join('\n');

      if (options.dryRun) {
        this.logger.info(`[DRY RUN] Would write to: ${outputPath}`);
        return {
          success: true,
          dryRun: true,
          sessionId,
          projectDir,
          outputPath
        };
      }

      await writeFile(outputPath, enrichedContent, 'utf-8');

      this.logger.info(`✅ Session restored to: ${outputPath}`);

      return {
        success: true,
        sessionId,
        projectDir,
        outputPath,
        enrichedFields: Object.keys(context)
      };
    } catch (error) {
      this.logger.error(`Failed to restore session: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const archivedPath = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');

  if (!archivedPath) {
    console.error('Usage: node restore-archived-session.js <archived-jsonl-path> [--dry-run]');
    process.exit(1);
  }

  const restorer = new SessionRestorer();
  const result = await restorer.restoreSession(archivedPath, { dryRun });

  if (result.success) {
    if (result.dryRun) {
      console.log('\n[DRY RUN] Would restore:');
      console.log(`  Session: ${result.sessionId}`);
      console.log(`  To: ${result.outputPath}`);
    } else {
      console.log('\n✅ Session restored successfully!');
      console.log(`  Session ID: ${result.sessionId}`);
      console.log(`  Location: ${result.outputPath}`);
      console.log(`  Enriched fields: ${result.enrichedFields.join(', ')}`);
      console.log('\nTo resume:');
      console.log(`  claude --resume ${result.sessionId}`);
    }
  } else {
    console.error(`\n❌ Restoration failed: ${result.error}`);
    process.exit(1);
  }
}

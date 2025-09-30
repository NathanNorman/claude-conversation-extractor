import { readFile, writeFile, mkdir, access, stat, unlink } from 'fs/promises';
import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';

const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.cyan,
  muted: chalk.hex('#808080'),
  accent: chalk.magenta,
  highlight: chalk.bold.white,
  dim: chalk.hex('#606060')
};

class BulkExtractor {
  constructor(options = {}) {
    this.processed = 0;
    this.errors = [];
    this.skipped = 0;
    this.extracted = 0;
    this.failed = 0;
    this.projectsDir = options.projectsDir;
    this.outputDir = options.outputDir || options.exportDir || join(process.env.HOME, '.claude', 'claude_conversations');
    this.exportDir = this.outputDir;
    this.setupManager = options.setupManager;
    this.deleteAllEmpty = false; // Track if user wants to delete all empty conversations
    this.emptyConversations = []; // Track empty conversations found
    this.deletedCount = 0; // Track number of deleted conversations
    this.logger = options.logger || console;
  }

  async extractAllConversations(conversations, exportDir, progressCallback) {
    // Only log to console if not in test environment
    const isTestEnv = process.env.NODE_ENV?.includes('test') || process.env.JEST_WORKER_ID || process.env.CI;
    if (!isTestEnv) {
      console.log(colors.info(`\n📤 Extracting ${conversations.length} conversations...\n`));
    }
    
    // Ensure export directory exists
    await this.ensureDirectory(exportDir);
    
    const startTime = Date.now();
    const spinner = ora({
      text: 'Starting extraction...',
      color: 'cyan',
      spinner: 'dots'
    }).start();
    
    this.processed = 0;
    this.extracted = 0;
    this.skipped = 0;
    this.failed = 0;
    this.errors = [];
    
    // Track progress events for callbacks
    if (progressCallback) {
      progressCallback({ type: 'start', total: conversations.length });
    }
    
    for (const conversation of conversations) {
      try {
        // Check if already extracted (idempotent)
        const alreadyExtracted = await this.checkIfAlreadyExtracted(conversation, exportDir);
        
        if (alreadyExtracted) {
          // Check if the extracted file is up to date
          const timestamp = conversation.modified 
            ? new Date(conversation.modified).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];
          const projectName = conversation.project.replace(/[^a-zA-Z0-9-_]/g, '_');
          const fileName = `${projectName}_${timestamp}.md`;
          const filePath = join(exportDir, fileName);
          
          const fileStat = await stat(filePath);
          if (fileStat.mtime >= conversation.modified) {
            // File is up to date, skip extraction
            this.skipped++;
            this.processed++;
            spinner.text = `⏭️  Skipping ${conversation.project} (already extracted)`;
          } else {
            // File is outdated, re-extract
            const result = await this.exportSingleConversation(conversation, exportDir);
            if (result.exported) {
              this.extracted++;
            }
            this.processed++;
            spinner.text = `🔄 Re-extracted ${conversation.project} (was outdated)`;
          }
        } else {
          // Not extracted yet, do it now
          const result = await this.exportSingleConversation(conversation, exportDir);
          if (result.exported) {
            this.extracted++;
          }
          this.processed++;
        }
        
        // Update progress
        const percentage = Math.round((this.processed / conversations.length) * 100);
        const elapsed = (Date.now() - startTime) / 1000;
        const eta = this.processed > 0 
          ? Math.round((elapsed / this.processed) * (conversations.length - this.processed))
          : 0;
        
        spinner.text = `📊 ${percentage}% (${this.processed}/${conversations.length}) - ${eta}s remaining`;
        
        if (progressCallback) {
          progressCallback({
            type: 'progress',
            processed: this.processed,
            total: conversations.length,
            percentage,
            eta,
            currentFile: conversation.project
          });
        }
      } catch (error) {
        this.processed++; // Count as processed even if it failed
        this.failed++;
        this.errors.push({
          conversation: conversation.project,
          error: error.message
        });
        // Show as warning (yellow) for empty conversations, error (red) for other issues
        if (error.message.includes('No messages found')) {
          spinner.warn = spinner.warn || function (text) {
            this.stopAndPersist({ symbol: colors.warning('⚠'), text: colors.warning(text) });
          };
          spinner.warn(`Skipping ${conversation.project}: ${error.message}`);
        } else {
          spinner.fail(`Error extracting ${conversation.project}: ${error.message}`);
        }
        spinner.start();
      }
    }
    
    spinner.stop();
    
    // Notify completion
    if (progressCallback) {
      progressCallback({ 
        type: 'complete', 
        extracted: this.extracted,
        skipped: this.skipped,
        failed: this.failed,
        total: conversations.length 
      });
    }
    
    // Show summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    if (!isTestEnv) {
      console.log(colors.success('\n✅ Extraction complete!'));
      console.log(colors.info(`   Processed: ${this.processed}/${conversations.length} conversations`));
      console.log(colors.info(`   Duration: ${duration}s`));
      
      // Show deleted conversations count if any
      if (this.deletedCount > 0) {
        console.log(colors.success(`   🗑️  Deleted: ${this.deletedCount} empty conversations`));
      }
      
      // Separate empty conversations from real errors
      const emptyConversations = this.errors.filter(e => e.error.includes('No messages found'));
      const realErrors = this.errors.filter(e => !e.error.includes('No messages found'));
      
      // Only show skipped empty conversations that weren't deleted
      const skippedEmptyCount = emptyConversations.length - this.deletedCount;
      if (skippedEmptyCount > 0) {
        console.log(colors.warning(`   ⚠️  Skipped: ${skippedEmptyCount} empty conversations (kept)`));
      }
      
      if (realErrors.length > 0) {
        console.log(colors.error(`   ❌ Errors: ${realErrors.length}`));
        for (const error of realErrors.slice(0, 3)) {
          console.log(colors.error(`     - ${error.conversation}: ${error.error}`));
        }
        if (realErrors.length > 3) {
          console.log(colors.dim(`     ... and ${realErrors.length - 3} more errors`));
        }
      }
    }
    
    // Add pause to let user read the summary
    // Only wait for input in interactive mode (not in tests)
    if (process.stdin.isTTY && !isTestEnv) {
      console.log(colors.dim('\n   Press Enter to continue...'));
      await new Promise(resolve => {
        const timeout = setTimeout(resolve, 100); // Failsafe timeout
        process.stdin.once('data', () => {
          clearTimeout(timeout);
          resolve();
        });
        if (process.stdin.setRawMode) {
          process.stdin.setRawMode(true);
        }
        process.stdin.resume();
      });
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(false);
      }
    }
    
    return {
      processed: this.processed,
      extracted: this.extracted,
      skipped: this.skipped,
      failed: this.failed,
      deleted: this.deletedCount,
      errors: this.errors,
      emptyConversations: this.emptyConversations,
      duration: parseFloat(duration)
    };
  }

  async exportSingleConversation(conversation, exportDir) {
    // Read the JSONL file with error recovery
    let content;
    try {
      content = await readFile(conversation.path, 'utf-8');
    } catch (readError) {
      // Handle file read errors gracefully
      if (readError.code === 'ENOENT') {
        throw new Error(`File not found: ${conversation.path}`);
      } else if (readError.code === 'EACCES') {
        throw new Error(`Permission denied: ${conversation.path}`);
      } else {
        throw new Error(`Failed to read file: ${readError.message}`);
      }
    }
    
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    // Parse messages with detailed error tracking
    const messages = [];
    const parseErrors = [];
    let lineNumber = 0;
    
    for (const line of lines) {
      lineNumber++;
      try {
        // First, check if the line is valid JSON
        const data = JSON.parse(line);
        
        // Look for user or assistant messages (not meta or system messages)
        if ((data.type === 'user' || data.type === 'assistant') && data.message && !data.isMeta) {
          // Validate message structure before adding
          if (data.message.role && (data.message.content || data.message.parts)) {
            messages.push(data.message);
          } else {
            parseErrors.push({ line: lineNumber, error: 'Invalid message structure' });
          }
        }
      } catch (err) {
        // Log parse errors for debugging but continue processing
        parseErrors.push({ 
          line: lineNumber, 
          error: err.message,
          preview: line.length > 50 ? line.substring(0, 50) + '...' : line
        });
        
        // Try to recover partial data from corrupted lines
        if (line.includes('"type":"user"') || line.includes('"type":"assistant"')) {
          // Attempt basic recovery for partially valid lines
          try {
            // Try to extract message content using regex as fallback
            const roleMatch = line.match(/"role":"(user|assistant)"/);
            const contentMatch = line.match(/"content":"([^"]*)"/);
            
            if (roleMatch && contentMatch) {
              messages.push({
                role: roleMatch[1],
                content: contentMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
                recovered: true
              });
            }
          } catch {
            // Recovery failed, skip this line
          }
        }
      }
    }
    
    // Log parse errors if in debug mode
    if (process.env.DEBUG && parseErrors.length > 0) {
      console.warn(`⚠️  ${parseErrors.length} lines could not be parsed in ${conversation.project}`);
      if (parseErrors.length <= 3) {
        parseErrors.forEach(err => {
          console.warn(`   Line ${err.line}: ${err.error}`);
        });
      }
    }
    
    // Check if we have enough valid content to export
    if (messages.length === 0) {
      // Handle empty conversation
      const emptyError = parseErrors.length > 0 
        ? `No valid messages found (${parseErrors.length} parse errors)`
        : 'No messages found in conversation';
      
      // Add to empty conversations list
      this.emptyConversations.push({
        path: conversation.path,
        project: conversation.project,
        reason: emptyError
      });
      
      // Check if we should prompt for deletion
      if (!this.deleteAllEmpty) {
        // Only prompt if not in test environment or CI
        const isTestEnv = process.env.NODE_ENV?.includes('test') || process.env.JEST_WORKER_ID || process.env.CI;
        
        if (!isTestEnv) {
          // Stop spinner temporarily for prompt
          const spinner = ora();
          spinner.stop();
          
          console.log(colors.warning(`\n⚠️  Empty conversation found: ${conversation.project}`));
          console.log(colors.muted(`   Path: ${conversation.path}`));
          console.log(colors.muted(`   Reason: ${emptyError}\n`));
          
          const { action } = await inquirer.prompt([{
            type: 'expand',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
              { key: 'y', name: 'Yes - Delete this empty conversation', value: 'delete' },
              { key: 'n', name: 'No - Keep this empty conversation', value: 'keep' },
              { key: 'a', name: 'All - Delete this and all future empty conversations', value: 'deleteAll' }
            ],
            default: 'n'
          }]);
          
          if (action === 'deleteAll') {
            this.deleteAllEmpty = true;
          }
          
          if (action === 'delete' || action === 'deleteAll') {
            try {
              await unlink(conversation.path);
              this.deletedCount++;
              console.log(colors.success(`✅ Deleted empty conversation: ${conversation.project}\n`));
            } catch (deleteError) {
              console.error(colors.error(`❌ Failed to delete ${conversation.path}: ${deleteError.message}\n`));
            }
          } else {
            console.log(colors.info(`📁 Keeping empty conversation: ${conversation.project}\n`));
          }
          
          // Restart spinner
          spinner.start();
        }
      } else {
        // Auto-delete if user chose "delete all"
        try {
          await unlink(conversation.path);
          this.deletedCount++;
          console.log(colors.success(`🗑️  Auto-deleted empty conversation: ${conversation.project}`));
        } catch (deleteError) {
          console.error(colors.error(`❌ Failed to delete ${conversation.path}: ${deleteError.message}`));
        }
      }
      
      throw new Error(emptyError);
    }
    
    // Generate filename based on format
    const timestamp = conversation.modified 
      ? new Date(conversation.modified).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const projectName = conversation.project.replace(/[^a-zA-Z0-9-_]/g, '_');
    
    // Get file extension based on format
    const format = this.currentFormat || 'markdown';
    const extension = format === 'json' ? '.json' : format === 'html' ? '.html' : '.md';
    const fileName = `${projectName}_${timestamp}${extension}`;
    const filePath = join(exportDir, fileName);
    
    // Check if file already exists (skip if duplicate)
    try {
      await access(filePath);
      // File already exists, skip
      return { skipped: true, path: filePath };
    } catch {
      // File doesn't exist, continue with export
    }
    
    // Format content based on specified format
    const conversationData = {
      project: conversation.project,
      messages,
      date: timestamp
    };
    
    const formattedContent = this.formatConversation(conversationData, format);
    
    // Write the file
    await writeFile(filePath, formattedContent);
    
    return { 
      exported: true, 
      path: filePath,
      messageCount: messages.length
    };
  }

  formatAsMarkdown(messages, projectName, date) {
    const lines = [];
    
    // Add header
    lines.push(`# Claude Conversation - ${projectName}`);
    lines.push(`**Date:** ${date}`);
    lines.push(`**Messages:** ${messages.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    
    // Add messages
    for (const message of messages) {
      const role = message.role === 'assistant' ? '🤖 Assistant' : '👤 Human';
      lines.push(`## ${role}`);
      lines.push('');
      
      // Handle content based on type
      if (typeof message.content === 'string') {
        lines.push(message.content);
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (typeof part === 'string') {
            lines.push(part);
          } else if (part.type === 'text') {
            lines.push(part.text || '');
          } else if (part.type === 'tool_use') {
            lines.push('```');
            lines.push(`Tool: ${part.name || 'Unknown'}` );
            if (part.input) {
              lines.push('Input:');
              lines.push(JSON.stringify(part.input, null, 2));
            }
            lines.push('```');
          } else if (part.type === 'tool_result') {
            lines.push('```');
            lines.push('Tool Result:');
            lines.push(part.content || '');
            lines.push('```');
          }
        }
      }
      
      lines.push('');
      lines.push('---');
      lines.push('');
    }
    
    return lines.join('\n');
  }

  async ensureDirectory(dirPath) {
    try {
      await access(dirPath);
    } catch {
      await mkdir(dirPath, { recursive: true });
    }
  }

  async checkIfAlreadyExtracted(conversation, exportDir) {
    const timestamp = conversation.modified 
      ? new Date(conversation.modified).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const projectName = conversation.project.replace(/[^a-zA-Z0-9-_]/g, '_');
    
    // Check for the specific format we're currently extracting
    const format = this.currentFormat || 'markdown';
    const extension = format === 'json' ? '.json' : format === 'html' ? '.html' : '.md';
    const fileName = `${projectName}_${timestamp}${extension}`;
    const filePath = join(exportDir, fileName);
    
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getExtractionStatus(conversations, exportDir) {
    let extracted = 0;
    let remaining = 0;
    
    for (const conversation of conversations) {
      const isExtracted = await this.checkIfAlreadyExtracted(conversation, exportDir);
      if (isExtracted) {
        extracted++;
      } else {
        remaining++;
      }
    }
    
    return {
      extracted,
      remaining,
      total: conversations.length,
      percentage: Math.round((extracted / conversations.length) * 100)
    };
  }

  /**
   * Extract all conversations (main entry point for tests)
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>} Extraction results
   */
  async extractAll(options = {}) {
    // Get conversations from projectsDir
    let conversations = [];
    
    if (this.projectsDir) {
      // Read JSONL files directly from projectsDir
      const { readdir, stat: statFile, readFile: readFileContent } = await import('fs/promises');
      
      try {
        const files = await readdir(this.projectsDir);
        
        for (const file of files) {
          if (file.endsWith('.jsonl')) {
            const filePath = join(this.projectsDir, file);
            
            try {
              const fileStat = await statFile(filePath);
              
              // Read the file to count messages
              const content = await readFileContent(filePath, 'utf-8');
              const lines = content.trim().split('\n').filter(line => line.trim());
              let messageCount = 0;
              
              for (const line of lines) {
                try {
                  const data = JSON.parse(line);
                  if ((data.type === 'user' || data.type === 'assistant') && data.message && !data.isMeta) {
                    messageCount++;
                  }
                } catch {
                  // Skip invalid lines
                }
              }
              
              // Only add conversations that have at least some content
              if (lines.length > 0) {
                conversations.push({
                  project: file.replace('.jsonl', ''),
                  file,
                  path: filePath,
                  modified: fileStat.mtime,
                  size: fileStat.size,
                  messageCount
                });
              }
            } catch (fileError) {
              // Log file access errors but continue processing other files
              if (this.logger?.debug) {
                this.logger.debug(`Error reading file ${file}: ${fileError.message}`);
              }
            }
          }
        }
      } catch (dirError) {
        throw new Error(`Cannot read projects directory ${this.projectsDir}: ${dirError.message}`);
      }
    } else if (this.setupManager) {
      conversations = await this.setupManager.findConversations();
    } else {
      throw new Error('No projectsDir or setupManager configured');
    }
    
    // Apply filters if provided
    if (options.filter) {
      conversations = this.filterConversations(conversations, options.filter);
    }
    
    // Set format and export directory
    const format = options.format || 'markdown';
    const exportDir = options.exportDir || this.outputDir;
    
    // Store format for use in export methods
    this.currentFormat = format;
    
    // Use extractAllConversations internally
    const result = await this.extractAllConversations(
      conversations,
      exportDir,
      options.onProgress
    );

    return {
      success: result.failed === 0,
      extracted: result.extracted,
      skipped: result.skipped,
      failed: result.failed,
      total: conversations.length,
      errors: result.errors,
      exportDir: exportDir
    };
  }

  /**
   * Skip already extracted conversations
   * @param {Array} conversations - Conversations to check
   * @returns {Promise<Array>} Conversations that need extraction
   */
  async filterUnextracted(conversations) {
    const unextracted = [];
    
    for (const conversation of conversations) {
      const isExtracted = await this.checkIfAlreadyExtracted(conversation, this.exportDir);
      if (!isExtracted) {
        unextracted.push(conversation);
      }
    }
    
    return unextracted;
  }

  /**
   * Handle corrupted JSONL gracefully
   * @param {string} content - JSONL content
   * @returns {Array} Parsed messages
   */
  parseJsonlSafely(content) {
    const messages = [];
    const lines = content.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.type && data.message) {
          messages.push(data);
        }
      } catch (error) {
        // Skip corrupted lines
        this.logger.debug(`Skipping corrupted JSONL line: ${error.message}`);
      }
    }
    
    return messages;
  }

  /**
   * Support different export formats
   * @param {Object} conversation - Conversation to export
   * @param {string} format - Export format (markdown, json, html)
   * @returns {string} Formatted content
   */
  formatConversation(conversation, format = 'markdown') {
    switch (format) {
    case 'json':
      return JSON.stringify(conversation, null, 2);
    case 'html':
      // Basic HTML format (could be enhanced)
      return `<!DOCTYPE html>
<html>
<head><title>${conversation.project}</title></head>
<body>
<h1>${conversation.project}</h1>
<div>${conversation.messages.map(m => `<p><strong>${m.role}:</strong> ${m.content}</p>`).join('')}</div>
</body>
</html>`;
    case 'markdown':
    default:
      return this.formatAsMarkdown(
        conversation.messages,
        conversation.project,
        conversation.date
      );
    }
  }

  /**
   * Implement batching for large datasets
   * @param {Array} conversations - All conversations
   * @param {number} batchSize - Size of each batch
   * @returns {Array} Batches
   */
  createBatches(conversations, batchSize = 10) {
    const batches = [];
    for (let i = 0; i < conversations.length; i += batchSize) {
      batches.push(conversations.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Add filtering options (date, message count)
   * @param {Array} conversations - Conversations to filter
   * @param {Object} filters - Filter options
   * @returns {Array} Filtered conversations
   */
  filterConversations(conversations, filters = {}) {
    let filtered = [...conversations];
    
    // Filter by afterDate
    if (filters.afterDate) {
      const afterDate = new Date(filters.afterDate);
      filtered = filtered.filter(conv => {
        const date = new Date(conv.modified || conv.created_at);
        return date >= afterDate;
      });
    }
    
    // Filter by date range
    if (filters.startDate || filters.endDate) {
      filtered = filtered.filter(conv => {
        const date = new Date(conv.modified || conv.created_at);
        if (filters.startDate && date < new Date(filters.startDate)) {
          return false;
        }
        if (filters.endDate && date > new Date(filters.endDate)) {
          return false;
        }
        return true;
      });
    }
    
    // Filter by minimum message count
    if (filters.minMessages) {
      filtered = filtered.filter(conv => {
        return (conv.messageCount || 0) >= filters.minMessages;
      });
    }
    
    // Filter by project
    if (filters.project) {
      filtered = filtered.filter(conv => {
        return conv.project.toLowerCase().includes(filters.project.toLowerCase());
      });
    }
    
    return filtered;
  }
}

export { BulkExtractor };
export default BulkExtractor;
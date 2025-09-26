import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';

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

export class BulkExtractor {
  constructor() {
    this.processed = 0;
    this.errors = [];
  }

  async extractAllConversations(conversations, exportDir, progressCallback) {
    console.log(colors.info(`\n📤 Extracting ${conversations.length} conversations...\n`));
    
    // Ensure export directory exists
    await this.ensureDirectory(exportDir);
    
    const startTime = Date.now();
    const spinner = ora({
      text: 'Starting extraction...',
      color: 'cyan',
      spinner: 'dots'
    }).start();
    
    this.processed = 0;
    this.errors = [];
    
    for (const conversation of conversations) {
      try {
        await this.exportSingleConversation(conversation, exportDir);
        this.processed++;
        
        // Update progress
        const percentage = Math.round((this.processed / conversations.length) * 100);
        const elapsed = (Date.now() - startTime) / 1000;
        const eta = this.processed > 0 
          ? Math.round((elapsed / this.processed) * (conversations.length - this.processed))
          : 0;
        
        spinner.text = `📊 ${percentage}% (${this.processed}/${conversations.length}) - ${eta}s remaining`;
        
        if (progressCallback) {
          progressCallback({
            processed: this.processed,
            total: conversations.length,
            percentage,
            eta,
            currentFile: conversation.project
          });
        }
      } catch (error) {
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
    
    // Show summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(colors.success('\n✅ Extraction complete!'));
    console.log(colors.info(`   Processed: ${this.processed}/${conversations.length} conversations`));
    console.log(colors.info(`   Duration: ${duration}s`));
    
    // Separate empty conversations from real errors
    const emptyConversations = this.errors.filter(e => e.error.includes('No messages found'));
    const realErrors = this.errors.filter(e => !e.error.includes('No messages found'));
    
    if (emptyConversations.length > 0) {
      console.log(colors.warning(`   ⚠️  Skipped: ${emptyConversations.length} empty conversations`));
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
    
    // Add pause to let user read the summary
    console.log(colors.dim('\n   Press Enter to continue...'));
    await new Promise(resolve => {
      process.stdin.once('data', resolve);
      process.stdin.setRawMode(true);
      process.stdin.resume();
    });
    process.stdin.setRawMode(false);
    
    return {
      processed: this.processed,
      errors: this.errors,
      duration: parseFloat(duration)
    };
  }

  async exportSingleConversation(conversation, exportDir) {
    // Read the JSONL file
    const content = await readFile(conversation.path, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    // Parse messages
    const messages = [];
    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        // Look for user or assistant messages (not meta or system messages)
        if ((data.type === 'user' || data.type === 'assistant') && data.message && !data.isMeta) {
          messages.push(data.message);
        }
      } catch (err) {
        // Skip invalid JSON lines
      }
    }
    
    if (messages.length === 0) {
      throw new Error('No messages found in conversation');
    }
    
    // Generate filename
    const timestamp = conversation.modified 
      ? new Date(conversation.modified).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];
    const projectName = conversation.project.replace(/[^a-zA-Z0-9-_]/g, '_');
    const fileName = `${projectName}_${timestamp}.md`;
    const filePath = join(exportDir, fileName);
    
    // Check if file already exists (skip if duplicate)
    try {
      await access(filePath);
      // File already exists, skip
      return { skipped: true, path: filePath };
    } catch {
      // File doesn't exist, continue with export
    }
    
    // Format as Markdown
    const markdown = this.formatAsMarkdown(messages, conversation.project, timestamp);
    
    // Write the file
    await writeFile(filePath, markdown);
    
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
    const fileName = `${projectName}_${timestamp}.md`;
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
}
/**
 * Markdown to JSONL Converter
 *
 * Converts archived markdown conversations back to JSONL format.
 * Accepts data loss for: individual message timestamps, UUIDs, threading, metadata.
 * Retains: sessionId, project, messages, approximate conversation date.
 */

import { readFile, writeFile, stat } from 'fs/promises';
import { join, basename } from 'path';

export class MarkdownToJsonlConverter {
  constructor(options = {}) {
    this.logger = options.logger || this.createDefaultLogger();
    this.dryRun = options.dryRun || false;
    this.stats = {
      processed: 0,
      converted: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };
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
   * Parse markdown file to extract conversation data
   * @param {string} markdownPath - Path to markdown file
   * @returns {Promise<Object>} Parsed conversation data
   */
  async parseMarkdownConversation(markdownPath) {
    const content = await readFile(markdownPath, 'utf-8');
    const lines = content.split('\n');

    const conversation = {
      project: null,
      sessionId: null,
      date: null,
      messages: []
    };

    // Extract metadata from header
    for (let i = 0; i < Math.min(20, lines.length); i++) {
      const line = lines[i];

      // Handle various header formats
      if (line.startsWith('# Claude Conversation -')) {
        conversation.project = line.split('# Claude Conversation -')[1].trim();
      } else if (line.startsWith('# Claude Code Conversation')) {
        // New format - project on next line
        continue;
      }

      // Extract metadata fields (support both plain and bold markdown)
      if (line.startsWith('Project:') || line.startsWith('**Project:**')) {
        conversation.project = line.split(/Project:\*?\*?/)[1].trim();
      } else if (line.startsWith('Session ID:') || line.startsWith('**Session ID:**')) {
        conversation.sessionId = line.split(/Session ID:\*?\*?/)[1].trim();
      } else if (line.startsWith('Date:') || line.startsWith('**Date:**')) {
        const dateStr = line.split(/Date:\*?\*?/)[1].trim();
        conversation.date = dateStr;
      }
    }

    // If no session ID found in header, try to extract from filename
    if (!conversation.sessionId) {
      const filenameMatch = basename(markdownPath).match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (filenameMatch) {
        conversation.sessionId = filenameMatch[1];
      }
    }

    // Parse message content
    let currentRole = null;
    let messageContent = '';

    for (const line of lines) {
      // Detect message headers (support multiple formats)
      if (line.startsWith('## 👤 User') || line.startsWith('## 👤 Human') ||
          line.startsWith('## User') || line.startsWith('## Human') ||
          line.startsWith('**Human:**')) {
        // Save previous message if exists
        if (currentRole && messageContent.trim()) {
          conversation.messages.push({
            role: currentRole,
            content: messageContent.trim()
          });
        }
        currentRole = 'user';
        messageContent = '';
      } else if (line.startsWith('## 🤖 Claude') || line.startsWith('## 🤖 Assistant') ||
                 line.startsWith('## Assistant') || line.startsWith('## Claude') ||
                 line.startsWith('**Assistant:**')) {
        // Save previous message if exists
        if (currentRole && messageContent.trim()) {
          conversation.messages.push({
            role: currentRole,
            content: messageContent.trim()
          });
        }
        currentRole = 'assistant';
        messageContent = '';
      } else if (currentRole && !line.startsWith('---') && !line.startsWith('#')) {
        // Accumulate message content (skip separators and headers)
        messageContent += line + '\n';
      }
    }

    // Save last message
    if (currentRole && messageContent.trim()) {
      conversation.messages.push({
        role: currentRole,
        content: messageContent.trim()
      });
    }

    return conversation;
  }

  /**
   * Convert parsed conversation to JSONL format
   * @param {Object} conversation - Parsed conversation data
   * @returns {string} JSONL content
   */
  convertToJsonl(conversation) {
    const lines = [];

    // Parse date (handle various formats)
    let conversationDate;
    try {
      conversationDate = new Date(conversation.date);
      if (isNaN(conversationDate.getTime())) {
        conversationDate = new Date();
      }
    } catch {
      conversationDate = new Date();
    }

    // Add summary line (first line in JSONL format)
    // Generate a simple summary from first user message
    let summary = 'Archived Conversation';
    if (conversation.messages.length > 0) {
      const firstUserMsg = conversation.messages.find(m => m.role === 'user');
      if (firstUserMsg && firstUserMsg.content) {
        // Take first 50 chars as summary
        summary = firstUserMsg.content.substring(0, 50).replace(/\n/g, ' ').trim();
        if (firstUserMsg.content.length > 50) {
          summary += '...';
        }
      }
    }

    lines.push(JSON.stringify({
      type: 'summary',
      summary: summary,
      leafUuid: this.generateUuid() // Generate a UUID for the summary
    }));

    // Convert messages to JSONL format
    for (let i = 0; i < conversation.messages.length; i++) {
      const message = conversation.messages[i];

      // Approximate timestamp: conversation date + i seconds
      // This spaces out messages slightly so they're not all identical
      const messageDate = new Date(conversationDate.getTime() + (i * 1000));

      const jsonlMessage = {
        type: message.role === 'user' ? 'user' : 'assistant',
        message: {
          role: message.role,
          content: message.content
        },
        timestamp: messageDate.toISOString(),
        sessionId: conversation.sessionId,
        uuid: this.generateUuid()
        // Note: We're omitting fields we can't reconstruct:
        // - parentUuid (threading info)
        // - isSidechain
        // - cwd (working directory)
        // - gitBranch
        // - version
        // - userType
      };

      lines.push(JSON.stringify(jsonlMessage));
    }

    return lines.join('\n');
  }

  /**
   * Generate a v4 UUID
   * @returns {string} UUID
   */
  generateUuid() {
    // Simple UUID v4 generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Convert a single markdown file to JSONL
   * @param {string} markdownPath - Path to markdown file
   * @param {string} outputPath - Path for output JSONL file
   * @returns {Promise<Object>} Conversion result
   */
  async convertFile(markdownPath, outputPath) {
    try {
      // Parse markdown
      const conversation = await this.parseMarkdownConversation(markdownPath);

      // Validate we have essential data
      if (!conversation.sessionId) {
        throw new Error('No session ID found');
      }
      if (conversation.messages.length === 0) {
        throw new Error('No messages found');
      }

      // Convert to JSONL
      const jsonlContent = this.convertToJsonl(conversation);

      // Write to file (unless dry run)
      if (!this.dryRun) {
        await writeFile(outputPath, jsonlContent, 'utf-8');

        // Preserve original file's modification time
        const markdownStat = await stat(markdownPath);
        const { utimes } = await import('fs/promises');
        await utimes(outputPath, new Date(), markdownStat.mtime);
      }

      return {
        success: true,
        sessionId: conversation.sessionId,
        messageCount: conversation.messages.length,
        outputPath: outputPath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        inputPath: markdownPath
      };
    }
  }

  /**
   * Convert multiple markdown files to JSONL
   * @param {Array<string>} markdownPaths - Array of markdown file paths
   * @param {string} outputDir - Output directory for JSONL files
   * @param {Function} progressCallback - Optional progress callback
   * @returns {Promise<Object>} Conversion statistics
   */
  async convertBatch(markdownPaths, outputDir, progressCallback = null) {
    this.stats = {
      processed: 0,
      converted: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };

    for (const markdownPath of markdownPaths) {
      try {
        // Generate output filename (preserve session ID)
        const filename = basename(markdownPath);
        const outputFilename = filename.replace(/\.md$/, '.jsonl');
        const outputPath = join(outputDir, outputFilename);

        // Convert file
        const result = await this.convertFile(markdownPath, outputPath);

        this.stats.processed++;

        if (result.success) {
          this.stats.converted++;
          this.logger.debug(`✅ Converted: ${filename} (${result.messageCount} messages)`);
        } else {
          this.stats.failed++;
          this.stats.errors.push({
            file: filename,
            error: result.error
          });
          this.logger.warn(`❌ Failed: ${filename} - ${result.error}`);
        }

        // Call progress callback if provided
        if (progressCallback) {
          progressCallback({
            processed: this.stats.processed,
            total: markdownPaths.length,
            converted: this.stats.converted,
            failed: this.stats.failed
          });
        }
      } catch (error) {
        this.stats.processed++;
        this.stats.failed++;
        this.stats.errors.push({
          file: basename(markdownPath),
          error: error.message
        });
        this.logger.error(`❌ Error processing ${markdownPath}: ${error.message}`);
      }
    }

    return this.stats;
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const markdownPath = process.argv[2];
  const outputPath = process.argv[3] || markdownPath.replace(/\.md$/, '.jsonl');

  if (!markdownPath) {
    console.error('Usage: node markdown-to-jsonl.js <markdown-file> [output-file]');
    process.exit(1);
  }

  const converter = new MarkdownToJsonlConverter();
  const result = await converter.convertFile(markdownPath, outputPath);

  if (result.success) {
    console.log('✅ Converted successfully!');
    console.log(`   Messages: ${result.messageCount}`);
    console.log(`   Output: ${result.outputPath}`);
  } else {
    console.error(`❌ Conversion failed: ${result.error}`);
    process.exit(1);
  }
}

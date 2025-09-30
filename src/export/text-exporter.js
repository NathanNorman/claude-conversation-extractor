/**
 * Plain text exporter for conversations
 */

import fs from 'fs-extra';

class TextExporter {
  constructor(options = {}) {
    this.outputDir = options.outputDir || process.env.HOME + '/.claude/claude_conversations';
    this.logger = options.logger || console;
  }

  /**
   * Export a conversation to plain text format
   */
  async export(conversation, outputPath, options = {}) {
    const content = this.formatConversation(conversation, options);
    await fs.writeFile(outputPath, content, 'utf-8');
    return outputPath;
  }

  /**
   * Format conversation as plain text
   */
  formatConversation(conversation, options = {}) {
    const lines = [];

    // Add metadata if requested
    if (options.includeMetadata) {
      lines.push('================================');
      lines.push('CONVERSATION EXPORT');
      lines.push('================================');
      lines.push(`Exported on: ${new Date().toISOString()}`);
      lines.push(`Total messages: ${conversation.length}`);
      if (conversation.length > 0) {
        const firstMsg = conversation[0];
        const lastMsg = conversation[conversation.length - 1];
        if (firstMsg.timestamp) {
          lines.push(`First message: ${new Date(firstMsg.timestamp).toLocaleString()}`);
        }
        if (lastMsg.timestamp) {
          lines.push(`Last message: ${new Date(lastMsg.timestamp).toLocaleString()}`);
        }
      }
      lines.push('================================\n');
    }

    // Format messages
    conversation.forEach((message, index) => {
      // Skip system messages unless in detailed mode
      if (message.role === 'system' && !options.detailed) {
        return;
      }

      // Add separator between messages
      if (index > 0) {
        lines.push('---\n');
      }

      // Format role
      const roleLabel = this.getRoleLabel(message.role);
      lines.push(`${roleLabel}:`);

      // Add timestamp if available
      if (message.timestamp && options.includeMetadata) {
        lines.push(`[${new Date(message.timestamp).toLocaleString()}]`);
      }

      // Add content
      if (message.content) {
        lines.push('');
        lines.push(message.content);
      }

      // Add tool use information in detailed mode
      if (options.detailed && message.tool_use) {
        lines.push('');
        lines.push('[Tool Use]');
        lines.push(`Name: ${message.tool_use.name}`);
        if (message.tool_use.input) {
          lines.push(`Input: ${JSON.stringify(message.tool_use.input, null, 2)}`);
        }
      }

      // Add tool results in detailed mode
      if (options.detailed && message.tool_results) {
        lines.push('');
        lines.push('[Tool Results]');
        message.tool_results.forEach(result => {
          lines.push(`- ${result.tool_use_id || 'Tool'}: ${result.content || 'No output'}`);
        });
      }

      lines.push('');
    });

    return lines.join('\n');
  }

  /**
   * Get display label for role
   */
  getRoleLabel(role) {
    switch (role) {
    case 'user':
    case 'human':
      return 'User';
    case 'assistant':
      return 'Assistant';
    case 'system':
      return 'System';
    default:
      return role.charAt(0).toUpperCase() + role.slice(1);
    }
  }

  /**
   * Export multiple conversations as plain text
   */
  async exportBulk(conversations, outputDir, options = {}) {
    const results = [];
    
    for (const conversation of conversations) {
      const filename = this.generateFilename(conversation, options);
      const outputPath = `${outputDir}/${filename}`;
      
      try {
        await this.export(conversation, outputPath, options);
        results.push({ success: true, path: outputPath });
      } catch (error) {
        this.logger.error(`Failed to export conversation: ${error.message}`);
        results.push({ success: false, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Generate filename for conversation
   */
  generateFilename(conversation, options = {}) {
    if (options.filename) {
      return options.filename.endsWith('.txt') ? options.filename : `${options.filename}.txt`;
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `conversation-${timestamp}.txt`;
  }
}

export default TextExporter;
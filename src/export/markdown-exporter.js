/**
 * Markdown Exporter for Claude Conversations
 * Exports conversations to clean, readable Markdown format
 */

import fs from 'fs-extra';
import path from 'path';

class MarkdownExporter {
  constructor(options = {}) {
    this.outputDir = options.outputDir || path.join(process.env.HOME, '.claude', 'claude_conversations');
    this.logger = options.logger || this.createDefaultLogger();
    this.template = options.template || null;
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
   * Export a conversation to Markdown format
   * @param {Object} conversation - The conversation object to export
   * @param {string} outputPath - Path where the markdown file should be saved (optional)
   * @param {Object} options - Export options
   * @returns {Promise<string>} Path where file was saved
   */
  async export(conversation, outputPath, options = {}) {
    try {
      // If outputPath is an object, it's actually options (when called with 2 args)
      if (typeof outputPath === 'object' && outputPath !== null) {
        options = outputPath;
        outputPath = undefined;
      }
      
      // Generate output path if not provided
      if (!outputPath) {
        const filename = this.sanitizeFilename(conversation.name || conversation.id || 'conversation') + '.md';
        outputPath = path.join(this.outputDir, filename);
        outputPath = await this.generateUniqueFilename(outputPath);
      }
      
      const content = this.generateMarkdown(conversation, options);
      
      // Ensure output directory exists
      await fs.ensureDir(path.dirname(outputPath));
      
      // Write the markdown file
      await fs.writeFile(outputPath, content, 'utf-8');
      
      this.logger.info(`Exported conversation to ${outputPath}`);
      return outputPath;
    } catch (error) {
      this.logger.error(`Failed to export conversation: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate markdown content from a conversation
   * @param {Object} conversation - The conversation object
   * @param {Object} options - Export options
   * @returns {string} Markdown content
   */
  generateMarkdown(conversation, options = {}) {
    // Handle both array of messages and conversation object
    let conversationObj = conversation;
    if (Array.isArray(conversation)) {
      // If conversation is an array, wrap it in an object
      conversationObj = {
        messages: conversation,
        name: 'Conversation Export'
      };
    }
    
    // Detect conversation format based on roles used
    const hasUserRole = conversationObj.messages?.some(m => m.role === 'user');
    const hasHumanRole = conversationObj.messages?.some(m => m.role === 'human');
    // Pass format hint to message formatting
    options._useModernFormat = hasUserRole && !hasHumanRole;
    
    // Check if custom template is provided
    if (this.template) {
      return this.renderConversationTemplate(conversationObj);
    }
    
    const lines = [];
    
    // Add metadata header if requested
    if (options.includeMetadata !== false) {
      lines.push(this.generateMetadataHeader(conversationObj));
      lines.push('');
    }
    
    // Add conversation title
    lines.push(`# ${conversationObj.name || 'Untitled Conversation'}`);
    lines.push('');
    
    // Add conversation metadata
    if (conversationObj.created_at || conversationObj.updated_at) {
      lines.push('## Conversation Info');
      if (conversationObj.id) {
        lines.push(`- **ID:** ${conversationObj.id}`);
      }
      if (conversationObj.created_at) {
        lines.push(`- **Created:** ${this.formatTimestamp(conversationObj.created_at, options)}`);
      }
      if (conversationObj.updated_at) {
        lines.push(`- **Updated:** ${this.formatTimestamp(conversationObj.updated_at, options)}`);
      }
      lines.push('');
    }
    
    // Add messages
    lines.push('## Messages');
    lines.push('');
    
    if (conversationObj.messages && conversationObj.messages.length > 0) {
      conversationObj.messages.forEach((message, index) => {
        lines.push(this.formatMessage(message, index, options));
        lines.push('');
      });
    } else {
      lines.push('*No messages in this conversation*');
      lines.push('');
    }
    
    return lines.join('\n');
  }

  /**
   * Render conversation using custom template
   * @param {Object} conversation - The conversation object
   * @returns {string} Rendered content
   */
  renderConversationTemplate(conversation) {
    let content = this.template.replace('{{name}}', conversation.name || 'Untitled');
    
    // Render messages section
    const messagesSection = conversation.messages.map(msg => {
      return this.renderTemplate(msg);
    }).join('\n');
    
    content = content.replace(/{{#messages}}[\s\S]*?{{\/messages}}/g, messagesSection);
    
    return content;
  }

  /**
   * Render message using custom template
   * @param {Object} message - The message object
   * @returns {string} Rendered message
   */
  renderTemplate(message) {
    // Extract template for message section
    const messageTemplate = this.template.match(/{{#messages}}([\s\S]*?){{\/messages}}/)?.[1] || '{{role}}: {{content}}\n';
    
    const rendered = messageTemplate
      .replace(/{{role}}/g, message.role)
      .replace(/{{content}}/g, message.content || '');
    
    return rendered;
  }

  /**
   * Generate metadata header for the markdown file
   * @param {Object} conversation - The conversation object
   * @returns {string} Metadata header in YAML format
   */
  generateMetadataHeader(conversation) {
    const now = new Date();
    const messages = conversation.messages || [];
    
    const header = [
      '---',
      `title: "${this.escapeYaml(conversation.name || 'Untitled Conversation')}"`,
      `id: "${conversation.id || 'unknown'}"`,
      `created: "${conversation.created_at || now.toISOString()}"`,
      `updated: "${conversation.updated_at || now.toISOString()}"`,
      `messages: ${messages.length}`,
      `exportedOn: "${now.toISOString()}"`,
      '---',
      '',
      '## Metadata',
      `- **Exported on:** ${now.toLocaleString()}`,
      `- **Total messages:** ${messages.length}`
    ];
    
    // Add date range if messages have timestamps
    if (messages.length > 0 && messages[0].timestamp) {
      const firstDate = new Date(messages[0].timestamp);
      const lastDate = messages[messages.length - 1].timestamp 
        ? new Date(messages[messages.length - 1].timestamp) 
        : firstDate;
      header.push(`- **Date range:** ${firstDate.toLocaleDateString()} - ${lastDate.toLocaleDateString()}`);
    }
    
    return header.join('\n');
  }

  /**
   * Format a single message
   * @param {Object} message - The message object
   * @param {number} index - Message index
   * @param {Object} options - Export options
   * @returns {string} Formatted message
   */
  formatMessage(message, index, options = {}) {
    const lines = [];
    
    // Check if custom template is provided
    if (this.template) {
      return this.renderTemplate(message);
    }
    
    // Add message header with role
    // Use ** format for human/assistant (legacy Claude format)
    // Use ## format for user/assistant (new format)
    let role;
    
    if (message.role === 'human') {
      role = '**Human:**';
    } else if (message.role === 'user') {
      role = '## User';
    } else if (message.role === 'system') {
      role = '## System';
    } else if (message.role === 'assistant') {
      // If conversation uses modern format (user/assistant), use ## format
      // Otherwise use ** format (human/assistant)
      role = options._useModernFormat ? '## Assistant' : '**Assistant:**';
    } else {
      role = '**Assistant:**';
    }
    lines.push(role);
    
    // Add timestamp if requested
    if (options.includeTimestamps && message.timestamp) {
      lines.push(`*${this.formatTimestamp(message.timestamp, options)}*`);
      lines.push('');
    }
    
    // Add main content
    if (message.content) {
      lines.push(this.formatContent(message.content));
    }
    
    // Add attachments if present
    if (message.attachments && message.attachments.length > 0) {
      lines.push('');
      lines.push('**Attachments:**');
      message.attachments.forEach(attachment => {
        lines.push(`- ${attachment.type}: ${attachment.path || attachment.name || 'Unknown'}`);
      });
    }
    
    // Add tool use in detailed mode
    if (options.detailed && message.tool_use) {
      lines.push('');
      lines.push('**Tool Use:**');
      lines.push(`- Tool: ${message.tool_use.tool_name || message.tool_use.name}`);
      if (message.tool_use.input) {
        lines.push('- Input:');
        lines.push('```json');
        lines.push(JSON.stringify(message.tool_use.input, null, 2));
        lines.push('```');
      }
      if (message.tool_use.output) {
        lines.push('- Output:');
        lines.push('```');
        lines.push(typeof message.tool_use.output === 'string' 
          ? message.tool_use.output 
          : JSON.stringify(message.tool_use.output, null, 2));
        lines.push('```');
      }
    }
    
    // Add MCP response in detailed mode
    if (options.detailed && message.mcp_response) {
      lines.push('');
      lines.push('**MCP Response:**');
      lines.push(`- Server: ${message.mcp_response.server}`);
      lines.push(`- Method: ${message.mcp_response.method}`);
      if (message.mcp_response.params) {
        lines.push('- Parameters:');
        lines.push('```json');
        lines.push(JSON.stringify(message.mcp_response.params, null, 2));
        lines.push('```');
      }
      if (message.mcp_response.result) {
        lines.push('- Result:');
        lines.push('```json');
        lines.push(JSON.stringify(message.mcp_response.result, null, 2));
        lines.push('```');
      }
    }
    
    // Add system messages in detailed mode
    if (options.detailed && message.system_message) {
      lines.push('');
      lines.push('**System Message:**');
      lines.push(`> ${message.system_message}`);
    }
    
    return lines.join('\n');
  }

  /**
   * Format content, handling code blocks properly
   * @param {string} content - The content to format
   * @returns {string} Formatted content
   */
  formatContent(content) {
    // Ensure code blocks are properly formatted
    // Already formatted code blocks should be preserved
    return content;
  }

  /**
   * Format timestamp based on options
   * @param {string} timestamp - ISO timestamp string
   * @param {Object} options - Export options
   * @returns {string} Formatted timestamp
   */
  formatTimestamp(timestamp, options = {}) {
    const date = new Date(timestamp);
    
    if (options.timestampFormat === 'relative') {
      return this.getRelativeTime(date);
    }
    
    // Default to ISO format with readable presentation
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toISOString().split('T')[1].split('.')[0];
    
    return `${dateStr} ${timeStr}`;
  }

  /**
   * Get relative time string (e.g., "2 hours ago")
   * @param {Date} date - The date to format
   * @returns {string} Relative time string
   */
  getRelativeTime(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
  }

  /**
   * Escape YAML special characters
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeYaml(str) {
    return str.replace(/"/g, '\\"');
  }

  /**
   * Sanitize filename for safe file system usage
   * @param {string} filename - The filename to sanitize
   * @returns {string} Sanitized filename
   */
  sanitizeFilename(filename) {
    // Remove or replace invalid characters
    return filename
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')  // Replace invalid chars with underscore
      .replace(/^\.+/, '_')  // Replace leading dots
      .replace(/\s+/g, '_')  // Replace spaces with underscores
      .replace(/_+/g, '_')  // Collapse multiple underscores
      .replace(/_+$/, '')  // Remove trailing underscores
      .slice(0, 200);  // Limit length
  }

  /**
   * Generate a unique filename if conflicts exist
   * @param {string} basePath - The base file path
   * @returns {Promise<string>} Unique file path
   */
  async generateUniqueFilename(basePath) {
    // If file doesn't exist, return original path
    if (!await fs.pathExists(basePath)) {
      return basePath;
    }
    
    let finalPath = basePath;
    let counter = 1;
    
    while (await fs.pathExists(finalPath)) {
      const dir = path.dirname(basePath);
      const ext = path.extname(basePath);
      const name = path.basename(basePath, ext);
      finalPath = path.join(dir, `${name}_${counter}${ext}`);
      counter++;
    }
    
    return finalPath;
  }

  /**
   * Export multiple conversations
   * @param {Array} conversations - Array of conversation objects
   * @param {Object} options - Export options
   * @returns {Promise<Array>} Array of export results
   */
  async exportBulk(conversations, options = {}) {
    const results = [];
    
    for (const conversation of conversations) {
      try {
        const filename = this.sanitizeFilename(conversation.name || conversation.id || 'conversation') + '.md';
        const outputPath = path.join(this.outputDir, filename);
        const uniquePath = await this.generateUniqueFilename(outputPath);
        
        await this.export(conversation, uniquePath, options);
        
        results.push({
          success: true,
          conversation: conversation.id,
          path: uniquePath
        });
      } catch (error) {
        results.push({
          success: false,
          conversation: conversation.id,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Filter conversations by date range
   * @param {Array} conversations - Conversations to filter
   * @param {Object} dateRange - Date range with start and end
   * @returns {Array} Filtered conversations
   */
  filterByDateRange(conversations, dateRange) {
    return conversations.filter(conv => {
      const convDate = new Date(conv.updated_at || conv.created_at);
      
      if (dateRange.start && convDate < new Date(dateRange.start)) {
        return false;
      }
      
      if (dateRange.end && convDate > new Date(dateRange.end)) {
        return false;
      }
      
      return true;
    });
  }

  /**
   * Filter conversations by minimum message count
   * @param {Array} conversations - Conversations to filter
   * @param {Object} options - Filter options with minMessages
   * @returns {Array} Filtered conversations
   */
  filterByMessageCount(conversations, options) {
    const minCount = options.minMessages || 0;
    return conversations.filter(conv => {
      return conv.messages && conv.messages.length >= minCount;
    });
  }
}

export default MarkdownExporter;
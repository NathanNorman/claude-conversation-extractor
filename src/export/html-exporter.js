/**
 * HTML Exporter for Claude Conversations
 * Exports conversations to styled HTML with syntax highlighting
 */

import fs from 'fs-extra';
import path from 'path';

class HtmlExporter {
  constructor(options = {}) {
    this.outputDir = options.outputDir || path.join(process.env.HOME, '.claude', 'claude_conversations');
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
   * Export a conversation to HTML format
   * @param {Object} conversation - The conversation object to export
   * @param {string} outputPath - Path where the HTML file should be saved
   * @param {Object} options - Export options
   * @returns {Promise<void>}
   */
  async export(conversation, outputPath, options = {}) {
    try {
      const htmlContent = this.generateHtml(conversation, options);
      
      // Ensure output directory exists
      await fs.ensureDir(path.dirname(outputPath));
      
      // Write the HTML file
      await fs.writeFile(outputPath, htmlContent, 'utf-8');
      
      this.logger.info(`Exported conversation to ${outputPath}`);
    } catch (error) {
      this.logger.error(`Failed to export conversation: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate HTML content from a conversation
   * @param {Object} conversation - The conversation object
   * @param {Object} options - Export options
   * @returns {string} HTML content
   */
  generateHtml(conversation, options = {}) {
    // Handle both array of messages and conversation object
    let conversationObj = conversation;
    if (Array.isArray(conversation)) {
      // If conversation is an array, wrap it in an object
      conversationObj = {
        messages: conversation,
        name: 'Conversation Export'
      };
    }
    
    // Support both 'theme' and 'darkMode' options
    const theme = options.theme === 'dark' || options.darkMode ? 'dark' : 'light';
    const printFriendly = options.printFriendly || false;
    
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(conversationObj.name || 'Claude Conversation')}</title>
    ${this.generateStyles(theme, printFriendly)}
</head>
<body class="${theme === 'dark' ? 'dark-theme' : ''}">
    ${this.generateHeader(conversationObj)}
    ${this.generateNavigation(conversationObj, options)}
    <main class="conversation-container">
        ${this.generateMessages(conversationObj, options)}
    </main>
    ${this.generateFooter(conversationObj)}
    ${this.generateScripts(options)}
</body>
</html>`;
  }

  /**
   * Generate CSS styles
   * @param {string} theme - Theme name (light/dark)
   * @param {boolean} printFriendly - Whether to include print-friendly styles
   * @returns {string} Style tag with CSS
   */
  generateStyles(theme, printFriendly) {
    const isDark = theme === 'dark';
    const styles = `
    <style>
        :root {
            --bg-primary: ${isDark ? '#1a1a1a' : '#ffffff'};
            --bg-secondary: ${isDark ? '#2d2d2d' : '#f5f5f5'};
            --bg-code: ${isDark ? '#0d0d0d' : '#f8f8f8'};
            --text-primary: ${isDark ? '#e0e0e0' : '#333333'};
            --text-secondary: ${isDark ? '#a0a0a0' : '#666666'};
            --border-color: ${isDark ? '#404040' : '#e0e0e0'};
            --link-color: ${isDark ? '#6db3f2' : '#0066cc'};
            --human-bg: ${isDark ? '#2a3f5f' : '#e3f2fd'};
            --assistant-bg: ${isDark ? '#3d3d3d' : '#ffffff'};
            --code-bg: ${isDark ? '#1e1e1e' : '#f6f8fa'};
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
            padding: 20px;
            max-width: 900px;
            margin: 0 auto;
        }
        
        body.dark-theme {
            background-color: #1a1a1a;
            color: #e0e0e0;
        }
        
        header {
            border-bottom: 2px solid var(--border-color);
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        
        h1 {
            font-size: 2em;
            margin-bottom: 10px;
            color: var(--text-primary);
        }
        
        .metadata {
            color: var(--text-secondary);
            font-size: 0.9em;
        }
        
        .navigation {
            position: sticky;
            top: 0;
            background-color: var(--bg-primary);
            padding: 10px 0;
            border-bottom: 1px solid var(--border-color);
            margin-bottom: 20px;
            z-index: 100;
        }
        
        .nav-links {
            display: flex;
            gap: 20px;
            list-style: none;
        }
        
        .nav-links a {
            color: var(--link-color);
            text-decoration: none;
        }
        
        .nav-links a:hover {
            text-decoration: underline;
        }
        
        .message {
            margin-bottom: 20px;
            padding: 15px;
            border-radius: 8px;
            border: 1px solid var(--border-color);
        }
        
        .message.human,
        .message.user {
            background-color: var(--human-bg);
            margin-left: 20px;
        }
        
        .message.assistant {
            background-color: var(--assistant-bg);
            margin-right: 20px;
        }
        
        .message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            padding-bottom: 5px;
            border-bottom: 1px solid var(--border-color);
        }
        
        .message-role {
            font-weight: bold;
            font-size: 0.95em;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .message-timestamp {
            font-size: 0.85em;
            color: var(--text-secondary);
        }
        
        .message-content {
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        
        pre {
            background-color: var(--code-bg);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            padding: 10px;
            overflow-x: auto;
            margin: 10px 0;
        }
        
        code {
            background-color: var(--code-bg);
            padding: 2px 4px;
            border-radius: 3px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 0.9em;
        }
        
        pre code {
            background-color: transparent;
            padding: 0;
        }
        
        .tool-use, .mcp-response {
            background-color: var(--bg-secondary);
            border-left: 4px solid var(--link-color);
            padding: 10px;
            margin: 10px 0;
            border-radius: 4px;
        }
        
        .tool-name, .mcp-server {
            font-weight: bold;
            color: var(--link-color);
        }
        
        .attachments {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid var(--border-color);
        }
        
        .attachment-item {
            display: inline-block;
            background-color: var(--bg-secondary);
            padding: 4px 8px;
            margin: 2px;
            border-radius: 4px;
            font-size: 0.9em;
        }
        
        footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid var(--border-color);
            text-align: center;
            color: var(--text-secondary);
            font-size: 0.9em;
        }
        
        ${printFriendly ? this.getPrintStyles() : ''}
    </style>`;
    
    return styles;
  }

  /**
   * Generate print-friendly styles
   * @returns {string} CSS for printing
   */
  getPrintStyles() {
    return `
        @media print {
            body {
                max-width: 100%;
                padding: 10px;
            }
            
            .navigation {
                display: none;
            }
            
            .message {
                page-break-inside: avoid;
                margin: 10px 0;
            }
            
            pre {
                white-space: pre-wrap;
            }
            
            header, footer {
                page-break-after: avoid;
            }
        }
    `;
  }

  /**
   * Generate HTML header section
   * @param {Object} conversation - The conversation object
   * @returns {string} HTML header
   */
  generateHeader(conversation) {
    return `
    <header>
        <h1>${this.escapeHtml(conversation.name || 'Untitled Conversation')}</h1>
        <div class="metadata">
            ${conversation.id ? `<span>ID: ${this.escapeHtml(conversation.id)}</span> | ` : ''}
            ${conversation.created_at ? `<span>Created: ${this.formatDate(conversation.created_at)}</span> | ` : ''}
            ${conversation.updated_at ? `<span>Updated: ${this.formatDate(conversation.updated_at)}</span> | ` : ''}
            <span>${conversation.messages ? conversation.messages.length : 0} messages</span>
        </div>
    </header>`;
  }

  /**
   * Generate navigation for long conversations
   * @param {Object} conversation - The conversation object
   * @param {Object} options - Export options
   * @returns {string} HTML navigation
   */
  generateNavigation(conversation, options) {
    if (!options.includeNavigation || !conversation.messages || conversation.messages.length < 10) {
      return '';
    }
    
    return `
    <nav class="navigation">
        <ul class="nav-links">
            <li><a href="#top">Top</a></li>
            <li><a href="#message-0">First Message</a></li>
            <li><a href="#message-${Math.floor(conversation.messages.length / 2)}">Middle</a></li>
            <li><a href="#message-${conversation.messages.length - 1}">Last Message</a></li>
            <li><a href="#bottom">Bottom</a></li>
        </ul>
    </nav>`;
  }

  /**
   * Generate HTML for messages
   * @param {Object} conversation - The conversation object
   * @param {Object} options - Export options
   * @returns {string} HTML messages
   */
  generateMessages(conversation, options) {
    if (!conversation.messages || conversation.messages.length === 0) {
      return '<div class="no-messages">No messages in this conversation</div>';
    }
    
    return conversation.messages.map((message, index) => 
      this.generateMessage(message, index, options)
    ).join('\n');
  }

  /**
   * Generate HTML for a single message
   * @param {Object} message - The message object
   * @param {number} index - Message index
   * @param {Object} options - Export options
   * @returns {string} HTML message
   */
  generateMessage(message, index, options) {
    const roleClass = message.role === 'human' ? 'human' : (message.role === 'user' ? 'user' : 'assistant');
    const roleDisplay = message.role === 'human' ? 'Human' : (message.role === 'user' ? 'User' : 'Assistant');
    
    let content = `<div class="message ${roleClass}" id="message-${index}">
        <div class="message-header">
            <span class="message-role">${roleDisplay}</span>
            ${message.timestamp ? `<span class="message-timestamp">${this.formatDate(message.timestamp)}</span>` : ''}
        </div>
        <div class="message-content">${this.processContent(message.content)}</div>`;
    
    // Add attachments if present
    if (message.attachments && message.attachments.length > 0) {
      content += this.generateAttachments(message.attachments);
    }
    
    // Add tool use if present and in detailed mode
    if (options.detailed && message.tool_use) {
      content += this.generateToolUse(message.tool_use);
    }
    
    // Add MCP response if present and in detailed mode
    if (options.detailed && message.mcp_response) {
      content += this.generateMcpResponse(message.mcp_response);
    }
    
    content += '</div>';
    
    return content;
  }

  /**
   * Generate HTML for attachments
   * @param {Array} attachments - Array of attachment objects
   * @returns {string} HTML attachments
   */
  generateAttachments(attachments) {
    const items = attachments.map(att => 
      `<span class="attachment-item">${this.escapeHtml(att.type)}: ${this.escapeHtml(att.path || att.name || 'Unknown')}</span>`
    ).join('');
    
    return `<div class="attachments">Attachments: ${items}</div>`;
  }

  /**
   * Generate HTML for tool use
   * @param {Object} toolUse - Tool use object
   * @returns {string} HTML tool use
   */
  generateToolUse(toolUse) {
    return `
    <div class="tool-use">
        <div class="tool-name">Tool: ${this.escapeHtml(toolUse.tool_name)}</div>
        ${toolUse.input ? `<pre>Input: ${this.escapeHtml(JSON.stringify(toolUse.input, null, 2))}</pre>` : ''}
        ${toolUse.output ? `<pre>Output: ${this.escapeHtml(
    typeof toolUse.output === 'string' ? toolUse.output : JSON.stringify(toolUse.output, null, 2)
  )}</pre>` : ''}
    </div>`;
  }

  /**
   * Generate HTML for MCP response
   * @param {Object} mcpResponse - MCP response object
   * @returns {string} HTML MCP response
   */
  generateMcpResponse(mcpResponse) {
    return `
    <div class="mcp-response">
        <div class="mcp-server">MCP Server: ${this.escapeHtml(mcpResponse.server)}</div>
        <div>Method: ${this.escapeHtml(mcpResponse.method)}</div>
        ${mcpResponse.params ? `<pre>Parameters: ${this.escapeHtml(JSON.stringify(mcpResponse.params, null, 2))}</pre>` : ''}
        ${mcpResponse.result ? `<pre>Result: ${this.escapeHtml(JSON.stringify(mcpResponse.result, null, 2))}</pre>` : ''}
    </div>`;
  }

  /**
   * Generate HTML footer
   * @param {Object} conversation - The conversation object
   * @returns {string} HTML footer
   */
  generateFooter() {
    return `
    <footer id="bottom">
        <p>Exported on ${new Date().toLocaleString()} | Claude Conversation Extractor</p>
    </footer>`;
  }

  /**
   * Generate JavaScript for interactivity
   * @param {Object} options - Export options
   * @returns {string} Script tag with JavaScript
   */
  generateScripts(options) {
    if (!options.includeScripts) {
      return '';
    }
    
    return `
    <script>
        // Smooth scrolling for navigation links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
        
        // Highlight code blocks (basic)
        document.querySelectorAll('pre code').forEach(block => {
            // Basic syntax highlighting could be added here
        });
        
        // Theme toggle if enabled
        ${options.themeToggle ? this.getThemeToggleScript() : ''}
    </script>`;
  }

  /**
   * Get theme toggle script
   * @returns {string} JavaScript for theme toggling
   */
  getThemeToggleScript() {
    return `
        const themeToggle = document.createElement('button');
        themeToggle.textContent = '🌓';
        themeToggle.style.cssText = 'position:fixed;top:20px;right:20px;font-size:24px;background:none;border:none;cursor:pointer;z-index:1000;';
        document.body.appendChild(themeToggle);
        
        themeToggle.addEventListener('click', () => {
            const html = document.documentElement;
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-theme', newTheme);
        });
    `;
  }

  /**
   * Process content to handle code blocks and formatting
   * @param {string} content - Raw content
   * @returns {string} Processed HTML content
   */
  processContent(content) {
    if (!content) return '';
    
    // Split content into code blocks and regular text to handle them separately
    const parts = [];
    let lastIndex = 0;
    
    // Find all code blocks first
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    let match;
    
    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add text before code block (escaped)
      if (match.index > lastIndex) {
        const textBefore = content.slice(lastIndex, match.index);
        parts.push(this.escapeHtml(textBefore).replace(/\n/g, '<br>'));
      }
      
      // Add code block (properly formatted)
      const lang = this.escapeHtml(match[1] || 'plaintext');
      const code = this.escapeHtml(match[2].trim());
      parts.push(`<pre><code class="language-${lang}">${code}</code></pre>`);
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text after last code block
    if (lastIndex < content.length) {
      const remainingText = content.slice(lastIndex);
      parts.push(this.escapeHtml(remainingText).replace(/\n/g, '<br>'));
    }
    
    let processed = parts.join('');
    
    // Process inline code (`code`) - handle carefully to avoid double escaping
    processed = processed.replace(/`([^`]+)`/g, (match, code) => {
      return `<code>${this.escapeHtml(code)}</code>`;
    });
    
    return processed;
  }

  /**
   * Escape HTML special characters
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeHtml(str) {
    if (!str) return '';
    
    const htmlEscapes = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      '\'': '&#39;',
      '/': '&#x2F;'
    };
    
    return String(str).replace(/[&<>"'/]/g, char => htmlEscapes[char]);
  }

  /**
   * Format date for display
   * @param {string} dateStr - Date string
   * @returns {string} Formatted date
   */
  formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString();
  }

  /**
   * Add syntax highlighting support
   * @param {string} html - HTML content
   * @param {Object} options - Export options
   * @returns {string} HTML with syntax highlighting
   */
  addSyntaxHighlighting(html, options) {
    if (!options.syntaxHighlighting) {
      return html;
    }
    
    // Add Prism.js or highlight.js CDN links
    const highlightingLib = `
    <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-${options.darkMode ? 'tomorrow' : 'default'}.min.css" rel="stylesheet" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-python.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-json.min.js"></script>`;
    
    return html.replace('</head>', highlightingLib + '</head>');
  }
}

export default HtmlExporter;
/**
 * JSON Exporter for Claude Conversations
 * Exports conversations to JSON and JSON Lines formats
 */

import fs from 'fs-extra';
import path from 'path';

class JsonExporter {
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
   * Export a conversation to JSON format
   * @param {Object} conversation - The conversation object to export
   * @param {string} outputPath - Path where the JSON file should be saved
   * @param {Object} options - Export options
   * @returns {Promise<void>}
   */
  async export(conversation, outputPath, options = {}) {
    try {
      const jsonContent = this.generateJson(conversation, options);
      
      // Ensure output directory exists
      await fs.ensureDir(path.dirname(outputPath));
      
      // Write the JSON file
      await fs.writeFile(outputPath, jsonContent, 'utf-8');
      
      this.logger.info(`Exported conversation to ${outputPath}`);
    } catch (error) {
      this.logger.error(`Failed to export conversation: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate JSON string from a conversation
   * @param {Object} conversation - The conversation object
   * @param {Object} options - Export options
   * @returns {string} JSON string
   */
  generateJson(conversation, options = {}) {
    // Handle both array of messages and conversation object
    let conversationObj = conversation;
    if (Array.isArray(conversation)) {
      // If conversation is an array, wrap it in an object
      conversationObj = {
        messages: conversation,
        metadata: {
          exportedAt: new Date().toISOString(),
          messageCount: conversation.length
        }
      };
    }
    
    // Create a safe JSON stringifier that handles circular references
    const seen = new WeakSet();
    
    const replacer = (key, value) => {
      // Handle circular references
      if (value !== null && typeof value === 'object') {
        if (seen.has(value)) {
          return undefined; // Remove circular references completely
        }
        seen.add(value);
      }
      
      // In detailed mode, include everything
      if (options.detailed) {
        return value;
      }
      
      // In normal mode, filter out some internal fields
      if (key.startsWith('_') || key === 'internal') {
        return undefined;
      }
      
      return value;
    };
    
    // Pretty print or minify based on options
    // Support both 'pretty' and 'minified' options
    const isPretty = options.pretty !== false && !options.minified;
    const indent = isPretty ? (options.indent || 2) : 0;
    
    try {
      return JSON.stringify(conversationObj, replacer, indent);
    } catch (error) {
      this.logger.error(`Error stringifying JSON: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate JSON string from multiple conversations as an array
   * @param {Array} conversations - Array of conversation objects
   * @param {Object} options - Export options
   * @returns {string} JSON string
   */
  generateMultipleJson(conversations, options = {}) {
    // Create a safe JSON stringifier that handles circular references
    const seen = new WeakSet();
    
    const replacer = (key, value) => {
      // Handle circular references
      if (value !== null && typeof value === 'object') {
        if (seen.has(value)) {
          return undefined; // Remove circular references completely
        }
        seen.add(value);
      }
      
      // In detailed mode, include everything
      if (options.detailed) {
        return value;
      }
      
      // In normal mode, filter out some internal fields
      if (key.startsWith('_') || key === 'internal') {
        return undefined;
      }
      
      return value;
    };
    
    // Pretty print or minify based on options
    const isPretty = options.pretty !== false && !options.minified;
    const indent = isPretty ? (options.indent || 2) : 0;
    
    try {
      return JSON.stringify(conversations, replacer, indent);
    } catch (error) {
      this.logger.error(`Error stringifying JSON: ${error.message}`);
      throw error;
    }
  }

  /**
   * Export multiple conversations to a single JSON file
   * @param {Array} conversations - Array of conversation objects
   * @param {string} outputPath - Path where the JSON file should be saved
   * @param {Object} options - Export options
   * @returns {Promise<void>}
   */
  async exportMultiple(conversations, outputPath, options = {}) {
    try {
      // Check if this should be JSON Lines format
      if (options.format === 'jsonl') {
        return await this.exportAsJsonl(conversations, outputPath, options);
      }
      
      // For multiple conversations, we want to export as an array
      const jsonContent = this.generateMultipleJson(conversations, options);
      
      // Ensure output directory exists
      await fs.ensureDir(path.dirname(outputPath));
      
      // Write the JSON file
      await fs.writeFile(outputPath, jsonContent, 'utf-8');
      
      this.logger.info(`Exported ${conversations.length} conversations to ${outputPath}`);
    } catch (error) {
      this.logger.error(`Failed to export conversations: ${error.message}`);
      throw error;
    }
  }

  /**
   * Export conversations to JSON Lines format (one JSON object per line)
   * @param {Array} conversations - Array of conversation objects
   * @param {string} outputPath - Path where the JSONL file should be saved
   * @param {Object} options - Export options
   * @returns {Promise<void>}
   */
  async exportAsJsonl(conversations, outputPath, options = {}) {
    try {
      // Ensure output directory exists
      await fs.ensureDir(path.dirname(outputPath));
      
      // Collect all lines first, then write at once
      const lines = [];
      
      // Write each conversation as a separate line
      for (const conversation of conversations) {
        // Use our safe JSON generator that handles circular references
        // Force minified output for JSONL format
        const jsonLine = this.generateJson(conversation, { ...options, pretty: false, minified: true });
        lines.push(jsonLine);
      }
      
      // Write all lines at once with proper line endings
      await fs.writeFile(outputPath, lines.join('\n'), 'utf-8');
      
      this.logger.info(`Exported ${conversations.length} conversations to JSONL at ${outputPath}`);
    } catch (error) {
      this.logger.error(`Failed to export conversations as JSONL: ${error.message}`);
      throw error;
    }
  }

  /**
   * Export with custom processing for each conversation
   * @param {Object} conversation - The conversation object
   * @param {Object} options - Export options
   * @returns {Object} Processed conversation
   */
  processConversation(conversation, options = {}) {
    const processed = { ...conversation };

    // Ensure keywords field is included
    processed.keywords = conversation.keywords || [];

    // Add export metadata
    processed._export = {
      timestamp: new Date().toISOString(),
      format: 'json',
      version: '1.0.0'
    };

    // In detailed mode, preserve all data
    if (options.detailed) {
      // Include all tool use details
      if (processed.messages) {
        processed.messages = processed.messages.map(msg => ({
          ...msg,
          _detailed: true
        }));
      }
    } else {
      // In normal mode, clean up internal fields
      if (processed.messages) {
        processed.messages = processed.messages.map(msg => {
          const cleaned = { ...msg };
          // Remove internal fields
          delete cleaned._internal;
          delete cleaned._cache;
          return cleaned;
        });
      }
    }

    return processed;
  }

  /**
   * Validate JSON structure before export
   * @param {Object} data - Data to validate
   * @returns {boolean} True if valid
   */
  validateJson(data) {
    try {
      // Try to stringify and parse to ensure it's valid JSON
      const jsonStr = JSON.stringify(data);
      JSON.parse(jsonStr);
      return true;
    } catch (error) {
      this.logger.error(`Invalid JSON structure: ${error.message}`);
      return false;
    }
  }

  /**
   * Export conversations with streaming for large datasets
   * @param {Function} conversationGenerator - Generator function that yields conversations
   * @param {string} outputPath - Path where the file should be saved
   * @param {Object} options - Export options
   * @returns {Promise<number>} Number of conversations exported
   */
  async exportStream(conversationGenerator, outputPath, options = {}) {
    try {
      // Ensure output directory exists
      await fs.ensureDir(path.dirname(outputPath));
      
      const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });
      let count = 0;
      let isFirst = true;
      
      // Start JSON array if not JSONL format
      if (!options.jsonl) {
        writeStream.write('[\n');
      }
      
      // Process each conversation from the generator
      for await (const conversation of conversationGenerator()) {
        const processed = this.processConversation(conversation, options);
        
        if (options.jsonl) {
          // JSON Lines format - one object per line
          writeStream.write(JSON.stringify(processed) + '\n');
        } else {
          // Regular JSON array
          if (!isFirst) {
            writeStream.write(',\n');
          }
          const indent = options.minified ? 0 : 2;
          writeStream.write(JSON.stringify(processed, null, indent));
          isFirst = false;
        }
        
        count++;
        
        // Call progress callback if provided
        if (options.onProgress) {
          options.onProgress({ count, conversation: conversation.id || conversation.name });
        }
      }
      
      // Close JSON array if not JSONL format
      if (!options.jsonl) {
        writeStream.write('\n]');
      }
      
      // Close the stream
      await new Promise((resolve, reject) => {
        writeStream.end((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      this.logger.info(`Streamed ${count} conversations to ${outputPath}`);
      return count;
    } catch (error) {
      this.logger.error(`Failed to export stream: ${error.message}`);
      throw error;
    }
  }

  /**
   * Import conversations from JSON file
   * @param {string} inputPath - Path to the JSON file
   * @returns {Promise<Array>} Array of conversation objects
   */
  async import(inputPath) {
    try {
      const content = await fs.readFile(inputPath, 'utf-8');
      const data = JSON.parse(content);
      
      // Handle both single conversation and array of conversations
      const conversations = Array.isArray(data) ? data : [data];
      
      this.logger.info(`Imported ${conversations.length} conversations from ${inputPath}`);
      return conversations;
    } catch (error) {
      this.logger.error(`Failed to import conversations: ${error.message}`);
      throw error;
    }
  }

  /**
   * Import conversations from JSON Lines file
   * @param {string} inputPath - Path to the JSONL file
   * @returns {Promise<Array>} Array of conversation objects
   */
  async importJsonl(inputPath) {
    try {
      const content = await fs.readFile(inputPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      const conversations = [];
      
      for (const line of lines) {
        try {
          conversations.push(JSON.parse(line));
        } catch (error) {
          this.logger.warn(`Failed to parse line: ${error.message}`);
        }
      }
      
      this.logger.info(`Imported ${conversations.length} conversations from JSONL at ${inputPath}`);
      return conversations;
    } catch (error) {
      this.logger.error(`Failed to import JSONL: ${error.message}`);
      throw error;
    }
  }
}

export default JsonExporter;
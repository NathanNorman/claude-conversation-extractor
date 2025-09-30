/**
 * Export Manager for Claude Conversations
 * Coordinates exports across different formats and handles bulk operations
 */

import fs from 'fs-extra';
import path from 'path';
import MarkdownExporter from './markdown-exporter.js';
import TextExporter from './text-exporter.js';

class ExportManager {
  constructor(options = {}) {
    this.outputDir = options.outputDir || path.join(process.env.HOME, '.claude', 'claude_conversations');
    this.logger = options.logger || this.createDefaultLogger();
    
    // Initialize exporters
    this.exporters = {
      markdown: new MarkdownExporter({ outputDir: this.outputDir, logger: this.logger }),
      md: new MarkdownExporter({ outputDir: this.outputDir, logger: this.logger }),
      text: new TextExporter({ outputDir: this.outputDir, logger: this.logger }),
      txt: new TextExporter({ outputDir: this.outputDir, logger: this.logger }),
      json: null, // Will be initialized when JsonExporter is available
      jsonl: null, // Will be initialized when JsonExporter is available
      html: null  // Will be initialized when HtmlExporter is available
    };
    
    // Track whether exporters have been loaded
    this.exportersLoaded = false;
    this.loadingPromise = null;
  }
  
  async loadExporters() {
    // Return existing promise if already loading
    if (this.loadingPromise) {
      return this.loadingPromise;
    }
    
    // Return immediately if already loaded
    if (this.exportersLoaded) {
      return;
    }
    
    // Create loading promise
    this.loadingPromise = (async () => {
      try {
        const JsonExporter = (await import('./json-exporter.js')).default;
        this.exporters.json = new JsonExporter({ outputDir: this.outputDir, logger: this.logger });
        this.exporters.jsonl = new JsonExporter({ outputDir: this.outputDir, logger: this.logger });
      } catch (e) {
        // JsonExporter not yet available
      }
      
      try {
        const HtmlExporter = (await import('./html-exporter.js')).default;
        this.exporters.html = new HtmlExporter({ outputDir: this.outputDir, logger: this.logger });
      } catch (e) {
        // HtmlExporter not yet available
      }
      
      this.exportersLoaded = true;
      this.loadingPromise = null;
    })();
    
    return this.loadingPromise;
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
   * Get the appropriate exporter for a given format
   * @param {string} format - Export format (markdown, json, html, etc.)
   * @returns {Object} Exporter instance
   */
  getExporter(format) {
    const normalizedFormat = format.toLowerCase();
    const exporter = this.exporters[normalizedFormat];
    
    if (!exporter) {
      throw new Error(`Unsupported export format: ${format}. Supported formats: ${Object.keys(this.exporters).join(', ')}`);
    }
    
    return exporter;
  }

  /**
   * Validate export format
   * @param {string} format - Format to validate
   * @returns {boolean} True if format is valid
   */
  validateFormat(format) {
    const normalizedFormat = format.toLowerCase();
    return normalizedFormat in this.exporters && this.exporters[normalizedFormat] !== null;
  }

  /**
   * Export a single conversation
   * @param {Object} conversation - Conversation to export
   * @param {string|Object} formatOrOptions - Export format or options object
   * @param {Object} options - Export options (if format is string)
   * @returns {Promise<string|null>} Path to exported file or null on error
   */
  async export(conversation, formatOrOptions = 'markdown', options = {}) {
    // Ensure exporters are loaded
    await this.loadExporters();
    
    // Handle both signatures: export(conv, 'format', options) and export(conv, options)
    let format;
    if (typeof formatOrOptions === 'string') {
      format = formatOrOptions;
    } else {
      options = formatOrOptions;
      format = options.format || 'markdown';
    }
    
    // Validate format
    if (!this.validateFormat(format)) {
      throw new Error(`Unsupported format: ${format}. Supported formats: markdown, text, json, jsonl, html`);
    }
    
    try {
      const exporter = this.getExporter(format);
      
      // Ensure output directory exists
      await fs.ensureDir(this.outputDir);
      
      // Generate filename - use provided outputPath or generate one
      let outputPath;
      if (options.outputPath) {
        outputPath = options.outputPath;
        // Ensure the parent directory exists
        await fs.ensureDir(path.dirname(outputPath));
      } else {
        const filename = this.generateFilename(conversation, format, options);
        outputPath = path.join(this.outputDir, filename);
      }
      
      // Check for file overwrite protection
      let finalPath = outputPath;
      if (await fs.pathExists(outputPath)) {
        if (options.overwriteProtection === false) {
          // User explicitly disabled protection, overwrite the file
          this.logger.warn(`Overwriting existing file: ${outputPath}`);
        } else if (options.confirmOverwrite && options.onOverwriteConfirm) {
          // Ask for user confirmation
          const shouldOverwrite = await options.onOverwriteConfirm(outputPath);
          if (!shouldOverwrite) {
            // Generate unique filename instead
            finalPath = await this.generateUniqueFilename(outputPath);
            this.logger.info(`Using unique filename to avoid overwrite: ${finalPath}`);
          }
        } else {
          // Default behavior: automatically generate unique filename
          finalPath = await this.generateUniqueFilename(outputPath);
          if (finalPath !== outputPath) {
            this.logger.info(`File exists, using unique filename: ${finalPath}`);
          }
        }
      }
      
      // Export based on format
      if (format === 'jsonl') {
        // Special handling for JSON Lines format
        await exporter.exportAsJsonl([conversation], finalPath, options);
      } else {
        await exporter.export(conversation, finalPath, options);
      }
      
      this.logger.info(`Exported conversation to ${finalPath}`);
      return {
        success: true,
        path: finalPath,
        format: format
      };
    } catch (error) {
      this.logger.error(`Export failed: ${error.message}`);
      if (options.throwOnError === true) {
        throw error;
      }
      return {
        success: false,
        error: error.message,
        path: null,
        format: format
      };
    }
  }

  /**
   * Export multiple conversations
   * @param {Array} conversations - Array of conversations to export
   * @param {string|Object} formatOrOptions - Export format or options object
   * @param {Object} options - Export options (if format is string)
   * @returns {Promise<Object>} Bulk export results
   */
  async exportBulk(conversations, formatOrOptions = 'markdown', options = {}) {
    // Handle both signatures: exportBulk(convs, 'format', options) and exportBulk(convs, options)
    let exportFormat;
    if (typeof formatOrOptions === 'string') {
      exportFormat = formatOrOptions;
    } else {
      options = formatOrOptions;
      exportFormat = options.format || 'markdown';
    }
    
    const results = {
      success: true,
      exported: 0,
      failed: 0,
      paths: []
    };
    
    // Filter conversations if needed
    let filteredConversations = conversations;
    
    if (options.dateRange) {
      filteredConversations = this.filterByDateRange(filteredConversations, options.dateRange);
    }
    
    if (options.minMessageCount) {
      filteredConversations = this.filterByMessageCount(filteredConversations, options.minMessageCount);
    }
    
    // Handle compressed export if requested
    if (options.compressed) {
      return await this.exportCompressed(filteredConversations, exportFormat, options);
    }
    
    // Export each conversation
    for (const conversation of filteredConversations) {
      try {
        const path = await this.export(conversation, exportFormat, { ...options, throwOnError: false });
        
        if (path) {
          results.exported++;
          results.paths.push(path);
        } else {
          results.failed++;
        }
      } catch (error) {
        this.logger.error(`Failed to export conversation ${conversation.id}: ${error.message}`);
        results.failed++;
      }
      
      // Call progress callback if provided
      if (options.onProgress) {
        const progress = {
          current: results.exported + results.failed,
          total: filteredConversations.length,
          percentage: Math.round(((results.exported + results.failed) / filteredConversations.length) * 100)
        };
        options.onProgress(progress);
      }
    }
    
    if (results.failed > 0) {
      results.success = false;
    }
    
    return results;
  }

  /**
   * Export conversations from search results
   * @param {Array} searchResults - Search results to export
   * @param {string|Object} formatOrOptions - Export format or options object
   * @param {Object} options - Export options (if format is string)
   * @returns {Promise<Object>} Export results
   */
  async exportSearchResults(searchResults, formatOrOptions = 'markdown', options = {}) {
    // Extract conversations from search results
    const conversations = searchResults.map(result => result.conversation || result);
    return await this.exportBulk(conversations, formatOrOptions, options);
  }

  /**
   * Export conversations to a compressed archive
   * @param {Array} conversations - Conversations to export
   * @param {string} format - Export format
   * @param {Object} options - Export options
   * @returns {Promise<string>} Path to archive file
   */
  async exportCompressed(conversations, format = 'markdown', options = {}) {
    // Try to import archiver, but handle gracefully if not available
    let archiver;
    try {
      archiver = await import('archiver');
    } catch (error) {
      // archiver is optional dependency
      this.logger.warn('Compression requires archiver package. Falling back to individual exports.');
      
      // Fall back to regular bulk export
      const results = await this.exportBulk(conversations, format, {
        ...options,
        compressed: false
      });
      
      // Return a mock compressed result
      return {
        ...results,
        compressed: false,
        message: 'Archiver not available, exported individual files instead'
      };
    }
    
    const tempDir = path.join(this.outputDir, '.temp_export_' + Date.now());
    await fs.ensureDir(tempDir);
    
    try {
      // Export all conversations to temp directory
      const originalOutputDir = this.outputDir;
      this.outputDir = tempDir;
      
      await this.exportBulk(conversations, format, {
        ...options,
        compressed: false  // Prevent recursion
      });
      
      this.outputDir = originalOutputDir;
      
      // Create archive
      const archivePath = path.join(this.outputDir, `export_${Date.now()}.zip`);
      const output = fs.createWriteStream(archivePath);
      const archive = archiver.default('zip', { zlib: { level: 9 } });
      
      return new Promise((resolve, reject) => {
        output.on('close', () => {
          fs.removeSync(tempDir);
          resolve(archivePath);
        });
        
        archive.on('error', (err) => {
          fs.removeSync(tempDir);
          reject(err);
        });
        
        archive.pipe(output);
        archive.directory(tempDir, false);
        archive.finalize();
      });
    } catch (error) {
      await fs.remove(tempDir);
      throw error;
    }
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
   * @param {number} minCount - Minimum message count
   * @returns {Array} Filtered conversations
   */
  filterByMessageCount(conversations, minCount) {
    return conversations.filter(conv => {
      return conv.messages && conv.messages.length >= minCount;
    });
  }

  /**
   * Generate filename for export
   * @param {Object} conversation - Conversation object
   * @param {string} format - Export format
   * @param {Object} options - Export options
   * @returns {string} Generated filename
   */
  generateFilename(conversation, format, options = {}) {
    let baseName = conversation.name || conversation.id || 'conversation';
    
    // Sanitize filename
    baseName = baseName
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/^\.+/, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 150);
    
    // Add timestamp if requested
    if (options.includeTimestamp) {
      const timestamp = new Date().toISOString().replace(/[:]/g, '-').split('.')[0];
      baseName = `${baseName}_${timestamp}`;
    }
    
    // Add appropriate extension
    const extensions = {
      markdown: '.md',
      md: '.md',
      json: '.json',
      jsonl: '.jsonl',
      html: '.html'
    };
    
    return baseName + (extensions[format] || '.txt');
  }

  /**
   * Generate unique filename to avoid conflicts
   * @param {string} basePath - Base file path
   * @returns {Promise<string>} Unique file path
   */
  async generateUniqueFilename(basePath) {
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
   * Create output directory if it doesn't exist
   * @returns {Promise<void>}
   */
  async ensureOutputDirectory() {
    await fs.ensureDir(this.outputDir);
  }

  /**
   * Handle export errors gracefully
   * @param {Error} error - Error that occurred
   * @param {Object} context - Context information
   * @returns {Object} Error result
   */
  handleExportError(error, context = {}) {
    this.logger.error(`Export error: ${error.message}`, context);
    
    return {
      success: false,
      error: error.message,
      context: context,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validate export options
   * @param {Object} options - Options to validate
   * @returns {Object} Validated options
   */
  validateOptions(options = {}) {
    const validated = { ...options };
    
    // Validate format
    if (validated.format && !this.validateFormat(validated.format)) {
      throw new Error(`Invalid format: ${validated.format}`);
    }
    
    // Validate date range
    if (validated.dateRange) {
      if (validated.dateRange.start) {
        validated.dateRange.start = new Date(validated.dateRange.start);
      }
      if (validated.dateRange.end) {
        validated.dateRange.end = new Date(validated.dateRange.end);
      }
    }
    
    // Validate message count
    if (validated.minMessageCount && validated.minMessageCount < 0) {
      validated.minMessageCount = 0;
    }
    
    return validated;
  }
}

export default ExportManager;
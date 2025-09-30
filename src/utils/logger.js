/**
 * Logger utility for Claude Conversation Extractor
 * Handles both console output and file logging
 */

import { appendFile, readFile, writeFile, mkdir } from 'fs/promises';
import { appendFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

class Logger {
  constructor(options = {}) {
    this.logDir = options.logDir || join(homedir(), '.claude', 'claude_conversations');
    this.logFile = join(this.logDir, 'debug.log');
    this.configFile = join(this.logDir, 'logging.json');
    this.level = options.level || 'INFO';
    // Only output errors to console in production, everything goes to file
    this.enableConsole = options.enableConsole === true; // Default false for clean UI
    this.enableFile = options.enableFile !== false; // Default true
    this.initialized = false;
    
    // Log levels with numeric values for comparison
    this.levels = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
      OFF: 999
    };
    
    // Initialize on first use
    this.initPromise = this.initialize();
  }
  
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Ensure log directory exists
      if (!existsSync(this.logDir)) {
        await mkdir(this.logDir, { recursive: true });
      }
      
      // Load config if it exists
      if (existsSync(this.configFile)) {
        const config = JSON.parse(await readFile(this.configFile, 'utf-8'));
        this.level = config.level || this.level;
      }
      
      // Start new log session
      if (this.enableFile) {
        const sessionHeader = `\n=== Debug Log Started: ${new Date().toISOString()} ===\n=== Log Level: ${this.level} ===\n`;
        await appendFile(this.logFile, sessionHeader);
      }
      
      this.initialized = true;
    } catch (error) {
      // Fallback to console only if file system fails
      this.enableFile = false;
      console.warn('Logger: Could not initialize file logging:', error.message);
    }
  }
  
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initPromise;
    }
  }
  
  shouldLog(level) {
    const requestedLevel = this.levels[level.toUpperCase()] || 999;
    const currentLevel = this.levels[this.level.toUpperCase()] || 1;
    return requestedLevel >= currentLevel;
  }
  
  formatMessage(level, message, context) {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level}] ${message}${contextStr}`;
  }
  
  async writeToFile(formattedMessage) {
    if (!this.enableFile) return;
    
    try {
      await this.ensureInitialized();
      await appendFile(this.logFile, formattedMessage + '\n');
    } catch (error) {
      // Silently fail file writes to avoid disrupting the app
      if (this.enableConsole) {
        console.warn('Logger: Could not write to file:', error.message);
      }
    }
  }
  
  async log(level, message, context) {
    if (!this.shouldLog(level)) return;
    
    const formattedMessage = this.formatMessage(level, message, context);
    
    // Write to console if enabled
    if (this.enableConsole) {
      const consoleMethod = level === 'ERROR' ? 'error' : 
        level === 'WARN' ? 'warn' : 
          level === 'DEBUG' ? 'debug' : 'log';
      // Format message with context for console
      const consoleMessage = context ? `${message} | ${JSON.stringify(context)}` : message;
      console[consoleMethod](consoleMessage);
    }
    
    // Write to file if enabled
    await this.writeToFile(formattedMessage);
  }
  
  async debug(message, context) {
    await this.log('DEBUG', message, context);
  }
  
  async info(message, context) {
    await this.log('INFO', message, context);
  }
  
  async warn(message, context) {
    await this.log('WARN', message, context);
  }
  
  async error(message, context) {
    await this.log('ERROR', message, context);
  }
  
  // Synchronous versions for compatibility (queue writes)
  debugSync(message, context) {
    this.log('DEBUG', message, context).catch(() => {});
  }
  
  infoSync(message, context) {
    this.log('INFO', message, context).catch(() => {});
  }
  
  warnSync(message, context) {
    this.log('WARN', message, context).catch(() => {});
  }
  
  errorSync(message, context) {
    this.log('ERROR', message, context).catch(() => {});
  }
  
  // Truly synchronous error logging for crashes
  errorSyncImmediate(message, context) {
    if (!this.shouldLog('ERROR')) return;
    
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
    const formattedMessage = `[${timestamp}] [ERROR] ${message}${contextStr}\n`;
    
    // Write to console immediately
    console.error(message, context || '');
    
    // Write to file synchronously (blocking)
    if (this.enableFile) {
      try {
        appendFileSync(this.logFile, formattedMessage);
      } catch (error) {
        console.error('Failed to write to log file:', error);
      }
    }
  }
  
  // Update log level
  async setLevel(level) {
    this.level = level.toUpperCase();
    
    // Update config file
    try {
      const config = {
        level: this.level,
        description: 'Logging configuration for Claude Conversation Extractor',
        availableLevels: [
          'DEBUG - All diagnostic information (very verbose)',
          'INFO - Important events and filter operations (default)',
          'WARN - Warnings only',
          'ERROR - Errors only',
          'OFF - No logging'
        ]
      };
      await writeFile(this.configFile, JSON.stringify(config, null, 2));
    } catch (error) {
      console.warn('Logger: Could not update config:', error.message);
    }
  }
}

// Create singleton instance
let loggerInstance = null;

export function getLogger(options) {
  if (!loggerInstance) {
    loggerInstance = new Logger(options);
  }
  return loggerInstance;
}

// Create a default logger for backward compatibility
export const logger = getLogger();

export default Logger;
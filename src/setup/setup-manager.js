import { readFile, writeFile, mkdir, readdir, stat, access } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class SetupManager {
  constructor() {
    this.configDir = join(homedir(), '.claude', 'claude_conversations');
    this.configPath = join(this.configDir, 'setup.json');
    this.exportDir = join(homedir(), '.claude', 'claude_conversations');
    this.indexPath = join(this.configDir, 'search-index.json');
    this.conversationsPath = join(homedir(), '.claude', 'projects');
  }

  async ensureConfigDir() {
    try {
      await access(this.configDir);
    } catch {
      await mkdir(this.configDir, { recursive: true });
    }
  }

  async loadConfig() {
    try {
      await this.ensureConfigDir();
      const content = await readFile(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return this.getDefaultConfig();
    }
  }

  async saveConfig(config) {
    await this.ensureConfigDir();
    await writeFile(this.configPath, JSON.stringify(config, null, 2));
  }

  getDefaultConfig() {
    return {
      version: '2.0',
      setupComplete: false,
      extractedAll: false,
      extractedCount: 0,
      extractedDate: null,
      indexBuilt: false,
      indexVersion: '2.0',
      indexLastBuilt: null,
      conversationsIndexed: 0,
      exportLocation: this.exportDir,
      searchPreferences: {
        minRelevanceThreshold: 0.05,
        maxResults: 20,
        enableWordHighlighting: true,
        contextWords: 35
      },
      performanceStats: {
        avgSearchTime: null,
        totalSearches: 0,
        lastOptimized: null
      }
    };
  }

  async findAllConversations() {
    const conversations = [];
    
    try {
      const projects = await readdir(this.conversationsPath);
      
      for (const project of projects) {
        const projectPath = join(this.conversationsPath, project);
        const projectStat = await stat(projectPath);
        
        if (projectStat.isDirectory()) {
          // First check for conversations subdirectory
          const conversationsDir = join(projectPath, 'conversations');
          
          try {
            const conversationFiles = await readdir(conversationsDir);
            
            for (const file of conversationFiles) {
              if (file.endsWith('.jsonl')) {
                const conversationPath = join(conversationsDir, file);
                const fileStat = await stat(conversationPath);
                
                conversations.push({
                  project,
                  file,
                  path: conversationPath,
                  modified: fileStat.mtime,
                  size: fileStat.size
                });
              }
            }
          } catch (err) {
            // If no conversations subdirectory, check project directory directly
            try {
              const files = await readdir(projectPath);
              
              for (const file of files) {
                if (file.endsWith('.jsonl')) {
                  const conversationPath = join(projectPath, file);
                  const fileStat = await stat(conversationPath);
                  
                  conversations.push({
                    project,
                    file,
                    path: conversationPath,
                    modified: fileStat.mtime,
                    size: fileStat.size
                  });
                }
              }
            } catch (err2) {
              // Skip if can't read directory
            }
          }
        }
      }
    } catch (err) {
      console.error('Error finding conversations:', err.message);
    }
    
    return conversations;
  }

  async scanExportDirectory() {
    const exportedFiles = [];
    
    try {
      await access(this.exportDir);
      const files = await readdir(this.exportDir);
      
      for (const file of files) {
        // Only count conversation exports, not setup files
        if ((file.endsWith('.md') || file.endsWith('.json') || file.endsWith('.html')) && 
            file !== 'setup.json' && file !== 'search-index.json') {
          const filePath = join(this.exportDir, file);
          const fileStat = await stat(filePath);
          
          exportedFiles.push({
            name: file,
            path: filePath,
            modified: fileStat.mtime,
            size: fileStat.size
          });
        }
      }
    } catch {
      // Export directory doesn't exist yet
    }
    
    return exportedFiles;
  }

  async checkIndexFile() {
    try {
      await access(this.indexPath);
      const indexStat = await stat(this.indexPath);
      return indexStat.size > 0;
    } catch {
      return false;
    }
  }

  isIndexOutdated(config, conversations) {
    if (!config.indexLastBuilt) return true;
    
    const indexDate = new Date(config.indexLastBuilt);
    
    // Check if any conversation is newer than the index
    for (const conversation of conversations) {
      if (conversation.modified > indexDate) {
        return true;
      }
    }
    
    // Check if conversation count changed significantly (allow for some filtering)
    const indexedRatio = config.conversationsIndexed / conversations.length;
    if (indexedRatio < 0.8) { // Allow up to 20% of conversations to be filtered out
      return true;
    }
    
    return false;
  }

  async getSetupStatus() {
    const config = await this.loadConfig();
    const conversations = await this.findAllConversations();
    const exportedFiles = await this.scanExportDirectory();
    const indexExists = await this.checkIndexFile();
    
    const isIndexOutdated = this.isIndexOutdated(config, conversations);
    
    return {
      isFirstTime: !config.setupComplete,
      needsSetup: !config.setupComplete || !config.extractedAll || !config.indexBuilt || isIndexOutdated,
      needsExtraction: !config.extractedAll || exportedFiles.length < conversations.length,
      needsIndexing: !config.indexBuilt || !indexExists || isIndexOutdated,
      extractedAll: config.extractedAll && exportedFiles.length >= conversations.length,
      indexBuilt: config.indexBuilt && indexExists && !isIndexOutdated,
      indexOutdated: isIndexOutdated,
      conversationCount: conversations.length,
      extractedCount: exportedFiles.length,
      exportLocation: config.exportLocation,
      lastExtractDate: config.extractedDate,
      indexLastBuilt: config.indexLastBuilt,
      conversations,
      exportedFiles,
      config
    };
  }

  async markExtractComplete(extractedCount) {
    const config = await this.loadConfig();
    config.extractedAll = true;
    config.extractedCount = extractedCount;
    config.extractedDate = new Date().toISOString();
    await this.saveConfig(config);
  }

  async markIndexComplete(indexedCount) {
    const config = await this.loadConfig();
    config.indexBuilt = true;
    config.conversationsIndexed = indexedCount;
    config.indexLastBuilt = new Date().toISOString();
    await this.saveConfig(config);
  }

  async markSetupComplete() {
    const config = await this.loadConfig();
    config.setupComplete = true;
    await this.saveConfig(config);
  }

  async updateExportLocation(newLocation) {
    const config = await this.loadConfig();
    config.exportLocation = newLocation;
    await this.saveConfig(config);
    this.exportDir = newLocation;
  }

  async recordSearchPerformance(searchTime) {
    const config = await this.loadConfig();
    
    if (!config.performanceStats.avgSearchTime) {
      config.performanceStats.avgSearchTime = searchTime;
    } else {
      // Running average
      const totalTime = config.performanceStats.avgSearchTime * config.performanceStats.totalSearches;
      config.performanceStats.avgSearchTime = (totalTime + searchTime) / (config.performanceStats.totalSearches + 1);
    }
    
    config.performanceStats.totalSearches++;
    config.performanceStats.lastOptimized = new Date().toISOString();
    
    await this.saveConfig(config);
  }
}
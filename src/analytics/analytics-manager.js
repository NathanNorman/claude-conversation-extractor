/**
 * Analytics Manager
 *
 * Central orchestrator for analytics computation and caching.
 * Handles cache I/O, invalidation, and coordination between analyzers.
 */

import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { createEmptyCache, validateCache, migrateCache, CACHE_VERSION } from './cache/schema.js';
import { analyzeKeywords } from './analyzers/keyword-analyzer.js';

export class AnalyticsManager {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || join(homedir(), '.claude', 'claude_conversations');
    this.cachePath = join(this.cacheDir, 'analytics-cache.json');
    this.projectsDir = options.projectsDir || join(homedir(), '.claude', 'projects');
    this.logger = options.logger || console;
    this.cache = null;
  }

  /**
   * Initialize the analytics manager
   */
  async initialize() {
    await this.ensureCacheDir();
    this.cache = await this.loadCache();
    return this;
  }

  /**
   * Ensure cache directory exists
   */
  async ensureCacheDir() {
    try {
      await mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw new Error(`Failed to create cache directory: ${error.message}`);
      }
    }
  }

  /**
   * Load cache from disk
   * @returns {Object} Analytics cache object
   */
  async loadCache() {
    try {
      const data = await readFile(this.cachePath, 'utf8');
      const cache = JSON.parse(data);

      // Validate cache
      const validation = validateCache(cache);
      if (!validation.valid) {
        this.logger.warn('Cache validation failed:', validation.errors);
        this.logger.warn('Creating new cache...');
        return createEmptyCache();
      }

      // Migrate if needed
      if (cache.version !== CACHE_VERSION) {
        this.logger.info(`Migrating cache from version ${cache.version} to ${CACHE_VERSION}`);
        return migrateCache(cache);
      }

      return cache;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Cache doesn't exist yet
        return createEmptyCache();
      }
      this.logger.error('Failed to load cache:', error.message);
      return createEmptyCache();
    }
  }

  /**
   * Save cache to disk
   * @param {Object} cache - Cache object to save
   */
  async saveCache(cache = null) {
    const dataToSave = cache || this.cache;
    if (!dataToSave) {
      throw new Error('No cache to save');
    }

    // Update timestamp
    dataToSave.lastUpdated = new Date().toISOString();

    // Validate before saving
    const validation = validateCache(dataToSave);
    if (!validation.valid) {
      throw new Error(`Cache validation failed: ${validation.errors.join(', ')}`);
    }

    try {
      const data = JSON.stringify(dataToSave, null, 2);
      await writeFile(this.cachePath, data, 'utf8');
      this.cache = dataToSave;
    } catch (error) {
      throw new Error(`Failed to save cache: ${error.message}`);
    }
  }

  /**
   * Get current cache
   * @returns {Object} Current analytics cache
   */
  getCache() {
    return this.cache || createEmptyCache();
  }

  /**
   * Check if cache exists
   * @returns {boolean} True if cache file exists
   */
  async cacheExists() {
    try {
      await stat(this.cachePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if cache needs rebuilding
   * @returns {boolean} True if cache is outdated or missing
   */
  async needsRebuild() {
    if (!await this.cacheExists()) {
      return true;
    }

    if (!this.cache) {
      this.cache = await this.loadCache();
    }

    // Check if we have a lastAnalyzedTimestamp
    if (!this.cache.lastAnalyzedTimestamp) {
      return true;
    }

    // Check if any JSONL files are newer than cache
    const cacheTime = new Date(this.cache.lastAnalyzedTimestamp).getTime();
    return await this.hasNewerConversations(cacheTime);
  }

  /**
   * Check if there are conversations newer than the given timestamp
   * @param {number} _timestamp - Timestamp to compare against (unused - simplified implementation)
   * @returns {boolean} True if newer conversations exist
   */
  async hasNewerConversations(_timestamp) {
    // This will be implemented when we add conversation discovery
    // For now, assume we need rebuild if cache is older than 24 hours
    if (!this.cache || !this.cache.lastAnalyzedTimestamp) {
      return true;
    }

    const cacheAge = Date.now() - new Date(this.cache.lastAnalyzedTimestamp).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;

    return cacheAge > oneDayMs;
  }

  /**
   * Force refresh cache by deleting it
   */
  async forceRefresh() {
    this.cache = createEmptyCache();
    await this.saveCache();
  }

  /**
   * Get quick stats (fast access to key metrics)
   * @returns {Object} Quick stats object
   */
  getQuickStats() {
    const cache = this.getCache();
    return {
      totalConversations: cache.overview?.totalConversations || 0,
      totalMessages: cache.overview?.totalMessages || 0,
      streaks: cache.timePatterns?.streaks || { current: 0, longest: 0 },
      mostUsedTool: this.getMostUsedTool(cache),
      lastActivity: cache.overview?.dateRange?.last || null
    };
  }

  /**
   * Get most used tool from cache
   * @param {Object} cache - Analytics cache
   * @returns {string|null} Most used tool name
   */
  getMostUsedTool(cache) {
    if (!cache.toolUsage?.byTool) {
      return null;
    }

    const tools = cache.toolUsage.byTool;
    const entries = Object.entries(tools);
    if (entries.length === 0) {
      return null;
    }

    const sorted = entries.sort((a, b) => b[1] - a[1]);
    return sorted[0][0];
  }

  /**
   * Update analytics after extraction
   * This is called after bulk extraction to refresh the cache
   */
  async updateAfterExtraction() {
    // Mark that we need a rebuild by clearing the timestamp
    // This triggers a full recomputation on next analytics view
    if (this.cache) {
      this.cache.lastAnalyzedTimestamp = null;
      await this.saveCache();
    }
  }

  /**
   * Record a search operation
   * @param {Object} searchData - Search metadata
   */
  async recordSearch(searchData) {
    if (!this.cache) {
      this.cache = await this.loadCache();
    }

    // Update search patterns
    const patterns = this.cache.searchPatterns;
    patterns.totalSearches += 1;

    // Update average search time
    const prevTotal = patterns.avgSearchTime * (patterns.totalSearches - 1);
    patterns.avgSearchTime = (prevTotal + searchData.time) / patterns.totalSearches;

    // Save updated cache
    await this.saveCache();
  }

  /**
   * Compute analytics from scratch or incrementally
   * @param {Object} options - Computation options
   * @param {boolean} options.force - Force full recomputation
   * @param {boolean} options.incremental - Use incremental update (only new conversations)
   * @param {Object} options.dateRange - Date range filter {from: Date, to: Date}
   * @param {Function} options.progressCallback - Progress callback function
   * @returns {Promise<Object>} Updated cache
   */
  async computeAnalytics(options = {}) {
    const {
      force = false,
      incremental = false,
      dateRange: _dateRange = null, // Reserved for future date filtering
      progressCallback = null
    } = options;

    // Load cache if not already loaded
    if (!this.cache) {
      this.cache = await this.loadCache();
    }

    // Import analyzer
    const { analyzeAllConversations, updateCacheWithAnalysis } = await import('./analyzers/conversation-analyzer.js');

    // Determine filtering:
    // 1. If force or no cache, analyze all conversations
    // 2. If incremental, only analyze since last timestamp
    // 3. If dateRange provided, filter by that range
    const sinceTimestamp = (force || !incremental) ? null : this.cache.lastAnalyzedTimestamp;

    if (progressCallback) {
      progressCallback('Discovering conversations...');
    }

    // Run analysis
    const analysis = await analyzeAllConversations(this.projectsDir, sinceTimestamp);

    if (progressCallback) {
      progressCallback(`Analyzing ${analysis.analyzedConversations} conversations...`);
    }

    // Update cache with results
    await updateCacheWithAnalysis(this.cache, analysis);

    // Compute keyword analytics
    if (progressCallback) {
      progressCallback('Analyzing keywords...');
    }

    try {
      // Load search engine to get conversations with keywords
      const { MiniSearchEngine } = await import('../search/minisearch-engine.js');
      const searchEngine = new MiniSearchEngine();
      const loaded = await searchEngine.loadIndex();

      if (loaded) {
        const conversationsWithKeywords = Array.from(searchEngine.conversationData.values());
        const keywordAnalytics = analyzeKeywords(conversationsWithKeywords);

        // Add to cache
        this.cache.keywords = keywordAnalytics;
      } else {
        // No index available
        this.cache.keywords = null;
      }
    } catch (error) {
      // Keyword analytics failed - don't block other analytics
      this.logger.warn('Keyword analysis failed:', error.message);
      this.cache.keywords = null;
    }

    if (progressCallback) {
      progressCallback('Saving analytics cache...');
    }

    // Save updated cache
    await this.saveCache();

    if (progressCallback) {
      progressCallback('Analytics computation complete');
    }

    return this.cache;
  }
}

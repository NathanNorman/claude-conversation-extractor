/**
 * Content Analyzer
 *
 * Analyzes code blocks, languages, and frameworks mentioned in conversations.
 * Provides insights into what technologies are being discussed/used.
 */

import { extractCodeBlocks, detectFrameworks } from './tool-parser.js';

/**
 * Analyze content from conversations
 * @param {Array<Object>} conversations - Parsed conversations with messages
 * @returns {Object} Content analysis
 */
export function analyzeContent(conversations) {
  if (!conversations || conversations.length === 0) {
    return createEmptyContentAnalysis();
  }

  let totalCodeBlocks = 0;
  const languages = {};
  const frameworks = {};
  let totalUserChars = 0;
  let totalAssistantChars = 0;
  let userMessageCount = 0;
  let assistantMessageCount = 0;
  const fileEdits = new Map(); // Track files mentioned in Edit/Write operations

  // Process each conversation
  for (const conv of conversations) {
    if (!conv.messages) continue;

    for (const msg of conv.messages) {
      // Track message lengths
      const contentLength = getContentLength(msg.content);

      if (msg.role === 'user') {
        totalUserChars += contentLength;
        userMessageCount++;
      } else if (msg.role === 'assistant') {
        totalAssistantChars += contentLength;
        assistantMessageCount++;
      }

      // Extract code blocks
      const codeBlocks = extractCodeBlocks(msg);
      totalCodeBlocks += codeBlocks.length;

      for (const block of codeBlocks) {
        languages[block.language] = (languages[block.language] || 0) + 1;
      }

      // Detect frameworks
      const content = getContentString(msg.content);
      const detectedFrameworks = detectFrameworks(content);

      for (const [framework, count] of Object.entries(detectedFrameworks)) {
        frameworks[framework] = (frameworks[framework] || 0) + count;
      }

      // Track file edits (simplified - would need tool result parsing)
      const filePaths = extractFilePaths(content);
      for (const path of filePaths) {
        fileEdits.set(path, (fileEdits.get(path) || 0) + 1);
      }
    }
  }

  // Calculate averages
  const avgUserLength = userMessageCount > 0 ? totalUserChars / userMessageCount : 0;
  const avgAssistantLength = assistantMessageCount > 0 ? totalAssistantChars / assistantMessageCount : 0;

  // Calculate code-to-text ratio
  const totalChars = totalUserChars + totalAssistantChars;
  const estimatedCodeChars = totalCodeBlocks * 100; // Rough estimate
  const codeToTextRatio = totalChars > 0 ? estimatedCodeChars / totalChars : 0;

  // Get most edited files
  const mostEditedFiles = Array.from(fileEdits.entries())
    .map(([path, count]) => ({ path, editCount: count }))
    .sort((a, b) => b.editCount - a.editCount)
    .slice(0, 10);

  return {
    totalCodeBlocks,
    languages,
    frameworks,
    avgMessageLength: {
      user: Math.round(avgUserLength),
      assistant: Math.round(avgAssistantLength)
    },
    codeToTextRatio: parseFloat(codeToTextRatio.toFixed(3)),
    mostEditedFiles
  };
}

/**
 * Get content length from various content formats
 * @param {*} content - Content in various formats
 * @returns {number} Character count
 */
function getContentLength(content) {
  if (!content) return 0;

  if (typeof content === 'string') {
    return content.length;
  }

  if (Array.isArray(content)) {
    return content.reduce((sum, block) => {
      if (block.type === 'text' && block.text) {
        return sum + block.text.length;
      }
      return sum;
    }, 0);
  }

  return 0;
}

/**
 * Get content as string from various formats
 * @param {*} content - Content in various formats
 * @returns {string} Content as string
 */
function getContentString(content) {
  if (!content) return '';

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter(block => block.type === 'text' && block.text)
      .map(block => block.text)
      .join('\n');
  }

  return '';
}

/**
 * Extract file paths from content
 * @param {string} content - Text content
 * @returns {Array<string>} File paths found
 */
function extractFilePaths(content) {
  if (!content) return [];

  const paths = [];

  // Match common file path patterns
  // Look for: src/path/to/file.ext or /absolute/path/file.ext
  const pathPattern = /(?:src\/|\.\/|\/)[a-zA-Z0-9_\-/.]+\.[a-zA-Z0-9]+/g;
  const matches = content.match(pathPattern);

  if (matches) {
    for (const match of matches) {
      // Clean up and normalize
      const cleaned = match.replace(/^\.\//, '');
      paths.push(cleaned);
    }
  }

  return [...new Set(paths)]; // Remove duplicates
}

/**
 * Create empty content analysis structure
 * @returns {Object} Empty content analysis
 */
function createEmptyContentAnalysis() {
  return {
    totalCodeBlocks: 0,
    languages: {},
    frameworks: {},
    avgMessageLength: {
      user: 0,
      assistant: 0
    },
    codeToTextRatio: 0,
    mostEditedFiles: []
  };
}

/**
 * Update cache with content analysis
 * @param {Object} cache - Analytics cache
 * @param {Object} contentAnalysis - Content analysis results
 */
export function updateCacheWithContentAnalysis(cache, contentAnalysis) {
  cache.contentAnalysis = contentAnalysis;
  return cache;
}

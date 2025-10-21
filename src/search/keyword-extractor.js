/**
 * Keyword Extractor
 *
 * Uses TF-IDF (Term Frequency-Inverse Document Frequency) to extract
 * the most important keywords from conversations. TF-IDF identifies
 * words that are frequent in specific documents but rare across the corpus.
 */

/**
 * PROPERTY NAMING CONVENTION:
 *
 * Throughout this codebase, keyword data appears in multiple formats:
 *
 * 1. IN MINISEARCH INDEX DOCUMENTS (for search):
 *    - keywords: string (space-separated terms)
 *      Example: 'typescript debugging api authentication'
 *    - keywordList: array of {term, score} objects (stored field)
 *      Example: [{term: 'typescript', score: 0.95}, ...]
 *
 * 2. IN CONVERSATIONDATA MAP (for display/filtering):
 *    - keywords: array of {term, score} objects
 *      Example: [{term: 'typescript', score: 0.95}, ...]
 *    - keywordString: string (space-separated, for backwards compat)
 *      Example: 'typescript debugging api'
 *
 * 3. IN EXPORTED FILES:
 *    - Markdown: Comma-separated string
 *    - JSON: Array of {term, score} objects
 *    - HTML: Array of {term, score} rendered as badges
 *
 * WHY TWO FORMATS?
 * - String format: MiniSearch requires strings for full-text indexing
 * - Array format: Preserves scores, allows filtering/sorting
 *
 * WHEN ACCESSING KEYWORDS:
 * - Always check format: typeof k === 'string' ? k : k.term
 * - conversationData.keywords = always array
 * - MiniSearch document.keywords = always string
 */

import natural from 'natural';

const { TfIdf, WordTokenizer } = natural;

// Common stopwords to filter out (expanded list)
const STOPWORDS = new Set([
  // Articles & Determiners
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  // Pronouns
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
  // Prepositions
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'over',
  // Conjunctions
  'and', 'but', 'or', 'nor', 'so', 'yet', 'because', 'although', 'unless', 'since', 'if',
  // Auxiliary verbs
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could',
  // Common verbs
  'get', 'got', 'getting', 'go', 'going', 'went', 'gone', 'make', 'making', 'made',
  'take', 'taking', 'took', 'taken', 'come', 'coming', 'came',
  // Other common words
  'just', 'also', 'then', 'than', 'now', 'very', 'too', 'there', 'here', 'where',
  'when', 'how', 'what', 'who', 'which', 'why', 'all', 'some', 'any', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'another', 'such', 'no', 'not', 'only', 'own',
  'same', 'then', 'than', 'so', 'can', 'will', 'way', 'out', 'use', 'used', 'using',
  // Conversation-specific stopwords
  'like', 'know', 'need', 'want', 'see', 'think', 'sure', 'okay', 'ok', 'yes', 'no',
  'please', 'thanks', 'thank', 'hi', 'hello', 'hey',
  // Code-related stopwords (too generic)
  'function', 'const', 'let', 'var', 'return', 'import', 'export', 'class', 'new',
  // Common meta words about conversations themselves (not useful as keywords)
  'conversation', 'conversations', 'message', 'messages', 'chat', 'response', 'question', 'answer',
  // Claude Code specific meta-words (about the tool, not conversation content)
  'skill', 'skills', 'hook', 'hooks', 'command', 'commands', 'tool', 'tools', 'agent', 'agents',
  'file', 'files', 'code', 'line', 'lines', 'error', 'errors',
  // Common junk terms
  'oct', 'www', 'am', 'pm', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'nov', 'dec'
]);

// Patterns to identify and filter code syntax
const CODE_PATTERNS = [
  /^[{}[\]()<>]+$/,           // Only brackets/braces
  /^[=+\-*/!&|%^~]+$/,             // Only operators
  /^[;:,.]+$/,                    // Only punctuation
  /^\d+$/,                         // Only numbers
  /^[_-]+$/,                      // Only underscores/hyphens
  /^https?:\/\//,                  // URLs
  /^[a-f0-9]{8,}$/,                // Hex IDs (likely UUIDs)
  /^[A-Z_][A-Z0-9_]+$/,            // CONSTANT_NAMES (often not meaningful)
  /^\d+[a-z]+$/,                   // Numbers with letters (34m, 50am, 8gb, 255mb, 10pm)
  /^[a-z]+\d+[a-z]*$/              // Letters with numbers (m34, s12, gb8, mb255)
];

/**
 * Check if a term should be filtered out
 */
function shouldFilterTerm(term) {
  const normalized = term.toLowerCase();

  // Filter stopwords
  if (STOPWORDS.has(normalized)) {
    return true;
  }

  // Filter very short terms (< 3 chars) unless they're common acronyms
  if (term.length < 3) {
    // Allow common tech acronyms
    const acronyms = new Set(['ai', 'ml', 'ui', 'ux', 'db', 'os', 'js', 'ts', 'py', 'go', 'ci', 'cd', 'qa']);
    if (!acronyms.has(normalized)) {
      return true;
    }
  }

  // Filter code syntax patterns
  for (const pattern of CODE_PATTERNS) {
    if (pattern.test(term)) {
      return true;
    }
  }

  return false;
}

/**
 * KeywordExtractor
 *
 * Builds a TF-IDF model from a corpus of conversations and extracts
 * the most relevant keywords from each one.
 */
export class KeywordExtractor {
  constructor(options = {}) {
    this.tfidf = new TfIdf();
    this.tokenizer = new WordTokenizer();
    this.logger = options.logger || console;
    this.conversationCount = 0;
    this.corpusBuilt = false;
  }

  /**
   * Build the TF-IDF corpus from all conversations
   * This must be called before extracting keywords
   */
  buildCorpus(conversations) {
    this.logger.info(`Building TF-IDF corpus from ${conversations.length} conversations...`);

    for (const conv of conversations) {
      const text = conv.fullText || conv.content || conv.preview || '';

      // Skip empty conversations
      if (!text || text.trim().length === 0) {
        continue;
      }

      // Tokenize and filter
      const tokens = this.tokenizeAndFilter(text);

      // Add to TF-IDF corpus
      this.tfidf.addDocument(tokens);
      this.conversationCount++;
    }

    this.corpusBuilt = true;
    this.logger.info(`Corpus built with ${this.conversationCount} conversations`);

    return this.conversationCount;
  }

  /**
   * Tokenize text and filter out stopwords and code syntax
   * NOTE: Stemming disabled - it made keywords unreadable (migrate→migrat, story→stori)
   */
  tokenizeAndFilter(text) {
    // Tokenize
    const tokens = this.tokenizer.tokenize(text.toLowerCase());

    // Filter out stopwords and code syntax
    // Stemming is NOT applied - it made keywords too ugly
    const filtered = tokens.filter(token => !shouldFilterTerm(token));

    return filtered;
  }

  /**
   * Extract top N keywords from a conversation
   *
   * @param {string} text - The conversation text
   * @param {number} count - Number of keywords to extract (default: 10)
   * @param {number} documentIndex - Index of document in corpus (for TF-IDF)
   * @returns {Array<{term: string, score: number}>} - Top keywords with scores
   */
  extractKeywords(text, count = 10, documentIndex = 0) {
    if (!this.corpusBuilt) {
      throw new Error('Corpus not built. Call buildCorpus() first.');
    }

    // Tokenize and filter
    const tokens = this.tokenizeAndFilter(text);

    if (tokens.length === 0) {
      return [];
    }

    // Get all terms with their TF-IDF scores
    const terms = this.tfidf.listTerms(documentIndex);

    // Filter and sort by score
    const keywords = terms
      .filter(item => !shouldFilterTerm(item.term))
      .filter(item => item.tfidf > 0)
      .sort((a, b) => b.tfidf - a.tfidf)
      .slice(0, count)
      .map(item => ({
        term: item.term,
        score: Math.round(item.tfidf * 100) / 100  // Round to 2 decimals
      }));

    return keywords;
  }

  /**
   * Extract keywords for a specific conversation with metadata
   *
   * @param {object} conversation - Conversation object with fullText
   * @param {number} documentIndex - Index in corpus
   * @param {number} count - Number of keywords
   * @returns {object} - Conversation with keywords added
   */
  extractForConversation(conversation, documentIndex, count = 10) {
    const text = conversation.fullText || conversation.content || conversation.preview || '';

    const keywords = this.extractKeywords(text, count, documentIndex);

    return {
      ...conversation,
      keywords,
      keywordString: keywords.map(k => k.term).join(' ')  // For search indexing
    };
  }

  /**
   * Batch process all conversations and extract keywords
   * Returns array of conversations with keywords attached
   *
   * @param {Array} conversations - Array of conversation objects
   * @param {number} keywordCount - Number of keywords per conversation
   * @returns {Array} - Conversations with keywords
   */
  getBulkKeywords(conversations, keywordCount = 10) {
    if (!this.corpusBuilt) {
      this.buildCorpus(conversations);
    }

    const results = [];
    let validIndex = 0;  // Track only non-empty conversations

    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i];
      const text = conv.fullText || conv.content || conv.preview || '';

      // Skip empty conversations
      if (!text || text.trim().length === 0) {
        results.push({
          ...conv,
          keywords: [],
          keywordString: ''
        });
        continue;
      }

      // Extract keywords using the valid index in TF-IDF corpus
      const keywords = this.extractKeywords(text, keywordCount, validIndex);

      results.push({
        ...conv,
        keywords,
        keywordString: keywords.map(k => k.term).join(' ')
      });

      validIndex++;
    }

    return results;
  }

  /**
   * Get statistics about keyword extraction
   */
  getStats() {
    return {
      conversationsProcessed: this.conversationCount,
      corpusBuilt: this.corpusBuilt
    };
  }
}

export default KeywordExtractor;

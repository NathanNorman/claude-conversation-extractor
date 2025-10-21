/**
 * Keyword Analytics Analyzer
 * Core engine for processing keyword data across all conversations
 * Pure data processing module with no UI dependencies
 */

/**
 * Analyzes keyword data across conversations
 * Generates comprehensive analytics including trends, co-occurrences, and project breakdowns
 *
 * @param {Array<Object>} conversations - Array of conversation objects with keywords
 * @param {Array<Object>} conversations[].keywords - Array of keyword objects or strings
 * @param {string} conversations[].project - Project identifier
 * @param {string} conversations[].modified - ISO date string
 * @returns {Object} Analytics object with summary, topKeywords, byProject, pairs, trends, rare
 */
export function analyzeKeywords(conversations) {
  if (!Array.isArray(conversations) || conversations.length === 0) {
    return buildEmptyAnalytics();
  }

  const keywordFrequency = new Map();
  const projectKeywords = new Map();
  const keywordPairs = new Map();
  const timeline = new Map();

  let conversationsWithKeywords = 0;

  conversations.forEach((conv) => {
    const keywords = extractKeywords(conv.keywords);

    if (keywords.length === 0) {
      return;
    }

    conversationsWithKeywords += 1;

    const convDate = conv.modified ? new Date(conv.modified) : null;
    const monthKey = convDate
      ? convDate.getFullYear() + '-' + String(convDate.getMonth() + 1).padStart(2, '0')
      : null;

    keywords.forEach((keyword) => {
      keywordFrequency.set(keyword, (keywordFrequency.get(keyword) || 0) + 1);

      if (conv.project) {
        if (!projectKeywords.has(conv.project)) {
          projectKeywords.set(conv.project, new Map());
        }
        const projMap = projectKeywords.get(conv.project);
        projMap.set(keyword, (projMap.get(keyword) || 0) + 1);
      }

      if (monthKey) {
        if (!timeline.has(monthKey)) {
          timeline.set(monthKey, new Map());
        }
        const monthMap = timeline.get(monthKey);
        monthMap.set(keyword, (monthMap.get(keyword) || 0) + 1);
      }
    });

    if (keywords.length >= 2) {
      for (let i = 0; i < keywords.length; i++) {
        for (let j = i + 1; j < keywords.length; j++) {
          const k1 = keywords[i];
          const k2 = keywords[j];
          const pairKey = [k1, k2].sort().join(' + ');
          keywordPairs.set(pairKey, (keywordPairs.get(pairKey) || 0) + 1);
        }
      }
    }
  });

  const summary = {
    totalConversations: conversations.length,
    conversationsWithKeywords,
    uniqueKeywords: keywordFrequency.size,
    coveragePercentage: Math.round(
      (conversationsWithKeywords / Math.max(1, conversations.length)) * 100
    )
  };

  const topKeywords = buildTopKeywords(keywordFrequency);
  const topKeywordsByProject = buildTopKeywordsByProject(projectKeywords);
  const topKeywordPairs = buildTopKeywordPairs(keywordPairs);
  const trends = calculateKeywordTrends(timeline, topKeywords);
  const rareKeywords = buildRareKeywords(keywordFrequency);

  return {
    summary,
    topKeywords,
    topKeywordsByProject,
    topKeywordPairs,
    trends,
    rareKeywords
  };
}

/**
 * Extracts keywords from various formats
 * Handles both string and object formats, filters empty values
 */
function extractKeywords(keywords) {
  if (!Array.isArray(keywords)) {
    return [];
  }

  return keywords
    .map((k) => {
      if (typeof k === 'string') {
        return k.trim().toLowerCase();
      }
      if (typeof k === 'object' && k !== null && k.term) {
        return String(k.term).trim().toLowerCase();
      }
      return null;
    })
    .filter((k) => k && k.length > 0);
}

/**
 * Builds top keywords list sorted by frequency (top 30)
 */
function buildTopKeywords(keywordFrequency) {
  const totalOccurrences = Array.from(keywordFrequency.values()).reduce((a, b) => a + b, 0);

  const sorted = Array.from(keywordFrequency.entries())
    .map(([term, count]) => ({
      term,
      count,
      percentage: totalOccurrences > 0 ? Math.round((count / totalOccurrences) * 100 * 10) / 10 : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  return sorted;
}

/**
 * Builds top keywords grouped by project (top 5 per project)
 */
function buildTopKeywordsByProject(projectKeywords) {
  const result = {};

  projectKeywords.forEach((keywordMap, project) => {
    const totalOccurrences = Array.from(keywordMap.values()).reduce((a, b) => a + b, 0);

    const topKeywords = Array.from(keywordMap.entries())
      .map(([term, count]) => ({
        term,
        count,
        percentage: totalOccurrences > 0 ? Math.round((count / totalOccurrences) * 100 * 10) / 10 : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    result[project] = topKeywords;
  });

  return result;
}

/**
 * Builds top keyword pairs (co-occurrences, top 10)
 */
function buildTopKeywordPairs(keywordPairs) {
  const sorted = Array.from(keywordPairs.entries())
    .map(([pair, count]) => {
      const keywords = pair.split(' + ');
      return {
        pair,
        count,
        keywords
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return sorted;
}

/**
 * Calculates keyword trends by comparing last 2 months
 */
function calculateKeywordTrends(timeline, topKeywords) {
  if (timeline.size < 2) {
    return [];
  }

  const months = Array.from(timeline.keys()).sort();
  const lastMonth = months[months.length - 1];
  const previousMonth = months[months.length - 2];

  if (!lastMonth || !previousMonth) {
    return [];
  }

  const lastMonthKeywords = timeline.get(lastMonth) || new Map();
  const previousMonthKeywords = timeline.get(previousMonth) || new Map();
  const topKeywordTerms = new Set(topKeywords.map((k) => k.term));

  const trends = [];

  lastMonthKeywords.forEach((lastCount, keyword) => {
    if (!topKeywordTerms.has(keyword)) {
      return;
    }

    const previousCount = previousMonthKeywords.get(keyword) || 0;
    let changePercent = 0;
    let direction = 'stable';

    if (previousCount === 0) {
      changePercent = 100;
      direction = 'new';
    } else {
      changePercent = Math.round(((lastCount - previousCount) / previousCount) * 100);
      direction = lastCount > previousCount ? 'up' : lastCount < previousCount ? 'down' : 'stable';
    }

    trends.push({
      keyword,
      lastMonth: lastCount,
      previousMonth: previousCount,
      changePercent,
      direction
    });
  });

  trends.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

  return trends.slice(0, 20);
}

/**
 * Builds list of rare keywords (appearing 1-2 times, max 20)
 */
function buildRareKeywords(keywordFrequency) {
  const rare = Array.from(keywordFrequency.entries())
    .filter(([_, count]) => count <= 2)
    .map(([term, count]) => ({
      term,
      count
    }))
    .sort((a, b) => a.term.localeCompare(b.term))
    .slice(0, 20);

  return rare;
}

/**
 * Builds empty analytics object for edge cases
 */
function buildEmptyAnalytics() {
  return {
    summary: {
      totalConversations: 0,
      conversationsWithKeywords: 0,
      uniqueKeywords: 0,
      coveragePercentage: 0
    },
    topKeywords: [],
    topKeywordsByProject: {},
    topKeywordPairs: [],
    trends: [],
    rareKeywords: []
  };
}

/**
 * Analyzes keywords for a specific project
 * Returns top 10 keywords for project-specific views
 */
export function analyzeProjectKeywords(conversations, projectName) {
  if (!projectName || !Array.isArray(conversations)) {
    return { project: projectName, keywords: [] };
  }

  const projectConversations = conversations.filter((c) => c.project === projectName);

  if (projectConversations.length === 0) {
    return {
      project: projectName,
      totalConversations: 0,
      conversationsWithKeywords: 0,
      keywords: []
    };
  }

  const keywordFrequency = new Map();
  let conversationsWithKeywords = 0;

  projectConversations.forEach((conv) => {
    const keywords = extractKeywords(conv.keywords);
    if (keywords.length > 0) {
      conversationsWithKeywords += 1;
      keywords.forEach((keyword) => {
        keywordFrequency.set(keyword, (keywordFrequency.get(keyword) || 0) + 1);
      });
    }
  });

  const totalOccurrences = Array.from(keywordFrequency.values()).reduce((a, b) => a + b, 0);

  const keywords = Array.from(keywordFrequency.entries())
    .map(([term, count]) => ({
      term,
      count,
      percentage: totalOccurrences > 0 ? Math.round((count / totalOccurrences) * 100 * 10) / 10 : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    project: projectName,
    totalConversations: projectConversations.length,
    conversationsWithKeywords,
    keywords
  };
}

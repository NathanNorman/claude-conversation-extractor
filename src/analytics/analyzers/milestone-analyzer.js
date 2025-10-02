/**
 * Milestone Analyzer
 *
 * Tracks achievements and awards badges based on conversation activity.
 * Provides gamification and motivation through milestone tracking.
 */

/**
 * Badge definitions with criteria
 */
const BADGE_DEFINITIONS = {
  // Conversation count milestones
  first_conversation: {
    name: 'First Steps',
    emoji: '🎯',
    criteria: (stats) => stats.totalConversations >= 1,
    description: 'Started your first conversation'
  },
  conversations_10: {
    name: 'Getting Started',
    emoji: '🌱',
    criteria: (stats) => stats.totalConversations >= 10,
    description: 'Completed 10 conversations'
  },
  conversations_50: {
    name: 'Regular User',
    emoji: '⭐',
    criteria: (stats) => stats.totalConversations >= 50,
    description: 'Completed 50 conversations'
  },
  conversations_100: {
    name: 'Century Club',
    emoji: '💯',
    criteria: (stats) => stats.totalConversations >= 100,
    description: 'Reached 100 conversations'
  },
  conversations_500: {
    name: 'Power User',
    emoji: '🚀',
    criteria: (stats) => stats.totalConversations >= 500,
    description: 'Completed 500 conversations'
  },

  // Streak milestones
  streak_3: {
    name: 'On a Roll',
    emoji: '🔥',
    criteria: (stats) => stats.longestStreak >= 3,
    description: 'Maintained a 3-day streak'
  },
  streak_7: {
    name: 'Week Warrior',
    emoji: '⚡',
    criteria: (stats) => stats.longestStreak >= 7,
    description: 'Maintained a 7-day streak'
  },
  streak_30: {
    name: 'Monthly Master',
    emoji: '👑',
    criteria: (stats) => stats.longestStreak >= 30,
    description: 'Maintained a 30-day streak'
  },

  // Activity patterns
  early_bird: {
    name: 'Early Bird',
    emoji: '🌅',
    criteria: (stats) => stats.busiestHour >= 5 && stats.busiestHour <= 9,
    description: 'Most active in early morning (5-9 AM)'
  },
  night_owl: {
    name: 'Night Owl',
    emoji: '🦉',
    criteria: (stats) => stats.busiestHour >= 22 || stats.busiestHour <= 2,
    description: 'Most active late at night (10 PM - 2 AM)'
  },
  weekend_warrior: {
    name: 'Weekend Warrior',
    emoji: '🏖️',
    criteria: (stats) => stats.weekendActivity > 0.3,
    description: 'More than 30% activity on weekends'
  },

  // Custom command usage (generic - works for any user)
  command_user: {
    name: 'Command User',
    emoji: '⌨️',
    criteria: (stats) => stats.totalCustomCommands >= 1,
    description: 'Used a custom slash command'
  },
  command_enthusiast: {
    name: 'Command Enthusiast',
    emoji: '🎮',
    criteria: (stats) => stats.totalCustomCommands >= 10,
    description: 'Used 10+ custom commands'
  },
  command_power_user: {
    name: 'Command Power User',
    emoji: '⚡',
    criteria: (stats) => stats.totalCustomCommands >= 50,
    description: 'Used 50+ custom commands'
  },
  command_master: {
    name: 'Command Master',
    emoji: '🏆',
    criteria: (stats) => stats.totalCustomCommands >= 100,
    description: 'Used 100+ custom commands'
  },
  command_variety: {
    name: 'Command Variety',
    emoji: '🌈',
    criteria: (stats) => Object.keys(stats.customCommands).length >= 5,
    description: 'Used 5+ different custom commands'
  },
  automation_enthusiast: {
    name: 'Automation Enthusiast',
    emoji: '🤖',
    criteria: (stats) => stats.totalHooks >= 10,
    description: 'Had hooks execute 10+ times'
  },

  // Productivity
  deep_thinker: {
    name: 'Deep Thinker',
    emoji: '🧠',
    criteria: (stats) => stats.deepWorkSessions >= 20,
    description: 'Completed 20+ deep work sessions (>30 min)'
  },
  prolific_coder: {
    name: 'Prolific Coder',
    emoji: '📝',
    criteria: (stats) => stats.totalMessages >= 10000,
    description: 'Exchanged 10,000+ messages'
  }
};

/**
 * Analyze milestones and award badges
 * @param {Object} cache - Complete analytics cache
 * @returns {Object} Milestone analysis
 */
export function analyzeMilestones(cache) {
  // Gather stats for badge evaluation
  const stats = {
    totalConversations: cache.overview?.totalConversations || 0,
    totalMessages: cache.overview?.totalMessages || 0,
    longestStreak: cache.timePatterns?.streaks?.longest || 0,
    currentStreak: cache.timePatterns?.streaks?.current || 0,
    busiestHour: cache.timePatterns?.busiestHour,
    weekendActivity: cache.productivityMetrics?.weekendActivity || 0,
    deepWorkSessions: cache.productivityMetrics?.deepWorkSessions || 0,
    // User actions (custom commands, not LLM tools)
    customCommands: cache.userActions?.slashCommands?.byCommand || {},
    totalCustomCommands: cache.userActions?.slashCommands?.total || 0,
    hooks: cache.userActions?.hooks?.byHook || {},
    totalHooks: cache.userActions?.hooks?.total || 0
  };

  // Evaluate all badges
  const badges = [];
  for (const [badgeId, badge] of Object.entries(BADGE_DEFINITIONS)) {
    if (badge.criteria(stats)) {
      badges.push(badgeId);
    }
  }

  // Calculate achievements
  const achievements = {
    totalWords: estimateTotalWords(cache.overview?.totalMessages || 0),
    totalCodeLines: 0, // Would need content analysis
    projectsWorked: Object.keys(cache.conversationStats?.byProject || {}).length,
    commandsMastered: getCommandsMastered(stats.customCommands),
    totalCustomCommands: stats.totalCustomCommands
  };

  // Find next milestones
  const nextMilestones = findNextMilestones(stats, badges);

  return {
    badges,
    achievements,
    nextMilestones
  };
}

/**
 * Estimate total words from message count
 * @param {number} messageCount - Total messages
 * @returns {number} Estimated word count
 */
function estimateTotalWords(messageCount) {
  // Rough estimate: average message is ~50 words
  return Math.round(messageCount * 50);
}

/**
 * Get list of custom commands with significant usage
 * @param {Object} customCommands - Custom command usage counts
 * @returns {Array<string>} Command names
 */
function getCommandsMastered(customCommands) {
  const MASTERY_THRESHOLD = 5; // Lower threshold for custom commands
  return Object.entries(customCommands)
    .filter(([, count]) => count >= MASTERY_THRESHOLD)
    .map(([cmd]) => cmd)
    .sort((a, b) => customCommands[b] - customCommands[a]);
}

/**
 * Find next achievable milestones
 * @param {Object} stats - Current stats
 * @param {Array<string>} earnedBadges - Already earned badge IDs
 * @returns {Array<Object>} Next milestones with progress
 */
function findNextMilestones(stats, earnedBadges) {
  const next = [];

  // Check conversation milestones
  if (!earnedBadges.includes('conversations_500') && stats.totalConversations < 500) {
    const target = stats.totalConversations >= 100 ? 500 : stats.totalConversations >= 50 ? 100 : stats.totalConversations >= 10 ? 50 : 10;
    next.push({
      name: `${target} Conversations`,
      progress: stats.totalConversations,
      target,
      percentage: Math.round((stats.totalConversations / target) * 100),
      emoji: target === 500 ? '🚀' : target === 100 ? '💯' : target === 50 ? '⭐' : '🌱'
    });
  }

  // Check streak milestones
  if (!earnedBadges.includes('streak_30') && stats.longestStreak < 30) {
    const target = stats.longestStreak >= 7 ? 30 : stats.longestStreak >= 3 ? 7 : 3;
    next.push({
      name: `${target}-Day Streak`,
      progress: stats.longestStreak,
      target,
      percentage: Math.round((stats.longestStreak / target) * 100),
      emoji: target === 30 ? '👑' : target === 7 ? '⚡' : '🔥'
    });
  }

  // Sort by closest to completion
  next.sort((a, b) => b.percentage - a.percentage);

  return next.slice(0, 3); // Return top 3
}

/**
 * Get badge info by ID
 * @param {string} badgeId - Badge identifier
 * @returns {Object|null} Badge definition
 */
export function getBadgeInfo(badgeId) {
  return BADGE_DEFINITIONS[badgeId] || null;
}

/**
 * Update cache with milestone analysis
 * @param {Object} cache - Analytics cache
 * @param {Object} milestones - Milestone analysis results
 */
export function updateCacheWithMilestones(cache, milestones) {
  cache.milestones = milestones;
  return cache;
}

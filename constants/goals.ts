// =============================================================================
// Top 40 Most Popular Goals
// =============================================================================
// Research-based list of the most common personal development goals

export const POPULAR_GOALS = [
  // Landing Page / Marketing Goals
  'Run a Marathon',
  'Launch a Startup',
  'Write a Bestseller',
  'Travel the World',
  'Buy a Dream Home',
  'Financial Freedom',
  'Get in Shape',
  'Find True Love',
  // Standard Goals
  'Save money',
  'Learn Python',
  'Read more',
  'Get promoted',
  'Start business',
  'New language',
  'Lose weight',
  'Meditate',
  'Wake early',
  'Side income',
  'Get organized',
  'Network',
  'Invest',
  'Quit smoking',
  'Cook more',
  'Journal',
  'Get certified',
  // Additional 20 popular goals
  'Build muscle',
  'Reduce stress',
  'Learn guitar',
  'Get MBA',
  'Public speaking',
  'Learn coding',
  'Improve credit',
  'Eat healthy',
  'Sleep better',
  'Work-life balance',
  'Career change',
  'Reduce screen time',
  'Practice gratitude',
  'Be more confident',
  'Learn photography',
  'Build portfolio',
  'Get visa',
] as const;

export type PopularGoal = (typeof POPULAR_GOALS)[number];



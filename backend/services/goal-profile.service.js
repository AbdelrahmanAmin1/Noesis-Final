'use strict';

const GOAL_PROFILES = {
  exams: {
    id: 'exams',
    label: 'Ace my exams',
    shortLabel: 'Exam prep',
    icon: 'Target',
    effect: 'Dashboard will push quizzes, weak answers, and exam-ready notes first.',
    dashboardBias: 'Quizzes, weak topics, and exam-ready notes come first.',
    studyPlanBias: 'More quiz checkpoints and quick review tasks.',
    primaryRoute: 'quizzes',
    primaryCta: 'Open quizzes',
    primaryAction: 'Take a quiz checkpoint',
    plan: {
      primaryType: 'quiz',
      secondaryType: 'flashcards',
      secondaryEvery: 3,
    },
  },
  understand: {
    id: 'understand',
    label: 'Understand deeply',
    shortLabel: 'Deep understanding',
    icon: 'Brain',
    effect: 'Dashboard will push tutor sessions and concept-gap explanations first.',
    dashboardBias: 'Tutor sessions, concept gaps, and explanations come first.',
    studyPlanBias: 'More Socratic checks and deep-dive explanation tasks.',
    primaryRoute: 'tutor',
    primaryCta: 'Start tutor',
    primaryAction: 'Start a concept deep dive',
    plan: {
      primaryType: 'tutor_session',
      secondaryType: 'quiz',
      secondaryEvery: 4,
    },
  },
  retain: {
    id: 'retain',
    label: 'Retain long-term',
    shortLabel: 'Long-term retention',
    icon: 'Bookmark',
    effect: 'Dashboard will push due flashcards and spaced review first.',
    dashboardBias: 'Due flashcards, spaced repetition, and recall practice come first.',
    studyPlanBias: 'More flashcard review and spacing checkpoints.',
    primaryRoute: 'flashcards',
    primaryCta: 'Review cards',
    primaryAction: 'Review due cards',
    plan: {
      primaryType: 'flashcards',
      secondaryType: 'quiz',
      secondaryEvery: 5,
    },
  },
  practice: {
    id: 'practice',
    label: 'Practice problems',
    shortLabel: 'Practice',
    icon: 'Bolt',
    effect: 'Dashboard will push quizzes, practice sets, and mistake review first.',
    dashboardBias: 'Practice quizzes, checkpoints, and mistake review come first.',
    studyPlanBias: 'More practice checkpoints and wrong-answer review.',
    primaryRoute: 'quizzes',
    primaryCta: 'Practice now',
    primaryAction: 'Run a practice checkpoint',
    plan: {
      primaryType: 'quiz',
      secondaryType: 'tutor_session',
      secondaryEvery: 3,
    },
  },
};

function normalizeGoal(goal) {
  const raw = String(goal || '').trim().toLowerCase();
  if (GOAL_PROFILES[raw]) return raw;
  if (/exam|test|ace|prep/.test(raw)) return 'exams';
  if (/understand|deep|concept|gap/.test(raw)) return 'understand';
  if (/retain|retention|long|spaced|remember|recall/.test(raw)) return 'retain';
  if (/practice|problem|drill|exercise/.test(raw)) return 'practice';
  return 'exams';
}

function getGoalProfile(goal) {
  const id = normalizeGoal(goal);
  const profile = GOAL_PROFILES[id];
  return {
    ...profile,
    plan: { ...profile.plan },
  };
}

function publicGoalProfile(goal) {
  const profile = getGoalProfile(goal);
  return {
    id: profile.id,
    label: profile.label,
    short_label: profile.shortLabel,
    icon: profile.icon,
    effect: profile.effect,
    dashboard_bias: profile.dashboardBias,
    study_plan_bias: profile.studyPlanBias,
    primary_route: profile.primaryRoute,
    primary_cta: profile.primaryCta,
  };
}

module.exports = {
  GOAL_PROFILES,
  normalizeGoal,
  getGoalProfile,
  publicGoalProfile,
};

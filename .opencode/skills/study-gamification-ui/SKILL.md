---
name: study-gamification-ui
description: Designs gamified study interfaces that increase motivation, daily habit, and visible progress. Use for dashboards, study sessions, streaks, levels, rewards, and leaderboard flows.
---

## Goal
Turn study tasks into a motivating, clear, and engaging experience with visible progress, frequent rewards, and immediate feedback.

## Design Rules
- Prioritize emotion and clarity: every screen should answer "what do I gain today if I study?"
- Avoid flat black-and-white minimalism when it reduces motivation.
- Use strong hierarchy: daily progress, streak, XP, level, and next reward.
- Use color by meaning:
  - success/progress
  - warning/pending
  - achievement/reward
- Always include at least one celebration moment (short animation or micro-interaction) for key completions.
- Use existing shadcn components before writing custom markup.

## Required Patterns
- Primary progress bar visible on screen.
- Streak card with state: completed today / not completed.
- Reward milestones for 3, 7, and 14 days.
- One primary CTA per screen (for example: "Start session", "Complete challenge").

## Motion
- Short, intentional animations (150-400ms).
- Staggered entrance for progress cards.
- Subtle celebration (confetti/shine) only on achievement events.

## UX Copy
- Positive, actionable language.
- Short progress-oriented prompts (for example: "8 minutes left to hit your daily goal").

## Accessibility
- Minimum AA contrast.
- Never rely only on color to communicate state.
- Visible keyboard focus states.

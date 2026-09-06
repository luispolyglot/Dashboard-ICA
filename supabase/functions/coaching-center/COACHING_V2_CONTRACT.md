# Coaching V2 Contract

## Session model

- `coaching_sessions.program_version`: `v1 | v2`
- `coaching_sessions.duration_periods`: default `10`
- V2 uses `period_number` semantics (not fixed to 7 days).

## Focus board model

- Up to `3` active focuses per period.
- Focus phases:
  - `phaseExplained`
  - `phaseTrained`
  - `phaseUnderstoodExplained`
  - `phaseUsed`
- A focus is completed when all four phases are `true`.
- On period close, a snapshot is saved in `coaching_v2_focus_snapshots`.
- Next period can carry over incomplete focuses from the snapshot.

## Class model

- `coaching_session_classes.class_index`: `1 | 2`.
- Coach guidance fields:
  - `coach_guideline_1`
  - `coach_guideline_2`
  - `coach_guideline_3`
- Student completion/report fields:
  - `student_completed_at`
  - `student_report_text`
  - `student_report_image_path`
  - `student_guideline_response_1`
  - `student_guideline_response_2`
  - `student_guideline_response_3`

## Suggested API actions (coaching-center)

- `v2-get-session-board`
  - Input: `sessionId`
  - Output: current period, classes, active focuses, last snapshot
- `v2-upsert-focus`
  - Input: `sessionId`, `periodNumber`, `focusId?`, `focusTitle`, `focusComment?`
  - Rules: block if active focuses already `3` and creating new
- `v2-toggle-focus-phase`
  - Input: `sessionId`, `focusId`, `phase`, `checked`
  - Rules: update completion state atomically
- `v2-close-period`
  - Input: `sessionId`, `periodNumber`
  - Rules: snapshot current focuses + close period activation row
- `v2-upsert-class-coach-guidelines`
  - Input: `sessionId`, `periodNumber`, `classIndex`, guideline fields
- `v2-submit-class-student-report`
  - Input: `sessionId`, `periodNumber`, `classIndex`, `guidelineResponse1`, `guidelineResponse2`, `guidelineResponse3`
  - Rules: only enabled after coach has filled 3 guideline fields; unlock teacher report when all responses are completed

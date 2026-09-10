# Coaching V3 Contract (UI-Driven)

## Scope

This contract extends V2 data semantics for the V3 UI migration based on `coaching-final-version.html`.

Key goals:

- Keep V2 focus and exercise behavior intact.
- Move report semantics from class-level to period-level.
- Provide explicit coacher metadata for deterministic UI rendering.

## Period semantics

- Backend keeps `period_number` as source of truth.
- Frontend can render "Semana" labels while still using `period_number` internally.

## Focus behavior

- Focus phases remain unchanged (`1/4` to `4/4`).
- Entrenado phase CTA remains unchanged:
  - First attempt: `Entrenar`
  - Additional attempts: `Reintentar`
- Focus comments are exposed for modal/chat UX in V3.

## Period report model

- A period has exactly one report record.
- Report states are computed as:
  - `blocked`: fewer than 6 student task responses completed in the selected period.
  - `preparing`: 6/6 tasks completed, but period report is still empty.
  - `available`: period report has content (text and/or image).

## Task aggregation (single 1..6 rail)

- Task 1..3 come from class 1 coach guidelines/responses.
- Task 4..6 come from class 2 coach guidelines/responses.
- Progress and report unlock are computed on aggregated completion.

## Coacher display rules

- Header "equipo" must always show:
  - Luis (fixed)
  - Selected session coach
- Each class card shows who authored that class content based on
  `assigned_by_coach_user_id`.

## Master notes visibility (coach)

- In V3 coach preview, master notes review is displayed only for periods `1..4`.

## API surface (V3 additions over V2)

- `v2-get-session-board` and `v2-get-session-board-member` include:
  - `periodReport` for selected period.
  - `coachers` metadata (header and class author names).
- New action: `v2-upsert-period-report` (coach-only)
  - Input: `sessionId`, `periodNumber`, `reportText?`, `reportImagePath?`
  - Upsert semantics by (`session_id`, `period_number`).

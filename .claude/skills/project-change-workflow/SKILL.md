---
name: project-change-workflow
description: Use for any implementation, bug fix, refactor, or test change in this repository. Requires evidence-first codebase exploration, scope control, and honest verification.
---

# Project Change Workflow

Follow this skill for every code change in this repository. If the task concerns routing/access, Supabase, notifications, or state architecture, also load the matching specialized skill.

## Evidence before implementation

1. Check `git status --short` before editing. Preserve unrelated, staged, and untracked user work.
2. Trace the existing behavior from its entry point through its callers, hooks, services, and persistence. Search for definitions and usages; do not infer behavior from filenames alone.
3. Read the smallest relevant set of source files and tests. Treat code as the source of truth; treat plans, comments, and prior summaries as hypotheses to verify.
4. Do not invent route names, role names, tables, RPCs, Edge Functions, environment variables, notification schedules, or test commands. If a required fact cannot be established from the repo, say what is unknown and ask or leave the assumption explicit.
5. Make the narrowest coherent change. Avoid opportunistic rewrites and duplicate sources of truth.

## Repository map

- Vite SPA using React 18, TypeScript strict mode, and React Router 7. The `@/` alias resolves to `src/`.
- `src/App.tsx` owns route composition. Route path constants and breadcrumb labels live in `src/modules/routes/paths.ts`.
- Dashboard route adapters are in `src/modules/routes/DashboardPages.tsx`; dashboard UI is generally in `src/modules/views/`, reusable feature UI in `src/modules/components/`, hooks in `src/modules/hooks/`, and Supabase/API access in `src/modules/services/`.
- Shared app UI primitives are in `src/components/ui/`. Reuse existing components and visual patterns before adding new primitives. Load the existing `shadcn` skill when changing shadcn components and `study-gamification-ui` when changing study/progress/reward experiences.
- Auth session state is in `src/auth/AuthContext.tsx`; dashboard-wide data is currently managed by `useDashboardICA` and exposed through `DashboardContext`.
- Supabase schema changes belong in new files under `supabase/migrations/`; Edge Functions live under `supabase/functions/<function-name>/`.

## Language and implementation discipline

- Use English for new code identifiers, SQL identifiers, migration filenames, and technical comments. Keep user-facing copy consistent with the existing Spanish UI unless the product request asks for another language.
- Preserve strict TypeScript: avoid `any`, unused symbols, unvalidated external input, and unchecked assumptions about nullable route params or API responses.
- Reuse the existing service, hook, component, and error-handling conventions of the feature being changed. Do not add a dependency or a new abstraction unless it solves a demonstrated need.
- Keep business/data logic testable outside render code when practical. Do not duplicate a calculation or policy that already has an authoritative implementation.

## Verification

- Use the package manager supported by the lockfile (`pnpm-lock.yaml` is present).
- Available project checks include `pnpm build`, `pnpm test:unit`, and `pnpm test:integration`. There is no lint script in the current `package.json`; do not claim one exists.
- Run checks relevant to the change and `git diff --check`. For migrations or access changes, review security behavior as well as successful compilation.
- Report exactly which checks ran and their result. Never say a build, test, migration, deploy, or remote configuration succeeded unless it was actually verified.

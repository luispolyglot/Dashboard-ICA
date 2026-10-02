---
name: state-architecture
description: Use when choosing where React state, shared app state, async data, Zustand stores, hooks, services, or rendering logic should live in this repository.
---

# State and Feature Architecture

Keep state at the narrowest scope that correctly represents the source of truth. Read `project-change-workflow` and inspect the consumers before introducing or moving state.

## Existing state boundaries

- `AuthContext` in `src/auth/AuthContext.tsx` owns auth session/user lifecycle and auth actions. Do not mirror the session in another store.
- `DashboardContext` delegates to `src/modules/hooks/useDashboardICA.ts` and owns existing dashboard-wide study/config/progress state. Reuse it for state already represented there; do not migrate it wholesale as a side effect.
- Zustand is installed and currently used by `src/modules/stores/featureFlagsStore.ts`. Its React consumers select specific fields; non-React code can read with `getState()`. Treat it as an existing tool for genuinely shared feature/application state, not as a mandate to put every `useState` in a global store.
- Page-local form, dialog, selection, and transient UI state should normally stay local. Prefer derived values over duplicated state.

## Choose a boundary deliberately

- **View/component:** render props and user interaction; avoid embedding large data workflows or direct repeated Supabase queries in render components.
- **Hook:** React lifecycle, local/shared subscription, loading state, event listeners, orchestration, and cleanup. Cancel/ignore stale async results on unmount or identity changes.
- **Service/domain module:** Supabase/network access, mapping/validation, reusable business rules, and pure calculations. Keep pure logic independently testable.
- **Zustand store:** use when multiple distant consumers need the same reactive feature state, or a non-React caller needs a well-defined shared state API. Use a typed `useFeatureStore` pattern, narrow selectors, explicit loading/error state for async work, and deduplicate concurrent loads where relevant. Avoid unrelated feature state in one store.
- **Context:** use/reuse when the data is already provider-scoped and consumers belong to that provider boundary. Do not create a context/store solely to avoid passing one or two stable props.

When creating a store, define the owner, lifetime, reset behavior on sign-out/user change, persistence policy, async race behavior, and error/retry behavior. Do not persist sensitive or user-scoped data without checking logout and account-switch semantics.

## Render and test discipline

- Split large render modules by feature responsibility; keep route adapters thin and pass explicit typed props.
- Keep hooks unconditional and at component top level. Ensure event listeners, intervals, subscriptions, and timers are cleaned up.
- Test pure service/domain rules directly; test hooks/components for loading, error, empty, update, and cleanup states when behavior warrants it.
- Avoid premature memoization and global state. Prefer a small, explicit boundary over a generic state framework or duplicated cache.

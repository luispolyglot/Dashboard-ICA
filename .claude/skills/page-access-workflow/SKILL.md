---
name: page-access-workflow
description: Use when adding or changing React pages, routes, public/private access, admin or coaching roles, route guards, breadcrumbs, or desktop/mobile navigation in this repository.
---

# Page and Access Workflow

Treat a new page as a complete route-and-access change, not just a rendered component. Read `project-change-workflow` as well.

## 1. Establish the access contract

Before coding, classify the page as one of:

- Public-only (for example, sign-in/sign-up pages).
- Any authenticated user.
- Authenticated with a verified product role (admin, super admin, coaching admin) or a verified relationship (such as coaching membership).

Verify exact role values and source-of-truth checks in `src/modules/services/adminAnalytics.ts`, `src/modules/services/coaching.ts`, and existing guards. Do not treat `admin`, `super_admin`, `coach_admin`, and coaching membership as interchangeable. Do not use client-editable user metadata as authorization authority.

## 2. Wire every relevant layer

- Declare the route in `src/App.tsx`. Current private dashboard routes are nested under `PrivateRoute`; public auth pages use `PublicOnlyRoute`; privileged groups use the matching guard from `src/router/RouteGuards.tsx`. Preserve required loading and redirect behavior.
- Add or reuse a path constant in `DASHBOARD_ROUTES` and a breadcrumb label in `DASHBOARD_LABELS` in `src/modules/routes/paths.ts` when applicable.
- Follow the existing adapter pattern in `src/modules/routes/DashboardPages.tsx`: route params/context wiring and `PageLayout` belong at the page boundary; feature rendering belongs in a view/component; data access belongs in services/hooks.
- Decide whether the page belongs in the mobile profile sheet, desktop header, mobile bottom navigation, or another menu. Check `src/modules/components/MobileProfileSheet.tsx`, `Header.tsx`, and `MobileBottomNav.tsx`; update every applicable navigation surface and avoid adding links to irrelevant menus.
- For role/member-conditioned navigation, use the existing access data/hooks and preserve loading states. Render the matching link only when access is established; hide it for unauthorized users.

## 3. Enforce access twice

- Guard direct URL entry with the route guard; hiding a navigation link is not route protection.
- Enforce data authorization at the Supabase boundary with RLS, a carefully scoped RPC, or server-side Edge Function checks. A React guard is UX only and never protects database rows or privileged actions.
- While role or membership is loading, do not briefly render protected content. Deny by default on failed/unknown access checks and follow existing redirect behavior.
- Keep member access distinct from administrator access. Use the server-owned membership/role check already used by this feature.

## 4. Verify behavior

Check the new route for: unauthenticated access, authenticated non-member/non-admin access, each intended role, loading/error states, direct deep links, back/breadcrumb behavior, and navigation visibility on the relevant viewport. Add or update meaningful tests for the guard/access decision and the navigation surface when those behaviors are non-trivial.

Existing route examples: `src/App.tsx`, `src/router/RouteGuards.tsx`, `src/modules/hooks/useProfileAccess.ts`, and `src/modules/components/MobileProfileSheet.tsx`. Re-read them before relying on this summary.

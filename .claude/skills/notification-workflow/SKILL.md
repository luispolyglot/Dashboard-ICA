---
name: notification-workflow
description: Use when adding or changing notifications, toast feedback, in-app badges/alerts, browser push, notification preferences, reminders, or delivery scheduling in this repository.
---

# Notification Workflow

First identify which notification channel the request means. Toasts, in-app alerts, and browser push have different delivery, persistence, and permission behavior. Read `project-change-workflow` and `supabase-secure-workflow` when persistence or server delivery changes.

## Repository map (verify current callers before editing)

- **Transient UI feedback:** Sonner is mounted by `src/main.tsx`, wrapped by `src/components/ui/sonner.tsx`; use `toast` from `sonner` and follow existing success/error patterns.
- **In-app alerts/badges:** challenge alerts use `src/modules/hooks/useIcaChallengeAlerts.ts` and appear in `Header.tsx`, `MobileBottomNav.tsx`, and game views. Coaching/test indicators flow through `DashboardLayout.tsx`, `Header.tsx`, `MobileProfileSheet.tsx`, and access/data hooks. Search all producers and consumers; do not add a badge to only one viewport by accident.
- **Browser push:** registration and preference/subscription logic is in `src/modules/services/pushNotifications.ts`; the worker is `public/push-sw.js` and handles push display and click navigation. `src/modules/views/ManageNotificationsView.tsx` is the existing preference/device UI.
- **Server reminders:** Edge Functions currently include `streak-push-reminders`, `calendar-push-reminders`, and `coaching-class-push-reminders`. Read the function and its exact migration, secrets, caller, and schedule before changing behavior. Do not assume a function is scheduled just because it exists; prove the caller/cron configuration from checked-in SQL or documented external configuration and report gaps.
- **Preferences and delivery state:** inspect feature-specific services and migrations, including `user_push_subscriptions`, `user_push_notification_preferences`, calendar preferences, coaching notification preferences, and delivery/log tables. Names are examples, not permission to assume a new feature uses the same schema.

## Trace end to end

For each requested notification, map: event/source → eligibility and preference checks → deduplication/throttling → delivery channel → click destination → persistence/logging → opt-out and failure behavior. Check time zones, quiet hours, permission denial, unsupported browsers, stale subscriptions, duplicate delivery, and offline/resume behavior where applicable.

Keep pure reminder selection/calculation in a testable service/domain function where the existing feature does so. Keep React effects/listeners in hooks or owning components with cleanup. Do not request browser permission automatically; follow the existing explicit opt-in flow.

If adding a preference, add the UI, read/write service, database migration with RLS, and server-side honor/opt-out logic together. Protect push endpoints, secrets, subscription keys, and service-role access. A UI toggle alone must not be treated as disabling server delivery.

Verify both a positive delivery case and opt-out/duplicate/failure behavior. If the real push provider or remote scheduler was not exercised, say so instead of claiming delivery works end to end.

---
name: supabase-secure-workflow
description: Use for Supabase schema or migration changes, RLS policies, SQL/RPC, Edge Functions, auth, database access, or Supabase deployment in this repository.
---

# Supabase Secure Workflow

Security is part of the implementation. Read `project-change-workflow` and trace the existing table/function policies before editing.

## Database changes

- Add a new timestamped English migration at `supabase/migrations/YYYYMMDDHHMMSS_descriptive_name.sql`. Never edit an already-applied migration to change deployed behavior; add a forward migration. Do not make destructive changes without understanding dependents and the requested behavior.
- For every new table exposed to Supabase/PostgREST, enable RLS in the same migration and create explicit policies for every intended operation. Default to no access. For user-owned rows, tie `user_id` to `auth.uid()` and use both `USING` and `WITH CHECK` where reads/updates/inserts are allowed. Test cross-user access denial as well as owner access.
- Never add a permissive `USING (true)` policy for convenience. If data is intentionally public, scope the policy to the intended operation and document why.
- Keep SQL, schema identifiers, migration names, RPC/function names, and technical comments in English. Preserve Spanish only for product-facing text.
- For `SECURITY DEFINER` functions, verify caller identity/authorization inside the function, qualify object names, set a safe `search_path`, and explicitly revoke broad execution then grant only to the required roles. Do not assume RLS protects a definer function.
- Review constraints, foreign keys, indexes, grants, triggers, uniqueness, nullability, and update/delete semantics with the feature's real access pattern. Do not rely on frontend validation for database integrity.

## Browser client and Edge Functions

- Use the existing client at `src/lib/supabase.ts` and feature services under `src/modules/services/`. Never expose `service_role` keys or privileged credentials to browser code.
- Treat route guards and hidden UI as presentation only. Enforce authorization in RLS/RPC/Edge Functions and verify both role and resource ownership/scope server-side.
- For user-invoked Edge Functions, validate the bearer token with Supabase Auth (`auth.getUser()` or the existing shared helper), then validate role, membership, ownership, and input before any privileged query. Reuse `supabase/functions/_shared/` helpers after reading their contracts.
- If a function is configured with `verify_jwt = false`, it must perform its own strong caller authentication (for example a server-held scheduled-job secret); the config flag itself is not security. Never trust a caller-supplied user ID as proof of identity.
- Use `SUPABASE_SERVICE_ROLE_KEY` only in server functions after the caller/scheduled-job boundary is authenticated and authorized. Prefer user-scoped/RLS requests where possible. Validate inputs, return deliberate status codes, and do not leak secrets or sensitive database errors.
- A change in `_shared/` can affect multiple Edge Functions. Inspect function config and all callers before deciding which functions need to be tested/deployed.

## Delivery and verification

- Check `supabase/config.toml`, recent migrations, `supabase/functions/`, and `.github/workflows/deploy-supabase.yml` before describing CI behavior. Current CI maps `dev` to dev secrets and `main` to production; it detects migrations/functions and runs `supabase db push --include-all --yes` for migration changes.
- `--include-all` handles missing local migration versions older than already-applied versions; it does not fix dependencies in a migration that is deployed before its prerequisite. Keep migrations safe to apply in timestamp order and coordinate dependent changes.
- Do not run remote `db push`, production deploys, or destructive SQL unless the user explicitly requested that operation. For local verification, inspect generated SQL/diffs and run project tests relevant to the change. State clearly when a remote database was not exercised.
- Before finishing, verify RLS is enabled and policies cover the intended CRUD matrix; check anonymous, authenticated owner, other-user, and privileged cases as applicable.

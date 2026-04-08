# Supabase setup

1. Crea un proyecto en Supabase.
2. Abre el SQL Editor y ejecuta `supabase/schema.sql`.
3. En Authentication > Providers, habilita Email.
4. (Opcional) Activa o desactiva confirmacion por email segun tu flujo.
5. Copia URL y anon key en `.env`:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

La app ya persiste el dashboard en tablas normalizadas:
- `lexicards`
- `user_settings`
- `daily_metrics`
- `goal_completions`

`user_state` se elimina en este schema (cleanup incluido).

Las demas tablas quedan listas para evolucionar a leaderboards, XP y log de eventos.

Para whitelist de acceso usa los scripts en `whitelist/README.md`.

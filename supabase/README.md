# Supabase setup

1. Crea un proyecto en Supabase.
2. Abre el SQL Editor y ejecuta `supabase/schema.sql`.
3. En Authentication > Providers, habilita Email.
4. (Opcional) Activa o desactiva confirmación por email segun tu flujo.
5. Copia URL y anon key en `.env`:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Edge Function para Anthropic

La app ya no llama Anthropic desde el frontend. Ahora usa la function `anthropic-proxy`, para que la API key quede solo del lado servidor.

1. Instala y autentica Supabase CLI.
2. Linkea el proyecto:

```bash
supabase link --project-ref <tu-project-ref>
```

3. Configura secrets (en Supabase, no en `.env` del frontend):

```bash
supabase secrets set ANTHROPIC_API_KEY=<tu_api_key>
supabase secrets set ANTHROPIC_MODEL=claude-sonnet-4-20250514
supabase secrets set ANTHROPIC_BASE_URL=https://api.anthropic.com
```

4. Deploy de la function:

```bash
supabase functions deploy anthropic-proxy
```

Para el panel de analíticas admin:

```bash
supabase functions deploy admin-analytics
```

5. Verifica que en Network ya no aparezca `x-api-key` ni requests directos a `api.anthropic.com`.

La function exige usuario autenticado (Bearer token de Supabase), evitando uso anónimo del endpoint.

La app ya persiste el dashboard en tablas normalizadas:

- `lexicards`
- `user_settings`
- `daily_metrics`
- `goal_completions`

`user_state` se elimina en este schema (cleanup incluido).

Las demas tablas quedan listas para evolucionar a leaderboards, XP y log de eventos.

Para whitelist de acceso usa los scripts en `whitelist/README.md`.

# Coaching Class Push Reminders

Esta Edge Function procesa recordatorios pendientes de clases de coaching.

## Secretos requeridos

Configura estos secretos en Supabase:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `PUSH_REMINDERS_CRON_SECRET`

## Programacion (cron)

Programa una invocacion cada 5 minutos (Dashboard > Edge Functions > Schedules):

- metodo: `POST`
- URL: `https://<project-ref>.functions.supabase.co/coaching-class-push-reminders`
- header: `x-reminder-secret: <PUSH_REMINDERS_CRON_SECRET>`

## Reglas de envio

- Solo procesa notificaciones `reminder` en estado `pending`.
- Solo envia si la semana de la notificacion sigue siendo la semana activa actual.
- No envia si la clase ya tiene recursos post-clase (`loom/report/imagen`).
- No envia si la agenda cambio (dedupe por `schedule_signature`).
- Marca `sent` o `skipped` en `coaching_class_schedule_notifications`.

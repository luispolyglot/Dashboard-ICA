# Calendar Push Reminders

Esta Edge Function envia notificaciones push web para clases proximas del calendario ICADEMY.

## Secretos requeridos

Configura estos secretos en Supabase:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (ejemplo: `mailto:dev@icademy.com`)
- `PUSH_REMINDERS_CRON_SECRET`

Ejemplo:

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY="..." \
  VAPID_PRIVATE_KEY="..." \
  VAPID_SUBJECT="mailto:dev@icademy.com" \
  PUSH_REMINDERS_CRON_SECRET="super-secret-token"
```

## Programacion (cron)

Programa una invocacion cada 10 minutos (Dashboard > Edge Functions > Schedules) y envia:

- metodo: `POST`
- URL: `https://<project-ref>.functions.supabase.co/calendar-push-reminders`
- header: `x-reminder-secret: <PUSH_REMINDERS_CRON_SECRET>`

## Payload push

La function envia payload con:

- `title`
- `body`
- `url` (abre `/calendar-icademy`)
- `tag`

## Criterios de envio

- Solo clases con preferencia activa (`users_calendar_icademy.notifications_enabled = true`)
- Respeta `minutes_before`
- Ventana de tolerancia: hasta 10 minutos despues del inicio
- Respeta quiet hours si el usuario configuro `quiet_hours_start`/`quiet_hours_end`
- Evita duplicados por `subscription_id + calendar_entry_id`
- Calcula el horario de la clase en la zona horaria de `profiles.timezone` del usuario

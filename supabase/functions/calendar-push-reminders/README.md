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
- Respeta quiet hours si el usuario configuro `quiet_hours_start`/`quiet_hours_end`, en la hora de su propia zona (`profiles.timezone`; si no tiene, Madrid)
- Evita duplicados por `subscription_id + calendar_entry_id`
- La hora de la clase se lee en hora de Madrid (asi se guardan las clases)
- En cada pasada tambien envia los avisos de Desafios ICA que dejo en cola el job de caducidad (`ica_challenge_push_outbox`)
- Tambien envia el aviso de clase cambiada de dia u hora que deja en cola el trigger de `calendar_icademy` (`calendar_change_push_outbox`): a quien tiene el recordatorio de esa clase y al profesor con sus avisos activos. Respeta quiet hours (lo deja para la siguiente pasada) y no avisa si la clase ya empezo

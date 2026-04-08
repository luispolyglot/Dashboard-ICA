# Whitelist workflow

1. Asegurate de ejecutar primero `whitelist/schema.sql` en Supabase.
2. Copia el CSV de la comunidad en `whitelist/community.csv` (debe tener columna `Email`).
3. Genera el SQL de sincronizacion:

```bash
pnpm whitelist:generate-sql
```

4. Ejecuta el archivo generado `whitelist/sync.generated.sql` en Supabase SQL Editor.

El sync hace esto:
- Upsert: todos los emails del CSV quedan con `can_register=true` y `can_login=true`.
- Diff: los emails que estaban antes pero no estan en el CSV se deshabilitan (`can_register=false`, `can_login=false`).

Asi el CSV se comporta como source of truth, sin perder historial de registros previos.

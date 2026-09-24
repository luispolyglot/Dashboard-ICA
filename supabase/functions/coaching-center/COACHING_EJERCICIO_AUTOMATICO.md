# Ejercicio automático del foco (fase Entrenado)

## Flujo

1. El coach crea un foco (o le cambia el título) → `v2-upsert-focus` deja el ejercicio en `pending`
   y lanza `runFocusExerciseGeneration` en segundo plano (`EdgeRuntime.waitUntil`).
2. `coaching-center` llama a `anthropic-proxy` (`action: coaching_focus_exercise`) con idioma, nivel,
   foco, nota del coach, contexto (`coaching_sessions.notes`) y nombre del alumno.
3. `anthropic-proxy` usa `_shared/coaching-focus-exercise.ts`:
   - 1 llamada "plan": subtítulo, etiquetas, equivalencias, reglas `libre` y escenario.
   - 3 llamadas en paralelo (reconocer, construir, conversación) con la plantilla oficial
     (`_shared/coaching-exercise-template.ts`) como modelo.
   - Cada bloque se comprueba con el corrector real (`_shared/coaching-exercise-corrector.ts`):
     el ejemplo debe pasar sus formas, el `show` debe pasar su hueco, las "trampas" no deben pasar,
     huecos {0}…{4} bien puestos, 3 opciones con 1 buena… Si falla, 1 reintento con la lista de fallos.
     Si aún falla, se descartan solo las unidades rotas.
4. El resultado queda en `coaching_v2_focus_exercises` (`ready` / `error`). Todo queda en
   `coaching_v2_focus_exercise_generation_logs` (con `warnings`).
5. El alumno solo ve el botón "Entrenar" cuando el coach marca **Explicado**.
6. Al terminar el ejercicio se guarda el intento con TODAS sus respuestas (`answers`) y el foco pasa
   solo a **Entrenado** (se supere o no). El coach las ve en "Ver respuestas".
7. Si el foco está escrito con palabras de otro idioma, se entrena su equivalente en el idioma
   del coaching (p. ej. "Can · Could" en polaco → móc / powinien / chciałbym).

## Corrector (idéntico en app y servidor)

Patrones de la plantilla: `palabra`, `a|b`, `_`, `_ing`, `~` (0-2 palabras) y la ampliación `…`
(0-6 palabras, para verbos separables alemanes o ne … pas). Reglas por ejercicio en `libre`.
Los ejercicios antiguos (formas literales) se siguen corrigiendo igual.

## Despliegue

1. Migración `20260924150000_coaching_v2_attempt_answers.sql` (añade la columna `answers`).
   Las funciones funcionan aunque aún no esté aplicada, pero sin ella no se guardan las respuestas.
2. `pnpm deploy:functions -- anthropic-proxy coaching-center`

Opcional: secreto `ANTHROPIC_COACHING_MODEL` para usar un modelo distinto solo aquí
(si no, `ANTHROPIC_MODEL`, y si no, `claude-sonnet-4-6`).

## Probar sin Supabase

```
node --experimental-strip-types scripts/test-coaching-exercise.mjs "Inglés" "Present perfect" B1
```

Usa `ANTHROPIC_API_KEY` del `.env` y guarda el JSON en `scripts/.coaching-exercise-output/`.

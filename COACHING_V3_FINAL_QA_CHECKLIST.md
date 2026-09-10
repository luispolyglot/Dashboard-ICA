# Coaching V3 Final QA Checklist

## 1) Alumno (vista principal)

- Entrar a `/coaching-personalized` con una sesion `programVersion = v2`.
- Validar que renderiza `CoachingV3SessionBoard`.
- En "Tu recorrido", clickear varios puntos (1..10) y confirmar cambio de periodo.
- En focos, abrir burbuja junto a `x/4` y verificar modal con comentario.
- En foco con fase Entrenado lista:
  - si no hay intento: boton `Entrenar` (primary)
  - si hay intento: boton `Reintentar` (outline)
- Completar estado de tareas 6/6 y confirmar estados de reporte:
  - `<6`: bloqueado
  - `6/6` sin reporte: en preparacion
  - con reporte: disponible

## 2) Coach (manage coaching)

- Entrar a `ManageCoachingUserView`.
- Cambiar selector entre `Edicion coach` y `Como lo ve el usuario`.
- Recargar pagina y confirmar que el selector persiste.
- En `Edicion coach`, validar:
  - sigue visible la board V2 para operativa interna.
  - se muestra tambien V3 coach con editor de reporte por periodo.
- En V3 coach, guardar reporte de periodo:
  - texto solo
  - texto + imagen
  - reemplazo de imagen
  - quitar imagen

## 3) Coachers y clases

- Verificar cabecera siempre muestre `Luis y <coacher elegido>`.
- Verificar que cada clase muestra el coach segun `assigned_by_coach_user_id`.

## 4) Notas maestras (regla V3)

- En manage coach, validar tarjeta "Notas maestras (V3: periodos 1 a 4)".
- Confirmar que solo se puede navegar/usar periodos 1..4 desde esa seccion.

## 5) Visual y responsive

- Revisar light y dark mode en desktop y mobile.
- Confirmar contraste de textos secundarios, badges y estados.
- Confirmar que no aparecen las "Notas de implementacion" del HTML de referencia.

## 6) Verificacion tecnica minima

- Correr:
  - `npm run test:unit -- tests/unit/modules/views/coachingV2ExerciseLogic.test.ts`
  - `npm run test:unit -- tests/unit/modules/views/coachingV2Matrix.test.ts`
  - `npm run test:unit -- tests/unit/supabase/functions/coaching-center/v2-focus.test.ts`
  - `npm run build`

## 7) Cierre

- Si todo OK, commitear cambios funcionales.
- No incluir `tsconfig.app.tsbuildinfo` en el commit.

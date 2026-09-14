# Coaching V3 UI Refactor Plan

## Contexto y objetivo

Este plan define la migracion de la UI de Coaching V2 hacia la propuesta visual de `coaching-final-version.html`, manteniendo la logica funcional ya construida (focos, fases, ejercicio Entrenado, permisos coach/alumno) y aplicando solo los cambios de datos estrictamente necesarios.

Objetivo principal: llevar la experiencia a V3 con layout, disposicion y estilos equivalentes al HTML de referencia (sin importar sus fuentes), soportando light/dark y cubriendo los requisitos funcionales extra indicados por producto.

## Auditoria rapida (estado actual vs referencia)

### Lo que ya existe y se conserva

- Board V2 con focos por periodo, fases 1/4 a 4/4 y CTA de ejercicio en Entrenado (`Entrenar`/`Repetir`).
- Vista separada para el ejercicio Entrenado y persistencia de intentos.
- Preview coach de la vista alumno en `ManageCoachingUserView`.
- Permisos por coach/super admin y soporte de `support_coach_user_id`.

### Gaps respecto a `coaching-final-version.html`

- Estructura visual distinta: hoy se usa layout tipo card/accordion/tabla; la referencia usa narrativa vertical con secciones (cabecera, recorrido, focos, espina de tareas, clases, reporte).
- Hoy el reporte esta modelado por clase (`coaching_session_classes.report`), mientras que la referencia requiere reporte por periodo.
- El recorrido (1..10) hoy no esta como barra clickeable principal de navegacion.
- Falta boton de chat junto al `x/4` para abrir modal con `focusComment`.
- Falta resolver visualmente regla de coachers mostrados: siempre `Luis + coach elegido`, y por clase mostrar quien cargo ese contenido.
- Falta acotar vista de notas maestras para coach a periodos 1..4 en esta V3.

### Notas de implementacion del HTML de referencia que SI aplican

- Un solo reporte por periodo.
- Una sola barra de tareas 1..6 (agregada de clase 1 y clase 2).
- Estados de reporte: `bloqueado` -> `en preparacion` -> `disponible`.
- Semantica visual: cian para en progreso, oro para logrado.

### Notas de implementacion del HTML de referencia que NO aplican

- No migrar tipografias propuestas en el HTML.
- No mostrar en UI la seccion "Notas de implementacion para Nahuel".

## Decisiones de arquitectura para V3

1. Crear una vista nueva V3 en vez de mutar fuertemente la V2 actual.
2. Mantener endpoints V2 existentes y extender contrato solo donde sea necesario (reporte por periodo, metadata de coachers visibles).
3. Mantener `period` como concepto de backend y mostrar "Semana" en copies UI cuando corresponda.
4. Reusar el runner de ejercicio actual sin cambiar su ruta funcional.

Propuesta de componentes:

- `CoachingV3SessionBoard.tsx` (contenedor principal alumno/coach).
- `coaching-v3/*` subcomponentes para secciones (Header, Timeline, Focuses, TaskSpine, Classes, PeriodReport).
- `coaching-v3/theme.css` o tokens Tailwind equivalentes para paridad visual light/dark.

## Fases del plan

## Fase 0 - Definicion funcional y contrato (antes de codificar UI)

### Objetivo

Cerrar las reglas que afectan datos para no rehacer UI despues.

### Tareas

- Confirmar y documentar estados del reporte por periodo:
  - `blocked`: faltan tareas (menos de 6 respuestas completas).
  - `preparing`: 6/6 tareas completas, coach aun no cargo reporte del periodo.
  - `available`: reporte del periodo cargado.
- Definir lectura de tareas 1..6:
  - tareas 1..3 desde clase 1 (guidelines 1..3)
  - tareas 4..6 desde clase 2 (guidelines 1..3)
  - progreso agregado unico.
- Definir reglas de coachers visibles:
  - cabecera equipo: siempre `Luis` + coach elegido de sesion.
  - tarjeta de clase: mostrar coach que hizo ultimo upsert de esa clase (`assigned_by_coach_user_id`).
- Definir restriccion de notas maestras en V3 coach:
  - renderizar seccion solo para periodos 1..4.

### Entregable

- Documento corto de contrato V3 (se puede anexar en `COACHING_V2_CONTRACT.md` o nuevo `COACHING_V3_CONTRACT.md`).

## Fase 1 - Ajustes minimos backend/db

### Objetivo

Introducir solo lo necesario para soportar reporte por periodo y datos de coacher en UI.

### Cambios de datos (minimos)

- Opcion A (recomendada): nueva tabla `coaching_v2_period_reports`.
  - claves: `session_id`, `period_number` (unique compuesto).
  - campos: `report_text`, `report_image_path`, `status` opcional derivable, `updated_by`, `created_at`, `updated_at`.
- Opcion B (menos recomendada): reutilizar clase 2 como "contenedor" de reporte de periodo.
  - evita migracion pero mezcla semanticas y complica mantenimiento.

### API

- Extender `v2-get-session-board` y `v2-get-session-board-member` para devolver:
  - `periodReport` del periodo seleccionado.
  - `coaches` metadata minima (`primaryCoachDisplayName`, `selectedCoachDisplayName`, `classAssignedCoachDisplayNameByClassIndex`).
- Nuevo action sugerido:
  - `v2-upsert-period-report` (coach-only).
- Mantener compatibilidad con clientes V2 existentes mientras se despliega V3.

### Entregables

- Migracion SQL (si se elige opcion A).
- Actualizacion de tipos en `src/modules/services/coaching.ts`.
- Tests unitarios basicos de serializacion/permiso en edge function.

## Fase 2 - Foundation de UI V3 (layout + tema)

### Objetivo

Montar esqueleto visual equivalente al HTML de referencia en React/Tailwind, con soporte light/dark y sin cambiar fuentes globales.

### Tareas

- Crear `CoachingV3SessionBoard` con secciones:
  - Cabecera
  - Tu recorrido (1..10)
  - Los tres focos
  - Esta semana (espina/tareas)
  - Tus clases
  - Reporte de periodo
- Implementar tokens visuales por variables/Tailwind:
  - cian: progreso actual.
  - oro: logros cerrados.
  - contraste dark corregido (fondos, bordes, texto secundario, estados hover/focus).
- Responsive parity:
  - desktop similar a referencia.
  - mobile con reflow equivalente (sin romper semantica).

### Entregables

- Vista V3 funcional con datos mockados del board real.
- Checklist de paridad visual (seccion por seccion).

## Fase 3 - Comportamientos clave requeridos (a-g)

### Objetivo

Alinear interacciones funcionales pedidas por producto.

### Tareas por requisito

- (a) Recorrido clickeable 1..10:
  - cada item cambia `selectedPeriod` y recarga board de ese periodo.
  - estados visuales: pasada, actual, futura.
- (b) Mostrar semanas en front:
  - reemplazar labels visibles a "Semana" manteniendo `periodNumber` internamente.
- (c) Boton chat junto a `x/4`:
  - icono burbuja abre modal con `focusComment`.
  - fallback "Sin comentario" si null.
- (d) Luis + coach elegido siempre visible:
  - cabecera equipo fija con ambos nombres.
  - si falta coach elegido, mostrar placeholder controlado.
- (e) Clase muestra quien la dio:
  - usar `assigned_by_coach_user_id` resuelto a display name.
  - si una clase la edito otro coach, esa clase muestra ese coach.
- (f) Mantener vista Entrenado:
  - en fase 2/4, CTA `Entrenar` (primary) si no intento.
  - CTA `Reintentar` (outline) si ya hay intento.
  - conservar ruta y flujo actual del runner.
- (g) Notas maestras para coach solo periodos 1..4:
  - condicionar render segun periodo seleccionado.
  - fuera de 1..4 mostrar estado informativo, no error.

### Entregables

- Flujo end-to-end V3 completo en alumno y coach preview.

## Fase 4 - Reporte por periodo y espina de tareas 1..6

### Objetivo

Cerrar el bloque funcional mas sensible: tareas agregadas y desbloqueo de reporte de periodo.

### Tareas

- Construir selector agregado de 6 tareas (de 2 clases x 3 guidelines).
- Implementar estados de reporte:
  - `bloqueado`: mostrar pendientes.
  - `en preparacion`: 6/6 completado, reporte aun no cargado por coach.
  - `disponible`: habilitar accion abrir reporte.
- UI coach para editar reporte de periodo.
- UI alumno para consumir reporte de periodo.

### Entregables

- Funcionalidad final de reporte por periodo en V3.
- Compatibilidad backward: reportes previos por clase siguen accesibles internamente hasta migracion total.

## Fase 5 - Integracion de rutas y rollout seguro

### Objetivo

Habilitar V3 sin riesgo para operacion diaria.

### Tareas

- Crear feature flag UI (`coaching_v3_ui`) o condicion por `programVersion` + toggle temporal.
- Inyectar V3 en:
  - `CoachingPersonalizedView` (alumno)
  - `ManageCoachingUserView` preview (coach)
- Mantener V2 disponible como fallback rapido.
- Documentar plan de rollback (switch a componente V2).

### Entregables

- Deploy controlado con fallback inmediato.

## Fase 6 - QA, accesibilidad y cierre

### Objetivo

Asegurar calidad visual/funcional antes de eliminar dependencias V2 en UI.

### QA funcional

- Alumno:
  - navegar periodos desde recorrido.
  - completar tareas y ver transicion de reporte.
  - abrir ejercicio Entrenado y reintentar.
- Coach:
  - editar clase, verificar coach asignado visible.
  - cargar reporte de periodo y validar cambio de estado.
  - ver notas maestras solo en periodos 1..4.

### QA visual

- Light/dark parity.
- Responsive desktop/mobile.
- Contraste AA basico en textos y controles.

### QA tecnico

- Tests unitarios de helpers de estado (timeline, reporte-state, tarea aggregate).
- Smoke tests de edge actions nuevas.
- Build + pruebas unitarias existentes.

### Entregables

- Checklist QA firmado.
- Ticket de deuda tecnica residual (si queda).

## Riesgos y mitigaciones

- Riesgo: mezclar reporte por clase y por periodo durante migracion.
  - Mitigacion: capa de adaptacion y feature flag hasta completar data migration.
- Riesgo: ambiguedad de nombres de coachers en cabecera/clases.
  - Mitigacion: devolver display names explicitos desde backend en board payload.
- Riesgo: regresiones en permisos de preview coach.
  - Mitigacion: mantener endpoint member/admin separado y tests de permiso.

## Orden recomendado de ejecucion

1. Fase 0
2. Fase 1
3. Fase 2
4. Fase 3
5. Fase 4
6. Fase 5
7. Fase 6

## Definicion de Done (V3)

- UI V3 replica disposicion/estilo de referencia (sin fuentes custom) en light/dark.
- Recorrido 1..10 es navegable y estable.
- Focos tienen modal de comentario por burbuja en `x/4`.
- Entrenado mantiene CTA y flujo actual de ejercicio.
- Reporte es por periodo con estados `bloqueado/en preparacion/disponible`.
- Cabecera y clases muestran coachers correctamente segun reglas.
- Notas maestras coach limitadas a periodos 1..4.
- V2 queda como fallback hasta cierre final.

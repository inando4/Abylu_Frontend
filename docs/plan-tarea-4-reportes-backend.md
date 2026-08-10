# Plan — Tarea 4 (Backend): analítica de cotizaciones aceptadas

> Documento autocontenido. Su par es `plan-tarea-4-reportes-frontend.md`.
> Repo: `/home/n4nd0/IdeaProjects/software-api` — Spring Boot 4.0.3 / Java 17, rama `test`.

---

## 1. Contexto

Última tarea numerada del roadmap (`plan-tarea-2-modo-invitado.md` §11). El objetivo es
responder **cuánto se ha vendido de verdad** y **si eso es mejor o peor que antes**, sobre las
cotizaciones aceptadas.

### La restricción que define todo el diseño

**No existe fecha de aceptación en el modelo.** `Cotizacion` solo tiene `fechaCreacion`
(`LocalDateTime`) y `fechaEvento` (`LocalDate`); `PATCH /{id}/estado` cambia el estado sin sellar
ningún timestamp.

Consecuencia: *"aceptadas en agosto"* no puede significar *aceptadas durante agosto*. Solo puede
significar **eventos de agosto cuyo estado HOY es ACEPTADA**. Por eso todo se agrupa por
`fecha_evento`, que además es la semántica natural del catering (el ingreso se realiza el día del
evento) y evita líos de zona horaria al ser `LocalDate`.

Efecto secundario a documentar: **las cifras de un mes ya pasado pueden subir** si más adelante se
acepta una cotización antigua.

## 2. Decisiones (entrevista 2026-08-07 — no relitigar)

| Decisión | Elección |
|---|---|
| Eje temporal | `fecha_evento`, no `fecha_creacion` |
| Granularidad | **Mensual**, no semanal: los eventos son esporádicos y una serie semanal saldría casi toda en cero. Anula la duda "¿lunes o domingo?" del roadmap |
| Universo | El dinero solo de ACEPTADAS; la conversión usa además ENVIADA/RECHAZADA |
| Comparación | **Dos**: periodo contiguo anterior y mismo periodo del año pasado |
| Alcance por rol | Igual que Tarea 3: `SecurityUtils.esInvitado()` en el service, sin reglas en `SecurityConfig` |

## 3. Implementación

### 3.1 `repository/projection/` (nuevo)

Seis interfaces de proyección: `ResumenEstadoProjection`, `SerieMensualProjection`,
`TopProductoProjection`, `TipoEventoProjection`, `ClienteRecurrenteProjection`,
`ItemManualProjection`.

### 3.2 `CotizacionRepository` — 10 queries de agregación

Todas con `c.demo = :demo AND c.fechaEvento BETWEEN :desde AND :hasta`. **HQL portable**
(`year()`/`month()` de Hibernate), no `date_trunc` nativo.

> ⚠️ **Invariante de seguridad.** Tres queries parten de `DetalleCotizacion`
> (`topProductos`, `itemsFueraCatalogo`, `idsProductosVendidos`). `DetalleCotizacion` **no tiene
> columna `demo`**: el alias `c` no existe hasta escribir `JOIN d.cotizacion c`. Sin ese join no
> hay forma de aplicar el ámbito y un INVITADO vería datos reales. Los tests mockean el
> repositorio y **no pueden detectarlo** — se verifica por curl (§5).

Detalles no obvios:
- `topProductos` hace `JOIN d.producto p` (inner): descarta los ítems manuales, que tienen su
  propio agregado.
- `itemsFueraCatalogo` agrupa por `lower(trim(d.descripcionManual))` — es texto libre y sin
  normalizar "Torta" y "torta " serían filas distintas. El `select` usa `min(...)` para conservar
  una capitalización legible.
- `rangoFechasEvento` (min/max) resuelve el preset "Todo".
- `fechasAceptadas` devuelve pares `(fechaCreacion, fechaEvento)`; el promedio se hace en Java.

### 3.3 `AnaliticaService` (nuevo)

- `boolean demo = SecurityUtils.esInvitado()` — único punto donde se decide el ámbito.
- **Rango resuelto**: params opcionales; si faltan se toma `MIN`/`MAX` de `fecha_evento` y **se
  devuelve el rango aplicado**, para que el frontend no tenga que conocer el histórico. Rango
  invertido → 400 vía `ResponseStatusException` (lo traduce `GlobalExceptionHandler`).
- **Tasa de aceptación** = `aceptadas / (aceptadas + rechazadas + enviadas)`. Los BORRADOR se
  excluyen porque nunca salieron al cliente. Denominador 0 → `null`, no 0.0: un 0% haría pensar
  que se perdieron ventas.
- **Relleno de meses vacíos** con cero. Solo añade ceros: **nunca trunca ni reagrupa**, porque
  `ingresoAceptado` tiene que seguir siendo exactamente la suma de `serieMensual[].ingreso`.
- **Comparación**: `calcularKpis(demo, desde, hasta)` se reutiliza tal cual para los dos periodos
  de referencia. Solo se comparan escalares, nunca las listas. Delta = fracción (`0.23` = +23%),
  `null` si la base es 0 — no existe crecer un % desde cero.
- **Antelación**: `ChronoUnit.DAYS.between(fechaCreacion.toLocalDate(), fechaEvento)`, en Java
  por portabilidad. Los negativos (cotización registrada después de su evento) se **descartan y
  se cuentan aparte** en vez de arrastrar la media.
  ⚠️ Mide cuándo se **cotizó**, no cuándo el cliente aceptó.
- **Productos sin salida**: reutiliza `ProductoRepository.findByActivoTrueAndDemoOrderByNombreAsc`
  (ya existía) menos `idsProductosVendidos`.

### 3.4 `dto/analitica/` — 11 POJOs

Estilo del proyecto (constructor + getters de una línea, sin Lombok). `AnaliticaResumenResponse`
es la excepción: usa setters, porque un constructor de quince argumentos es ilegible.

### 3.5 `AnaliticaController`

`GET /api/analitica/resumen?desde=&hasta=`, ambos opcionales.
**No se toca `SecurityConfig`**: la cadena termina en `.anyRequest().authenticated()`.

### 3.6 Índice

`@Table(indexes = @Index(name = "idx_cotizacion_fecha_evento", columnList = "fecha_evento"))` en
`Cotizacion`. `ddl-auto=update` lo crea al arrancar.

## 4. Tests — `AnaliticaServiceTest` (14 casos, verdes)

Mockito puro, estilo `CotizacionServiceTest`. Cubre: tasa con denominador 0, ticket sin aceptadas,
relleno de meses **y el invariante de suma**, deltas (positivo/negativo/base 0), antelación con
negativos descartados, productos sin salida, rango resuelto y propagación de `demo=true` a las
diez queries.

Las proyecciones se implementan con clases anónimas, no con `mock()`: son puros getters y así no
hay stubs sobrantes que hagan fallar el modo strict.

⚠️ **El HQL no queda cubierto** — los tests mockean el repositorio.

## 5. Verificación

```bash
./mvnw test                 # suite unitaria
./mvnw spring-boot:run      # requiere Postgres en :5432

curl -H "Authorization: Bearer <jwt>" \
  'localhost:8090/api/analitica/resumen?desde=2026-01-01&hasta=2026-12-31'
```

1. Los números cuadran contra `/api/cotizaciones`.
2. `ingresoAceptado` == suma de `serieMensual[].ingreso`.
3. **Aislamiento**: repetir con token INVITADO y con CLIENTE. Revisar **cada lista**, sobre todo
   `topProductos`, `itemsFueraCatalogo` y `clientesRecurrentes`.
4. Deltas: pedir "este mes" y contrastar a mano contra el mes anterior y el mismo del año pasado.

## 6. Fuera de alcance

Sin `fecha_aceptacion` (se valoró; cambiaría la semántica a "aceptadas durante X" pero dejaría sin
dato al histórico). Sin costos por producto, sin motivo de rechazo, sin exportación.

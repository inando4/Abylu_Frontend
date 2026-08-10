# Plan — Tarea 4 (Frontend): página de reportes

> Documento autocontenido. Su par es `plan-tarea-4-reportes-backend.md`.
> Repo: `/home/n4nd0/Documentos/Abylu_Frontend` — Angular 19.2 standalone + Tailwind v4 + SSR,
> rama `test`.

---

## 1. Contexto y objetivo

Una página que responda, de un vistazo y en móvil: cuánto se vendió, si va mejor o peor que
antes, cuándo se concentran los eventos, qué productos venden y cuáles no, y quién repite.

Todo sale de una sola llamada a `GET /api/analitica/resumen`. La ruta se llama `/reportes` (el
roadmap la esbozaba como `/analitica`; el endpoint sí conserva ese nombre).

## 2. Decisiones (entrevista 2026-08-07 — no relitigar)

| Decisión | Elección |
|---|---|
| Gráficos | **SVG inline a mano**, cero dependencias. Ni Chart.js ni ng2-charts |
| Eje temporal | `fechaEvento` — permite ver también los eventos futuros ya vendidos |
| Comparación | Dos modos conmutables: periodo anterior / año pasado |
| Roles | Misma página para ambos; el backend decide el ámbito por el token |

## 3. Implementación

### 3.1 `shared/models/analitica.model.ts`

Espejo de `dto/analitica/`. Contrato de red: la forma debe calcar al backend. Reexportado en
`shared/models/index.ts`.

Ojo con los `| null`: `ticketPromedio`, `tasaAceptacion` y los tres `delta*` son `null` cuando no
hay base con la que calcular. La UI pinta `—`, nunca `0`.

### 3.2 `core/services/analitica.service.ts`

Un solo método `resumen(desde?, hasta?)`. Exportado en `core/services/index.ts` (a diferencia de
`AuthService`, que quedó fuera del barrel y obliga a imports por ruta directa).

### 3.3 `pages/reportes/` — seis secciones

```
1  Periodo        chips [Este mes][Últimos 6 meses][Este año][Todo] + rango libre
                  + chips de comparación [Periodo anterior][Año pasado]
2  Resumen        hero cacao con ingreso y delta · ticket · conversión
                  franja rose de pendientes · micro-línea de antelación
3  Ingresos/mes   barras SVG, tocar una muestra su detalle
4  Productos      top 5 + colapsable "sin ventas" + bloque fuera de catálogo
5  Tipo de evento cantidad, ingreso y % del total
6  Clientes       ≥2 eventos → toca y abre el historial ya filtrado
```

Estado manual (`resumen`, `cargando`, `error`, `presetActivo`, `modoComparacion`) con
`.subscribe({next, error})`, igual que `HistorialComponent`. Sin signals ni AsyncPipe: no se
introduce un patrón nuevo.

Detalles no obvios:

- **`iso()` propio en vez de `toISOString()`**: éste convierte a UTC y en Lima (UTC−5) restaría un
  día, mandando el rango equivocado.
- **Cambiar de comparación no recarga**: los dos periodos vienen en la misma respuesta. Es solo
  repintar. (Lo cubre el test RP-004.)
- **El preset "Todo" se manda sin fechas** y los inputs se rellenan con el rango que devuelve el
  backend — el frontend no puede saber dónde empieza el histórico.
- **Editar una fecha a mano** pone `presetActivo = 'custom'`: ningún chip queda activo.
- **Las barras se calculan una vez por respuesta** (`construirBarras`), no en un getter: el
  template lo leería en cada ciclo de detección de cambios.
- Con más de 14 meses el contenedor hace scroll horizontal en vez de aplastar las barras, y las
  etiquetas se muestran salteadas.

### 3.4 Gráfico

Tres colores que **significan cosas distintas**, no decoran:

| Color | Significado |
|---|---|
| Cacao `--color-ink` | Mes ya ocurrido |
| Rose `--color-terracotta-dark` | Mes en curso |
| Rose-soft punteado | Evento futuro ya vendido |

Lo último es el argumento del eje `fechaEvento`: se ve la carga de trabajo comprometida, algo que
un reporte por fecha de emisión no puede mostrar.

**No se dibuja la serie del periodo comparado**: el backend solo devuelve escalares de
comparación, y superponer dos series de 12 meses en 480 px sería ilegible. La comparación vive en
los KPIs, que es donde aporta.

### 3.5 Cableado

1. `app.routes.ts` — ruta lazy con `authGuard`. `app.routes.server.ts` no se toca (`**` → Client).
2. **`styles.css`** — `app-reportes` añadido al selector del fondo crema. Sin esto la página sale
   con fondo blanco.
3. **`header.component.html`** — link "Reportes" en los **dos** navs (desktop y móvil; el móvil
   lleva `(click)="cerrarMenu()"`).
4. **`historial.component.ts`** — lee `?telefono=` de `queryParamMap` y siembra `telefonoBusqueda`
   antes de la primera carga. El filtro por prefijo ya existía en `CotizacionService.listar()`.

### 3.6 Diseño (uniformidad — regla de oro)

Se reutilizan `.app-shell`, `.page-title`, `.section`, `.section-title .num`, `.field`, `.input`,
`.row-2`, `.sk-line`, `.error-banner`. Chip activo = **cacao con texto blanco** (el rose-soft se
reserva a acentos). El colapsable de "sin ventas" replica el de **Desactivados** en `/productos`.

Deltas: `--color-mint` para lo que sube, `--color-terracotta-dark` para lo que baja. No se inventa
paleta semántica nueva.

⚠️ El CSS pesa **7.32 kB**: supera el warning de 4 kB pero no el error de 8 kB — igual que
`cotizacion.component.css` (7.10) y `productos.component.css` (6.60).

## 4. Tests — `e2e/reportes.spec.ts` (RP-001…RP-007)

Modo **serial** con `entrarComoInvitado()`, como `productos.spec.ts`. Comprueban estructura y
comportamiento, **no cifras**: afirmar "S/ 12,450" haría el test rehén del seed. RP-006 y RP-007
se auto-saltan si el demo no tiene aceptadas o clientes repetidos.

No se usa `cotizacion.spec.ts` de plantilla: está desactualizado (navega sin autenticarse y el
`authGuard` lo redirige).

## 5. Verificación

```bash
npx ng build                       # budgets
npx ng serve                       # con el backend en :8090
npm run test:e2e                   # chromium + mobile-chrome
```

Recorrer: presets, rango libre, ambos modos de comparación, colapsable, clic en cliente recurrente
(debe llegar al historial ya filtrado), estado vacío, y **fondo crema** (prueba de que el paso 3.5.2
se hizo).

Entorno E2E: Playwright usa `127.0.0.1`, así que el backend necesita
`CORS_ORIGINS="http://localhost:4200,http://127.0.0.1:4200"`. Si `mvnw spring-boot:run` se mató con
`pkill`, queda un fork ocupando `:8090` → `fuser -k 8090/tcp`.

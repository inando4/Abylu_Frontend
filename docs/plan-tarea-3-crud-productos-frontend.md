# Plan — Tarea 3 (Frontend): CRUD de productos

> Documento autocontenido. Complementa `plan-tarea-3-crud-productos-backend.md` (backend ya
> implementado el 2026-07-14, 79 tests verdes). **Incluye una sección de ajustes al backend**
> (§4) derivada de una decisión nueva de la entrevista del frontend: el modo invitado también
> usa el CRUD, sobre datos demo.

---

## 1. Contexto

- **Frontend:** `/home/n4nd0/Documentos/Abylu_Frontend` — Angular 19.2 standalone + Tailwind v4 + SSR. Rama `test`.
- **Backend:** `/home/n4nd0/IdeaProjects/software-api` — Spring Boot 4.0.3 / Java 17 / Postgres.
- API de gestión ya disponible: `GET /api/productos/gestion`, `GET /categorias`, `POST`,
  `PUT /{id}` (escalas en bloque: `null`=no tocar, `[]`=borrar todas; `activo:true` reactiva),
  `DELETE /{id}` (soft delete → 204). DTOs: `CrearProductoRequest { nombre, precioUnitario,
  categoria, activo?, escalas: [{cantidad, precioTotal}] }` y `ProductoGestionResponse
  { id, nombre, precioUnitario, categoria, activo, escalas: [{id, cantidad, precioTotal}] }`.
- Piezas frontend existentes que se reutilizan: `AuthService` (signals `usuario`, `rol`,
  `esInvitado`), `ProductoService` (`listarActivos`, `listarEscalas`), header con nav
  desktop/mobile, patrón visual `.app-shell` / `.page-title` / `.section` / `.section-title .num`,
  skeletons del historial, y el patrón bottom-sheet del picker de cotización
  (`pickerOpen`, backdrop, sheet).
- **Dato del modelo a corregir:** `Producto.categoria` está tipado `'ilimitado' | 'snack'`
  pero el catálogo real usa `'Estacion Salada'`, `'Estacion Candy'`, `'Estacion Bebidas'`,
  `'Estacion Dulce'`, `'ilimitado'`. Hay que ensancharlo a `string`
  (`formatCategoria` del picker ya maneja el caso genérico).

---

## 2. Objetivo

Página `/productos` donde **cualquier usuario autenticado** gestiona su catálogo:
- **CLIENTE (dueño):** su catálogo real.
- **INVITADO (visitante/reclutador):** el catálogo **demo** — puede probar el CRUD completo
  sin tocar datos reales, igual que con las cotizaciones. El catálogo demo se **restaura en
  cada login de invitado** (si un visitante lo deja hecho un desastre, el siguiente lo
  encuentra limpio).

---

## 3. Decisiones de la entrevista (2026-07-15 — NO relitigar)

1. **Una sola ruta `/productos` + bottom-sheet:** lista arriba, formulario de crear/editar en
   bottom-sheet (mismo patrón que el picker de cotización). Sin rutas hijas.
2. **Lista agrupada por categoría, desactivados al final:** grupos por `categoria` mostrando
   solo activos; sección colapsable «Desactivados (n)» al final con botón **Reactivar**.
3. **«Desactivar» con confirmación:** el botón dice Desactivar (nunca «Eliminar»), y pide
   confirmación antes (paso extra elegido por el usuario). Al confirmar → DELETE → la fila
   pasa a Desactivados.
4. **El INVITADO usa el CRUD con datos demo** (cambio de alcance respecto al plan backend):
   el enlace «Productos» del header es visible para ambos roles y la página funciona igual;
   lo que cambia es el ámbito de datos que el backend devuelve/escribe según el rol.

---

## 4. Ajustes al BACKEND (previos al frontend)

El backend actual restringe la gestión a CLIENTE. Hay que abrirla a ambos roles con alcance
por `demo`, reutilizando la maquinaria de la Tarea 2:

### 4.1 `SecurityConfig`
Quitar los cuatro `requestMatchers(...).hasRole("CLIENTE")` de `/api/productos/**` añadidos
en la Tarea 3-backend: con eso las rutas vuelven a caer en `anyRequest().authenticated()`,
que es exactamente lo que se quiere (ambos roles autenticados).

### 4.2 `ProductoRepository`
- `findByDemoFalseOrderByNombreAsc()` → generalizar a `findByDemoOrderByNombreAsc(boolean demo)`.
- `findCategoriasReales()` → parametrizar:
  `@Query("select distinct p.categoria from Producto p where p.demo = :demo and p.categoria is not null")`
  `List<String> findCategorias(boolean demo)`.

### 4.3 `ProductoService` (alcance por rol, patrón Tarea 2)
- `listarGestion()` → `findByDemoOrderByNombreAsc(SecurityUtils.esInvitado())`.
- `listarCategorias()` y `validarCategoria(...)` → `findCategorias(esInvitado())`.
- `crear()` → `producto.setDemo(SecurityUtils.esInvitado())` (antes: `false` fijo).
- `actualizar()`/`eliminar()` → **sin cambios**: `verificarAmbito` ya es bidireccional
  (INVITADO sobre producto real → 404, CLIENTE sobre demo → 404).

### 4.4 `DemoDataService` — restaurar el catálogo demo en cada login de invitado
Hoy `ensureCatalogo()` es solo idempotente (si existe, no hace nada): un invitado que edite
o desactive productos demo se los deja rotos al siguiente. Cambiar el reset del login a:

1. Borrar cotizaciones demo (**primero** — sus `detalle_cotizacion` referencian productos demo).
2. Borrar escalas de productos demo y luego los productos demo.
3. Re-sembrar catálogo demo + cliente demo (`0000000000`, si no existe).
4. Re-sembrar las 1–2 cotizaciones de ejemplo.

### 4.5 Tests a actualizar (convención: sin tests no está terminado)
- `ProductoControllerSecurityTest`: INVITADO ahora espera **200/201/204** en gestión (con el
  service mockeado); «sin token → 401» se mantiene.
- `ProductoServiceTest`: nuevo caso «como INVITADO, `crear` fuerza `demo=true`» — montar el rol
  en el `SecurityContextHolder` con un `TestingAuthenticationToken` + authority `ROLE_INVITADO`
  (y limpiar el contexto en `@AfterEach`). Ajustar los stubs a las queries parametrizadas.
- `DemoDataService`: si tiene tests, cubrir que el reset restaura un producto demo editado.
- Actualizar el CLAUDE.md del backend (sección API: la gestión ya no es solo-CLIENTE, el
  ámbito lo da el rol).

### 4.6 Checklist de seguridad (re-verificar por curl)
- [ ] `POST /api/productos` como INVITADO crea con `demo=true` y valida categoría contra las demo.
- [ ] `GET /gestion` y `/categorias` como INVITADO devuelven **solo** demo; como CLIENTE solo real.
- [ ] INVITADO sobre id real y CLIENTE sobre id demo → **404**.
- [ ] Segundo `POST /auth/guest` restaura un catálogo demo editado/desactivado.
- [ ] Sin token → 401 en todos los endpoints de gestión.

---

## 5. Implementación FRONTEND

### 5.1 Modelos (`shared/models/producto.model.ts`) — contratos de wire, deben calcar los DTOs
- `Producto.categoria` → `string` (ensanchar el union type).
- Nuevos:
  ```ts
  export interface EscalaGestion { id: number; cantidad: number; precioTotal: number; }
  export interface ProductoGestion {
    id: number; nombre: string; precioUnitario: number;
    categoria: string; activo: boolean; escalas: EscalaGestion[];
  }
  export interface EscalaRequest { cantidad: number; precioTotal: number; }
  export interface CrearProductoRequest {
    nombre: string; precioUnitario: number; categoria: string;
    activo?: boolean;                  // solo PUT (reactivación)
    escalas: EscalaRequest[] | null;   // null = no tocar (PUT); [] = borrar todas
  }
  ```
- Exportarlos en `shared/models/index.ts`.

### 5.2 `ProductoService` — métodos nuevos
```ts
listarGestion(): Observable<ProductoGestion[]>          // GET  /gestion
listarCategorias(): Observable<string[]>                // GET  /categorias
crear(req: CrearProductoRequest): Observable<ProductoGestion>          // POST
actualizar(id: number, req: CrearProductoRequest): Observable<ProductoGestion> // PUT /{id}
eliminar(id: number): Observable<void>                  // DELETE /{id}
```

### 5.3 Ruta y navegación
- `app.routes.ts`: `path: 'productos'`, `canActivate: [authGuard]`, `loadComponent` lazy →
  `pages/productos/productos.component`.
- `app.routes.server.ts`: verificar que `/productos` caiga en render **Client** (patrón actual:
  splash/login Prerender, resto Client — si hay wildcard no hay nada que tocar).
- Header (`components/header/`): enlace «Productos» **para ambos roles**, en nav desktop y
  mobile, entre «Historial» y el chip de usuario. Sin rotulado especial: el chip «Modo
  invitado» existente ya comunica el contexto.

### 5.4 `ProductosComponent` (`pages/productos/`) — estructura
- **Título:** `.page-title` con eyebrow «Gestión» (color `#E9648A`, como todas), h1 «Productos»,
  sub «Crea, edita y organiza tu catálogo.»
- **Sección 1 · Catálogo** (`.section` + `.section-title .num`):
  - Productos activos agrupados por `categoria` (label de grupo con `formatCategoria`-like).
  - Cada fila: nombre, precio unitario (S/), chips pequeños con las escalas (`50 → S/400`),
    acciones **Editar** (abre sheet precargado) y **Desactivar** (abre confirmación).
  - CTA primario «+ Nuevo producto» (gradiente cacao, patrón `.btn-primary`).
  - Skeleton de carga (patrón historial) y empty state con invitación a crear el primero.
- **Sección 2 · Desactivados**, colapsable (`▸ Desactivados (n)`, cerrada por defecto; si
  n=0, no se renderiza): filas atenuadas con botón **Reactivar** → `PUT { ...datos, activo:
  true, escalas: null }` (null = conserva sus escalas intactas).
- **Bottom-sheet de formulario** (crear/editar — mismo componente, `modoEdicion` según haya id):
  - Reactive Forms: `nombre` (required), `precioUnitario` (required, > 0), `categoria`
    (select poblado con `listarCategorias()`), `escalas` FormArray de `{cantidad, precioTotal}`
    (ambos > 0) con botón «+ Añadir escala» y quitar por fila.
  - Validator custom a nivel de FormArray: cantidades únicas (mismo error 400 que daría el
    backend, mejor atajarlo en el cliente).
  - En editar, precarga con el `ProductoGestion` y al guardar envía la lista **completa** de
    escalas (reemplazo en bloque). En crear, `escalas: []` si no añadió ninguna.
  - Estados: `guardando` (botón deshabilitado con texto «Guardando…»), error del backend
    visible dentro del sheet (mensaje del `GlobalExceptionHandler`).
  - Al éxito: cerrar sheet + recargar `listarGestion()`.
- **Confirmación de desactivar:** mini-sheet (reuso del patrón bottom-sheet, contenido corto):
  «¿Desactivar “Popcorn”?» + nota «Dejará de aparecer al cotizar. Podrás reactivarlo desde
  Desactivados.» + botones «Desactivar» (primario) / «Cancelar» (ghost).

### 5.5 Diseño (uniformidad — regla de oro)
- Al implementar, **usar la skill `/frontend-design`**, con esta restricción explícita: el
  sistema visual ya existe (Happy Hues + Propuesta B híbrida) y **manda**. Nada de paletas ni
  tipografías nuevas: tokens de `src/styles.css` (`var(--color-...)`), CTA cacao
  (`linear-gradient(180deg, #33272A, #1F1618)` + texto crema), chips activos cacao,
  rose-soft `#FFC6C7` solo para acentos suaves (los chips de escalas son el lugar natural),
  eyebrow `#E9648A`, `.app-shell` max-width 480px, focus rings cacao.
- El toque distintivo (único y contenido): los **chips de escalas** en cada fila del catálogo
  — hacen visible de un vistazo la estructura de precios, que es la información que
  diferencia esta página. Todo lo demás, sobrio y calcado a historial/cotización.
- Piso de calidad: responsive ≤480px, focus visible, `prefers-reduced-motion` respetado en la
  animación del sheet (igual que el picker).

### 5.6 Sin cambios
- `authGuard`, interceptor, login: intactos. El rol viaja en el token; la página no bifurca
  por rol (ni lo necesita: el backend decide el ámbito).
- El picker de cotización no se toca (ya lee `listarActivos()`, que refleja altas/bajas).

---

## 6. Verificación end-to-end

Nota operativa: sandbox de Bash bloquea TCP a localhost → `dangerouslyDisableSandbox: true`
para backend/`ng serve`/curl. Backend de prueba en `PORT=8092` si :8090 está ocupado.

1. **Backend primero** (§4): `./mvnw test` verde + checklist §4.6 por curl.
2. `npx ng build --configuration development` (valida tipos y prerender SSR).
3. **Playwright (patrón Tareas 1–2), como CLIENTE:** login → `/productos` → crear producto
   con 2 escalas → aparece en su grupo → editar (cambiar precio y una escala) → desactivar
   (con confirmación) → aparece en «Desactivados» → verificar que desapareció del picker de
   `/cotizacion` → reactivar → vuelve al picker con sus escalas.
4. **Como INVITADO:** «Entrar como invitado» → `/productos` muestra **solo** catálogo demo →
   crear/editar/desactivar un producto demo → el picker de cotización demo lo refleja →
   re-login invitado → catálogo demo restaurado.
5. **Red:** en DevTools, confirmar que las requests llevan `Authorization: Bearer` y que en
   modo invitado nunca aparece un producto real en las respuestas.

---

## 7. Referencia rápida (frontend)

- Página espejo de patrones: `pages/historial/` (secciones, skeleton, lista) y
  `pages/cotizacion/` (bottom-sheet del picker: `pickerOpen`, backdrop, `cerrarPicker`).
- Header: `components/header/header.component.{ts,html,css}` (nav desktop + drawer mobile).
- Tokens: `src/styles.css` bajo `@theme { ... }`; ojo con los `rgba(...)` hardcodeados en
  `cotizacion.component.css` / `header.component.css` si se cambia algún hex (no aplica aquí:
  no se cambian colores).
- Backend de referencia: `ProductoController` / `ProductoService` / `DemoDataService` en
  `com.abylu.software_api`.

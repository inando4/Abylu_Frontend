# Plan — Tarea 3 (Backend): CRUD de productos

> **⚠️ ADDENDUM (2026-07-15):** implementado tal cual el 2026-07-14 (79 tests verdes), pero la
> entrevista del frontend cambió una decisión: el **INVITADO también usa el CRUD, sobre el
> catálogo demo**. Los ajustes (quitar `hasRole("CLIENTE")`, alcance `demo = esInvitado()` en
> gestión, restauración del catálogo demo en cada login de invitado) están especificados en
> **§4 de `plan-tarea-3-crud-productos-frontend.md`**, que prevalece sobre las secciones 3.1,
> 4.1 y 5.4 de este documento.

> Documento autocontenido para ejecutar en una sesión nueva de chat. Cubre **solo el backend**
> (`/home/n4nd0/IdeaProjects/software-api`). El frontend tendrá su propio plan aparte
> (`plan-tarea-3-crud-productos-frontend.md`, aún por escribir) que consumirá esta API.

---

## 1. Contexto del proyecto

Sistema de cotizaciones "Abylu". Backend: Spring Boot **4.0.3** / Java 17 / Postgres, paquete
base `com.abylu.software_api`, rama de trabajo del frontend `test`. ⇒ **Spring Security 7**
(DSL lambda) + **jjwt 0.12.6**. Postgres local `localhost:5432/AbyluDB` (postgres/chacha),
normalmente en el contenedor Docker `postgresql-db-1`. Esquema por `ddl-auto=update` (sin Flyway).

### Estado actual (Tareas 1 y 2 HECHAS)
- **Login JWT:** usuario `abylu` (rol `CLIENTE`) y usuario `invitado` (rol `INVITADO`) sembrados
  por `DataInitializer`. `JwtAuthenticationFilter` + `CustomUserDetailsService` (authority
  `ROLE_<rol>`). Entry point custom → 401.
- **Modo invitado:** columna `demo` en `producto`/`cotizacion`; `SecurityUtils.esInvitado()` y
  `SecurityUtils.verificarAmbito(Boolean demo)` (lanza 404 si el ámbito no coincide con el rol);
  `DemoDataService` siembra catálogo demo y resetea cotizaciones demo en cada `POST /auth/guest`.
- **`GlobalExceptionHandler`** (`exception/`): traduce `ResponseStatusException` a su código real
  (crítico: si escapa, el re-dispatch a `/error` responde 401), `MethodArgumentNotValidException`
  → 400 con el primer field error, `AccessDeniedException` → 403.
- **`spring-boot-starter-validation`** ya está en el `pom.xml` (se usa `@Valid` en cotizaciones).
- **Convención nueva en CLAUDE.md del backend:** toda funcionalidad nueva debe llegar con sus
  tests; no se considera terminada hasta que `./mvnw test` pasa completo (55 tests actuales).

### Código existente relevante
- `model/Producto`: `id, nombre, precioUnitario (Double), categoria (String), activo (Boolean, default true), demo (Boolean, @ColumnDefault("false"))`.
- `model/ProductoPrecioEscala`: `id, producto (@ManyToOne optional=false), cantidad (Integer), precioTotal (Double), activo` + **unique constraint `(producto_id, cantidad)`**.
- `ProductoRepository`: `findByActivoTrueAndDemoOrderByNombreAsc(boolean)`, `existsByDemoTrue()`, etc.
- `ProductoPrecioEscalaRepository`: `findByActivoTrueAndProducto_Demo(boolean)`, `findByProductoIdAndCantidadAndActivoTrue(...)`.
- `ProductoService`: `listarActivos()`, `listarEscalasActivas()` (ambos filtran por `demo = esInvitado()`), `buscarPorId(id)` (con `verificarAmbito`).
- `ProductoController`: `GET /api/productos`, `GET /api/productos/escalas` (este último devuelve `List<Map<String,Object>>` con `id, productoId, cantidad, precioTotal`).
- `SecurityConfig.filterChain`: OPTIONS y `/api/auth/**` y `/error` → `permitAll`; `anyRequest().authenticated()`. **Aquí se insertan las reglas nuevas por rol.**
- Los precios se **copian** al `detalle_cotizacion` al crear/editar una cotización
  (`poblarCotizacion`), así que editar precios de un producto NO altera cotizaciones históricas.
- `DetalleCotizacion.producto` es FK **nullable** a `producto` → borrar físico rompería
  cotizaciones históricas; por eso el borrado es lógico.

---

## 2. Objetivo

Que el **dueño (rol CLIENTE)** pueda gestionar el catálogo real desde la app: crear, editar,
desactivar y **reactivar** productos con sus escalas de precio. Un **INVITADO no puede escribir
nada** ni ver los endpoints de gestión (el catálogo demo lo administra solo `DemoDataService`).

---

## 3. Decisiones tomadas en la entrevista (2026-07-14 — NO relitigar)

1. **Autorización por reglas en `SecurityConfig`** (`requestMatchers(HttpMethod.X, ...).hasRole("CLIENTE")`),
   no `@PreAuthorize`. Centralizado y auditable.
2. **Escalas embebidas en el producto:** `POST/PUT /api/productos` llevan la lista de escalas en
   el mismo body y el backend las **reemplaza en bloque** (mismo patrón que el PUT de
   cotizaciones con sus detalles). No hay endpoints CRUD separados para escalas.
3. **La gestión muestra también inactivos:** endpoint de gestión que lista todos los productos
   reales; el PUT permite volver a `activo=true` (reactivación).
4. **DELETE = siempre soft delete** (`activo=false`). Nunca borrado físico de productos.
5. **Categoría restringida a las existentes:** el backend valida contra el set de categorías ya
   usadas en el catálogo real; el frontend ofrecerá un select. Añadir una categoría nueva
   requiere tocar datos/código (aceptado).

---

## 4. Diseño de la API

### 4.1 Endpoints nuevos en `ProductoController` (base `/api/productos`)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `GET` | `/gestion` | CLIENTE | Todos los productos **reales** (`demo=false`), activos e inactivos, con sus escalas activas embebidas. Orden por nombre. |
| `GET` | `/categorias` | CLIENTE | Categorías distintas del catálogo real (para el select del form). |
| `POST` | `` (raíz) | CLIENTE | Crea producto + escalas. Responde **201** con el producto de gestión. |
| `PUT` | `/{id}` | CLIENTE | Actualiza producto (incluido `activo` para reactivar) y **reemplaza en bloque** sus escalas. |
| `DELETE` | `/{id}` | CLIENTE | Soft delete: `activo=false`. Responde **204**. |

Los `GET` existentes (`/api/productos`, `/api/productos/escalas`) no cambian de contrato y siguen
accesibles para ambos roles (filtran por `demo`).

### 4.2 DTOs nuevos (`dto/`, estilo POJO con getters/setters manuales, como `ItemCotizacionRequest`)

```
CrearProductoRequest {            // sirve para POST y PUT
    String nombre;                // @NotBlank
    Double precioUnitario;        // @NotNull @Positive
    String categoria;             // @NotBlank + validación server-side contra categorías existentes
    Boolean activo;               // solo lo usa el PUT (reactivación); en POST se ignora → true
    List<EscalaRequest> escalas;  // @Valid; puede ser vacía/null (p. ej. ilimitados)
}
EscalaRequest {
    Integer cantidad;             // @NotNull @Positive
    Double precioTotal;           // @NotNull @Positive
}
ProductoGestionResponse {
    Long id; String nombre; Double precioUnitario; String categoria; Boolean activo;
    List<EscalaResponse> escalas;   // solo escalas activas
}
EscalaResponse { Long id; Integer cantidad; Double precioTotal; }
```

Validaciones adicionales en el service (no expresables con anotaciones):
- `categoria` debe pertenecer al set de categorías existentes del catálogo real → si no, 400
  (`ResponseStatusException(BAD_REQUEST)`).
- Cantidades de `escalas` **sin duplicados** dentro del request → 400 (chocarían con el unique
  constraint `(producto_id, cantidad)` y saldría un 500 feo).

---

## 5. Pasos de implementación

Respetar el estilo del proyecto: inyección por constructor, repos con queries derivadas,
comentarios en español.

### 5.1 Repositorios
- `ProductoRepository`:
  - `List<Producto> findByDemoFalseOrderByNombreAsc()` — listado de gestión (activos + inactivos).
  - `@Query("select distinct p.categoria from Producto p where p.demo = false")` →
    `List<String> findCategoriasReales()` (query derivada no cubre `distinct` sobre un campo;
    usar `@Query` JPQL está bien aquí).
- `ProductoPrecioEscalaRepository`:
  - `List<ProductoPrecioEscala> findByProductoIdOrderByCantidadAsc(Long productoId)` — para
    armar el response de gestión y para el reemplazo en bloque.
  - `void deleteByProductoId(Long productoId)` — reemplazo en bloque (requiere `@Modifying` o
    llamarse dentro de método `@Transactional` del service; ver 5.2).
- **Mejora colateral (bug menor existente):** `findByActivoTrueAndProducto_Demo` no filtra por
  `producto.activo`, así que las escalas de un producto desactivado seguirían saliendo en
  `GET /escalas`. Cambiar el listado de escalas a
  `findByActivoTrueAndProducto_DemoAndProducto_ActivoTrue(boolean demo)` (y ajustar
  `ProductoService.listarEscalasActivas`). Con esto el soft delete del producto basta: **no** hay
  que tocar el `activo` de sus escalas (y la reactivación las recupera intactas).

### 5.2 `ProductoService` — métodos nuevos (todos con `@Transactional` donde haya escritura)
- `listarGestion()` → `findByDemoFalseOrderByNombreAsc()` + escalas activas de cada uno,
  mapeado a `ProductoGestionResponse`. (Solo lo llama el endpoint CLIENTE; no necesita
  `esInvitado()` porque la ruta ya está bloqueada por rol, pero no estorba dejar el filtro
  explícito `demo=false`.)
- `listarCategorias()` → `findCategoriasReales()`.
- `crear(CrearProductoRequest req)`:
  1. `validarCategoria(req)` y `validarEscalasSinDuplicados(req)`.
  2. `Producto` nuevo con `demo=false` **forzado** (nunca desde el request) y `activo=true`.
  3. Guardar producto, luego `saveAll` de las escalas (`activo=true`, `demo` no aplica — heredan
     el ámbito del producto).
- `actualizar(Long id, CrearProductoRequest req)`:
  1. Cargar producto o 404; `SecurityUtils.verificarAmbito(producto.getDemo())` → un id demo
     tratado como inexistente (404) aunque quien llama sea CLIENTE. **Nunca** editar catálogo demo.
  2. Validaciones de 5.2.crear.
  3. Actualizar `nombre`, `precioUnitario`, `categoria` y `activo` (si `req.activo != null`) —
     aquí ocurre la **reactivación**. `demo` jamás se toca.
  4. **Reemplazo en bloque de escalas:** `deleteByProductoId(id)` + `flush()` + `saveAll` de las
     nuevas. El flush intermedio es obligatorio: sin él, Hibernate puede reordenar y chocar el
     insert contra el unique `(producto_id, cantidad)` antes de ejecutar el delete.
     (Borrado físico de escalas es seguro: nada las referencia — los precios ya se copiaron a
     `detalle_cotizacion`.)
- `eliminar(Long id)`:
  1. Cargar o 404 + `verificarAmbito` (mismo guard).
  2. `activo=false`, guardar. Las escalas no se tocan (ver 5.1).

### 5.3 `ProductoController` — endpoints nuevos
Añadir los 5 endpoints de §4.1 delegando en el service. `@Valid` en los bodies. `POST` → 201
(`ResponseEntity.status(HttpStatus.CREATED)`), `DELETE` → 204.

### 5.4 `SecurityConfig` — reglas por rol
Insertar **antes** de `anyRequest().authenticated()`:

```java
.requestMatchers(HttpMethod.POST,   "/api/productos/**").hasRole("CLIENTE")
.requestMatchers(HttpMethod.PUT,    "/api/productos/**").hasRole("CLIENTE")
.requestMatchers(HttpMethod.DELETE, "/api/productos/**").hasRole("CLIENTE")
.requestMatchers(HttpMethod.GET,    "/api/productos/gestion",
                                    "/api/productos/categorias").hasRole("CLIENTE")
```

Un INVITADO que intente escribir recibe **403** (lo produce el `AccessDeniedHandler` por defecto;
`GlobalExceptionHandler` ya cubre el caso si la excepción llegara al advice). Nota: el 403 aquí es
correcto y no filtra información (la ruta es pública en forma, no un id adivinable) — el patrón
404 se reserva para los guards por id.

### 5.5 Sin cambios de modelo ni de configuración
No hay columnas nuevas ni propiedades nuevas. `ddl-auto=update` no tiene nada que hacer.

---

## 6. Tests (obligatorios — convención nueva del CLAUDE.md)

Seguir el estilo de `CotizacionServiceTest` (`src/test/java/.../service/`). Casos mínimos:

**`ProductoServiceTest` (nuevo):**
1. `crear` fuerza `demo=false` y `activo=true` aunque el request diga otra cosa.
2. `crear` con categoría inexistente → 400.
3. `crear`/`actualizar` con cantidades duplicadas en escalas → 400.
4. `actualizar` reemplaza las escalas en bloque (las viejas desaparecen, quedan las nuevas).
5. `actualizar` con `activo=true` reactiva un producto desactivado.
6. `actualizar`/`eliminar` sobre un producto `demo=true` → 404 (guard de ámbito).
7. `eliminar` deja `activo=false` sin tocar filas de escalas.
8. `listarGestion` incluye inactivos y excluye demo.

**Seguridad (test de la regla de rol, p. ej. `ProductoControllerSecurityTest` con MockMvc):**
9. `POST /api/productos` con authority `ROLE_INVITADO` → 403.
10. `POST /api/productos` sin token → 401.
11. `GET /api/productos/gestion` con `ROLE_INVITADO` → 403; con `ROLE_CLIENTE` → 200.

Regresión: `./mvnw test` completo (los 55 existentes siguen verdes).

---

## 7. Checklist de seguridad (revisar antes de cerrar)

- [ ] INVITADO no puede `POST/PUT/DELETE /api/productos/**` (403) ni ver `/gestion` `/categorias` (403).
- [ ] CLIENTE no puede editar/eliminar un producto `demo=true` (404 por guard de ámbito).
- [ ] `crear` fuerza `demo=false` server-side (ignora cualquier valor del cliente).
- [ ] `GET /api/productos/gestion` nunca devuelve productos demo.
- [ ] Los `GET` públicos existentes (`/api/productos`, `/escalas`) siguen filtrando por rol y
      ahora también excluyen escalas de productos inactivos.
- [ ] Desactivar un producto no rompe cotizaciones históricas (siguen mostrando su nombre y precios copiados).

---

## 8. Verificación end-to-end (curl)

Nota operativa (igual que Tarea 2): el sandbox de Bash bloquea TCP a `localhost` → usar
`dangerouslyDisableSandbox: true` para arrancar/curl. Postgres en `postgresql-db-1`. Si ya hay
un backend en :8090, levantar la instancia de prueba con `PORT=8092`.

1. Login como `abylu` → token CLIENTE. `POST /api/auth/guest` → token INVITADO.
2. `POST /api/productos` (CLIENTE) con 2 escalas → 201; aparece en `/gestion` y en `GET /api/productos`.
3. `POST /api/productos` (INVITADO) → 403. `GET /gestion` (INVITADO) → 403.
4. `PUT /{id}` cambiando precio y escalas → las escalas viejas se reemplazan.
5. `DELETE /{id}` → 204; desaparece de `GET /api/productos` y de `/escalas`, sigue en `/gestion`
   con `activo=false`; `PUT` con `activo=true` lo reactiva con sus escalas.
6. `PUT /{idDemo}` (CLIENTE) → 404.
7. Crear una cotización que use un producto, luego desactivarlo → `GET /cotizaciones/{id}` sigue
   mostrando el detalle correcto.

---

## 9. Fuera de alcance de este plan (va en el plan del frontend)

- Página `/productos` (o `/gestion`) en Angular, formularios, `ProductoService` del frontend con
  `crear/actualizar/eliminar`, select de categorías, enlace en el header (oculto para INVITADO).
- Cualquier cambio cosmético del picker de cotizaciones.

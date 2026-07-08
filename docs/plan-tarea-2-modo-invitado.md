# Plan — Tarea 2: Modo Invitado (visitante / reclutador)

> Documento autocontenido para ejecutar en una sesión nueva de chat. Incluye contexto,
> decisiones ya tomadas, diseño, pasos de implementación (backend + frontend), la plantilla
> PDF genérica, la checklist de seguridad y el plan de verificación.

---

## 1. Contexto del proyecto

Sistema de cotizaciones "Abylu". Dos repositorios (rutas absolutas):

- **Frontend:** `/home/n4nd0/Documentos/Abylu_Frontend` — Angular 19.2 standalone + Tailwind v4 + SSR (`@angular/ssr`). Rama de trabajo: `test`.
- **Backend:** `/home/n4nd0/IdeaProjects/software-api` — Spring Boot **4.0.3** / Java 17 / Postgres. Paquete base `com.abylu.software_api`. ⇒ trae **Spring Security 7** (DSL lambda obligatoria) y **jjwt 0.12.6**.

**Base de datos:** Postgres local en `localhost:5432/AbyluDB` (usuario `postgres` / pass `chacha`). En desarrollo suele correr en un contenedor Docker (`postgresql-db-1`). El esquema se genera con `ddl-auto=update` (sin Flyway todavía; la carpeta `db/migration` está vacía).

### Estado actual (ya implementado en Tareas previas)
- **Tarea 1 — Login JWT (HECHA):** autenticación por `username`, rol `CLIENTE`. JWT único ~24h, sin refresh. Token en `localStorage` protegido con `isPlatformBrowser` (SSR). Guard e interceptor **solo-navegador**. Usuario `abylu` sembrado por `DataInitializer` desde env vars. Enum `Rol { CLIENTE, INVITADO }` **ya existe** (INVITADO aún sin uso).
- **Config por perfiles (HECHA):** `application.yml` (común) + `application-dev.yml` + `application-prod.yml`. Local usa `dev` por defecto; el `Dockerfile` activa `prod` (`ENV SPRING_PROFILES_ACTIVE=prod`). Propiedades relevantes: `jwt.secret`, `jwt.expiration`, `app.seed.username/password`, `app.cors.allowed-origins`.

---

## 2. Objetivo de la Tarea 2

Permitir que un **visitante (p. ej. un reclutador)** entre **sin credenciales** y pruebe **todas** las funcionalidades —crear, editar, ver historial y descargar PDF— **sin exponer los datos reales del negocio** (productos, precios, cotizaciones reales) y con un **PDF de plantilla genérica** (sin marca/contacto/términos reales).

### Invariante de seguridad (regla de oro)
La protección vive **en el backend**, no en la UI. Un token con rol `INVITADO` **nunca** debe recibir datos reales. El frontend solo es cosmético (esconder/rotular). Si un precio real llega al navegador, el visitante lo ve en la pestaña de red aunque el CSS lo oculte.

---

## 3. Decisiones ya tomadas (NO relitigar)

1. **Modelo elegido: Opción B — persistencia efímera.** El invitado hace el ciclo completo (crear → aparece en historial → reabrir → editar → PDF). Sus datos se guardan en las **mismas tablas** reales, **etiquetados como demo**, y se **reinician en cada login de invitado** (auto-limpieza, sin job programado).
2. **Entrada sin credenciales:** botón "Entrar como invitado" en el login → `POST /api/auth/guest` → devuelve un JWT con rol `INVITADO`. El cliente no manda usuario/contraseña.
3. **Identidad del invitado:** se siembra un usuario fijo `invitado` (rol INVITADO), igual que se siembra `abylu`. Así `/auth/guest` reutiliza todo el flujo JWT existente.
4. **Concurrencia:** se acepta el reset-on-login simple. Matiz conocido: si dos visitantes usan el modo invitado a la vez, el login de uno reinicia los datos demo del otro. Aceptable para un portafolio. (Si algún día se quiere aislar por sesión, se agregaría un `sessionId` al token — fuera de alcance.)
5. **Catálogo demo:** set curado **fijo e inventado** (nombres genéricos, precios ficticios), **NO derivado** de los productos reales, para que nada real se filtre.
6. **PDF genérico por flag:** la plantilla se elige según `cotizacion.demo`. El usuario (dueño) **se encarga de crear el `.docx` demo** (ver §7).

---

## 4. Diseño de datos y lógica

### 4.1 Cambio de modelo
Añadir una columna marcadora **`demo BOOLEAN NOT NULL DEFAULT false`** a:
- `producto` (entidad `Producto`)
- `cotizacion` (entidad `Cotizacion`)

`ddl-auto=update` añade las columnas automáticamente. `detalle_cotizacion` hereda el estado vía su `cotizacion` padre (no necesita flag). Las `producto_precio_escala` se filtran por el `demo` de su `producto` (no necesita flag propio, o se le puede añadir por simetría — decisión menor).

**Cliente para cotizaciones demo:** las cotizaciones tienen FK a `cliente` (PK = `telefono`). Usar un cliente demo fijo, p. ej. `telefono = "0000000000"`, sembrado junto al catálogo demo. El reset de cotizaciones demo NO borra ese cliente.

### 4.2 Regla de alcance por rol (el corazón de la seguridad)
Toda lectura/escritura se bifurca por el rol del token autenticado:
- **CLIENTE** → solo `demo = false`.
- **INVITADO** → solo `demo = true`; y **toda** cotización que cree se fuerza a `demo = true`.

Implementarlo de forma **centralizada** (solo hay 2 services, es auditable): un helper `SecurityUtils.esInvitado()` que lee el rol desde `SecurityContextHolder.getContext().getAuthentication().getAuthorities()` (contiene `ROLE_INVITADO` / `ROLE_CLIENTE`).

**Guard crítico por id:** en los accesos por id (`GET /{id}`, `PUT /{id}`, `PATCH /{id}/estado`, `/{id}/pdf`, `/{id}/docx`) verificar que `registro.demo == esInvitado()`; si no coincide → **404** (no 403, para no revelar existencia). Así un invitado nunca toca una cotización real ni viceversa.

### 4.3 Ciclo de vida
- **Login invitado** (`POST /api/auth/guest`): (a) asegura el catálogo demo (idempotente), (b) **borra las cotizaciones demo** anteriores y **re-siembra 1–2 cotizaciones de ejemplo**, (c) emite el JWT INVITADO.
- **Durante la sesión:** crea/edita cotizaciones demo con los endpoints existentes (funcionan tal cual porque la fila sí se guarda, con `demo=true`).
- **Siguiente login invitado:** el reset borra y vuelve a sembrar. Auto-limpieza.

---

## 5. Implementación BACKEND (`/home/n4nd0/IdeaProjects/software-api`)

Respetar el estilo existente: entidades con Lombok `@Data/@NoArgsConstructor/@AllArgsConstructor` + `jakarta.persistence`; DTOs POJO con getters/setters manuales; repos `JpaRepository` con queries derivadas; inyección por constructor.

### 5.1 Modelo
- `model/Producto.java` → añadir `private Boolean demo = false;`
- `model/Cotizacion.java` → añadir `private Boolean demo = false;`

### 5.2 Repositorios (queries conscientes del flag)
- `ProductoRepository` → variantes con `demo`, p. ej.:
  - `List<Producto> findByActivoTrueAndDemoOrderByNombreAsc(boolean demo)`
- `ProductoPrecioEscalaRepository` → filtrar por `producto.demo` (query derivada `findByActivoTrueAndProducto_Demo(boolean demo)` o filtrar en el service).
- `CotizacionRepository` → variantes con `demo` para el listado y para el borrado del reset:
  - listado paginado equivalente al actual pero con `AndDemo`
  - `List<Cotizacion> findByDemoTrue()` (para el reset) o `deleteByDemoTrue()`.

### 5.3 Helper de seguridad
- `security/SecurityUtils.java` (o método estático) → `boolean esInvitado()` leyendo `SecurityContextHolder`. Devuelve true si el authority es `ROLE_INVITADO`.

### 5.4 Services (aplicar el alcance)
- `ProductoService.listarActivos()` → filtrar por `demo = esInvitado()`.
- `ProductoService.listarEscalasActivas()` → filtrar por `producto.demo = esInvitado()`.
- `ProductoService.buscarPorId(id)` → validar que `producto.demo == esInvitado()` (si no, tratar como no encontrado).
- `CotizacionService.crear(request)` → set `cotizacion.demo = esInvitado()` antes de guardar. Ojo: los `productoId` del request deben ser productos demo cuando es invitado (el picker ya solo mostró demo, pero validar server-side que el producto referenciado tenga `demo == esInvitado()`).
- `CotizacionService.actualizar(id, ...)`, `buscarPorId(id)`, `cambiarEstado(id, ...)` → aplicar el **guard por id** (404 si `demo` no coincide con el rol).
- `CotizacionService.listar(telefono, pageable)` → filtrar por `demo = esInvitado()`.

### 5.5 PDF por plantilla (ver §7 para el archivo)
- `service/PlantillaService.llenarPlantilla(cotizacion)` hoy tiene la ruta fija:
  `new ClassPathResource("templates/plantillaApachePOI.docx")`.
  Cambiar para elegir según `cotizacion.getDemo()`:
  ```java
  String ruta = Boolean.TRUE.equals(cotizacion.getDemo())
      ? "templates/plantillaApachePOI-demo.docx"
      : "templates/plantillaApachePOI.docx";
  ```
  No se toca la capa de roles: el flag de la cotización decide. Cubre `/{id}/pdf` y `/{id}/docx` (ambos pasan por `llenarPlantilla`).

### 5.6 Datos demo (semilla + reset)
- `config/DemoDataService.java` (o dentro de `AuthService`):
  - `ensureCatalogo()` — idempotente: si no existe el catálogo demo, crea productos demo + escalas demo (`demo=true`, `activo=true`) usando las **mismas `categoria`** que usa el picker (`'ilimitado'`, `'snack'`, y las categorías de estación como `'Estacion Salada'`) para que la UI agrupe bien. También el cliente demo `0000000000`.
  - `resetSesion()` — borra cotizaciones demo (`deleteByDemoTrue`) y siembra 1–2 cotizaciones de ejemplo (`demo=true`).
- Contenido sugerido del catálogo demo (ajustable): ~6–8 productos genéricos ("Servicio A", "Snack Demo 1", etc.) con precios inventados y 2–3 escalas.

### 5.7 Auth: usuario invitado + endpoint
- `config/DataInitializer.java` → sembrar también el usuario `invitado` (rol INVITADO) desde env vars, p. ej. `app.seed.guest-username` (default `invitado`). No necesita contraseña usable por el cliente (se le pone una aleatoria/segura; el login de invitado no la expone).
- `service/AuthService.java` → método `loginComoInvitado()`:
  - dispara `demoDataService.ensureCatalogo()` + `resetSesion()`,
  - genera el JWT para el usuario `invitado` (rol INVITADO) con `JwtService.generarToken(...)`,
  - devuelve `LoginResponse { token, username: "invitado", rol: "INVITADO" }`.
- `controller/AuthController.java` → `@PostMapping("/guest")` público (ya cubierto por `permitAll` de `/api/auth/**` en `SecurityConfig`).

### 5.8 Propiedades (application-*.yml)
- Añadir `app.seed.guest-username: ${SEED_GUEST_USER:invitado}` (común o por perfil).
- Nada sensible nuevo; el invitado no requiere secretos adicionales.

---

## 6. Implementación FRONTEND (`/home/n4nd0/Documentos/Abylu_Frontend`)

Reutiliza casi todo. Archivos actuales relevantes: `src/app/core/services/auth.service.ts`, `src/app/core/interceptors/auth.interceptor.ts`, `src/app/guards/auth.guard.ts`, `src/app/pages/login/`, `src/app/components/header/`, modelos en `src/app/shared/models/auth.model.ts` (`LoginResponse { token, username, rol }`).

### 6.1 AuthService
- Añadir `guestLogin(): Observable<LoginResponse>` → `POST {apiBaseUrl}/auth/guest`; en `tap` persiste token + usuario **igual que `login()`**.
- (Opcional) exponer el `rol` como signal (`readonly rol = signal<string|null>(...)`) leyendo/guardando junto al usuario, para que el header muestre "Modo invitado".

### 6.2 LoginComponent (`pages/login`)
- Añadir botón secundario "Entrar como invitado" → llama `auth.guestLogin()` → al éxito navega a `/cotizacion`. Manejar estado de carga/error como el login normal.

### 6.3 Header (opcional, cosmético)
- Si `rol === 'INVITADO'`, mostrar un chip/banner "Modo invitado". No ocultar funciones (el backend ya protege); a lo sumo rotular.

### 6.4 Sin cambios de guard/rutas
- El `authGuard` sigue igual (token presente = pasa). Las páginas existentes funcionan para ambos roles; lo que cambia es **qué datos** devuelve el backend.

---

## 7. Plantilla PDF genérica (la crea el USUARIO/dueño)

- Crear `src/main/resources/templates/plantillaApachePOI-demo.docx` en el **backend**.
- **Condición crítica:** debe ser una **copia** de `plantillaApachePOI.docx` con **el mismo "esqueleto" de campos** (mismas filas de la tabla de ítems, mismos text boxes y marcadores que `PlantillaService.llenarPlantilla` rellena por índice, aprox. líneas 93–261 del service). Solo se reemplaza el **contenido estático sensible** (logo, nombre de empresa, contacto, datos bancarios, términos) por texto genérico ("EMPRESA DEMO", etc.). Si se cambia la estructura, la lógica de llenado se rompe.
- El código ya lo selecciona solo por el flag `demo` (ver §5.5); no hay más trabajo de código para esto una vez que el archivo existe.

---

## 8. Checklist de seguridad (revisar antes de cerrar)

- [ ] `GET /api/productos` con token INVITADO devuelve **solo** productos `demo=true`; con CLIENTE, solo `demo=false`.
- [ ] `GET /api/productos/escalas` filtra igual por `producto.demo`.
- [ ] `POST /api/cotizaciones` como invitado fuerza `demo=true` y rechaza `productoId` que no sean demo.
- [ ] `GET/PUT/PATCH /api/cotizaciones/{id}` y `/{id}/pdf` `/{id}/docx`: un invitado sobre un id real → **404**; un cliente sobre un id demo → **404**.
- [ ] `GET /api/cotizaciones` (historial) filtra por `demo` según rol.
- [ ] El PDF de una cotización demo usa `plantillaApachePOI-demo.docx`.
- [ ] El reset-on-login borra cotizaciones demo y re-siembra; NO toca datos reales.
- [ ] El usuario `invitado` no tiene privilegios de CLIENTE en ningún endpoint.

---

## 9. Verificación (end-to-end)

Nota operativa: el sandbox de la herramienta Bash bloquea TCP a `localhost`; para arrancar/curl el backend o `ng serve` se usó `dangerouslyDisableSandbox: true`. Postgres suele estar en el contenedor `postgresql-db-1` (puerto 5432). Para no chocar con un backend ya corriendo en :8090, arrancar la instancia de prueba en otro puerto (`PORT=8092`).

**Backend (curl):**
1. `POST /api/auth/guest` → 200 + `{token, username:"invitado", rol:"INVITADO"}`.
2. `GET /api/productos` con token invitado → solo productos demo; con token de `abylu` (CLIENTE) → solo reales.
3. Crear cotización como invitado → se guarda con `demo=true`.
4. `GET /api/cotizaciones/{idReal}` con token invitado → **404**.
5. `GET /api/cotizaciones/{idDemo}/pdf` → PDF con plantilla demo.
6. Segundo `POST /api/auth/guest` → las cotizaciones demo previas se borraron y hay data de ejemplo fresca.

**Frontend (Playwright, patrón usado en Tarea 1):** botón "Entrar como invitado" → entra a `/cotizacion` → el picker muestra catálogo demo → crea una cotización → aparece en `/historial` → la reabre y edita → descarga PDF. Verificar en Network que las requests llevan `Authorization: Bearer` y que los datos son demo.

**Regresión:** `./mvnw test` (55 tests actuales deben seguir verdes; añadir el flag `demo` no debe romperlos). Build frontend: `npx ng build --configuration development` (valida prerender SSR).

---

## 10. Referencia rápida de archivos/código actual

**Backend** (`com.abylu.software_api`):
- Modelos: `Producto` (id, nombre, precioUnitario, categoria, activo), `Cotizacion` (id, cliente `@ManyToOne`, detalles `@OneToMany`, estado `EstadoCotizacion`, numeroCotizacion, …), `DetalleCotizacion` (productoId, descripcionManual, …), `ProductoPrecioEscala` (id, producto, cantidad, precioTotal, activo), `Cliente` (telefono PK), `Usuario` (id, username, password, rol, activo), enums `Rol {CLIENTE, INVITADO}`, `EstadoCotizacion`.
- Services: `ProductoService` (`listarActivos`, `listarEscalasActivas`, `buscarPorId`), `CotizacionService` (`crear`, `actualizar`, `listar`, `buscarPorId`, `cambiarEstado`), `PdfGenerationService.generarPdf(Long id)` → `PlantillaService.llenarPlantilla(cotizacion)` [ClassPathResource `templates/plantillaApachePOI.docx`] → `ILovePdfService.convertirDocxAPdf`.
- Controllers: `ProductoController` (`GET /api/productos`, `GET /api/productos/escalas`), `CotizacionController` (`GET /api/cotizaciones`, `POST`, `GET /{id}`, `PUT /{id}`, `PATCH /{id}/estado`, `GET /{id}/pdf`, `GET /{id}/docx`), `AuthController` (`POST /api/auth/login`).
- Seguridad: `SecurityConfig` (Security 7 DSL lambda, STATELESS, `permitAll` a `/api/auth/**` y OPTIONS, resto `authenticated`, `JwtAuthenticationFilter`, `CorsConfigurationSource`, entryPoint 401), `JwtService` (`generarToken(username, rol)`, `extraerUsername`, `esValido`), `JwtAuthenticationFilter` (salta `/api/auth/**`), `CustomUserDetailsService` (authority `ROLE_ + rol`), `AuthService.login`, `DataInitializer` (siembra CLIENTE desde env).
- Config: `application.yml` + `application-dev.yml` + `application-prod.yml`. Dockerfile activa perfil `prod`.

**Frontend:**
- `core/services/auth.service.ts` (signal `usuario`, `localStorage` con `isPlatformBrowser`, `login()`), `core/interceptors/auth.interceptor.ts` (adjunta Bearer, 401→login, solo-navegador), `guards/auth.guard.ts` (solo-navegador), `pages/login/`, `components/header/` (usuario + logout), `shared/models/auth.model.ts`.
- Rutas: `app.routes.ts` (login pública; cotizacion/historial/detalle con `authGuard`). `app.routes.server.ts` (splash+login Prerender, resto Client).

---

## 11. Tareas restantes (roadmap con notas de diseño)

> **Importante:** todo lo de esta sección son **esbozos**, NO diseños cerrados como la Tarea 2.
> Sirven de referencia/orientación. Antes de implementar cualquiera, hacer su propia fase de
> exploración + plan (y confirmar decisiones con el usuario), igual que se hizo con las Tareas 1 y 2.

### Tarea 3 — CRUD de productos (dificultad: baja–media)
Permitir que el dueño (CLIENTE) agregue/edite/elimine productos y precios desde la app.

- **Depende de la Tarea 2:** el flag `demo` ya existe. Las mutaciones deben afectar **solo** productos reales (`demo=false`); un INVITADO NO puede crear/editar/eliminar. Enforce por rol.
- **Backend:**
  - Ampliar `ProductoController` con `POST /api/productos`, `PUT /api/productos/{id}`, `DELETE /api/productos/{id}` (y análogos para `ProductoPrecioEscala`, porque el precio por escala es parte del producto).
  - Autorización: solo `CLIENTE`. Dos formas: (a) reglas por método HTTP en `SecurityConfig` (`requestMatchers(HttpMethod.POST, "/api/productos/**").hasRole("CLIENTE")`), o (b) seguridad a nivel de método con `@EnableMethodSecurity` + `@PreAuthorize("hasRole('CLIENTE')")`. Recomendado (a) por simplicidad, o (b) si se quiere granularidad.
  - En las escrituras, forzar `demo=false` (nunca dejar que el CLIENTE toque catálogo demo).
  - **Borrado = soft delete:** ya existe `Producto.activo`. Poner `activo=false` en vez de borrar físico, para no romper cotizaciones históricas que referencian ese producto (FK en `detalle_cotizacion`). Hard delete solo si no hay referencias.
  - DTOs POJO nuevos (`CrearProductoRequest`, etc.) siguiendo el estilo del proyecto; validación con `@Valid`.
- **Frontend:**
  - Nueva página protegida (p. ej. `/productos` o `/gestion`), con `authGuard`, siguiendo el sistema de diseño (`.app-shell`, `.section`, `.btn-primary`).
  - Formularios de alta/edición y lista con acciones. Nuevo `ProductoService` métodos `crear/actualizar/eliminar`.
  - Enlace en el header (visible para CLIENTE; ocultar/rotular para INVITADO — cosmético, el backend ya protege).
- **Consideración:** el picker de cotización lee `listarActivos()`; al desactivar un producto, deja de aparecer en el picker pero las cotizaciones viejas lo conservan. Correcto.

### Tarea 4 — Analítica / reportes semanales (dificultad: media–alta)
Reportes/estadísticas sobre las cotizaciones (lo "vistoso" para el reclutador).

- **Backend:**
  - Endpoints nuevos, p. ej. `GET /api/analitica/resumen`, `GET /api/analitica/semanal`, bajo autorización de rol.
  - Queries de **agregación** sobre `cotizacion`/`detalle_cotizacion`: agrupar por semana (`date_trunc('week', fecha_creacion)`), por `estado`, por producto. Usar JPQL/`@Query` nativo o proyecciones de Spring Data.
  - Métricas candidatas: nº de cotizaciones por semana, **tasa de aceptación** (`ACEPTADA` / total enviadas), ingreso estimado (suma de totales), **productos/servicios más cotizados**, ticket promedio.
  - **Interacción con Tarea 2:** si el INVITADO puede ver analítica, los agregados deben respetar el filtro `demo` (ver solo datos demo). Aplicar el mismo `esInvitado()`.
  - Rendimiento: índice en `fecha_creacion`; considerar cache si algún reporte pesa.
  - Ojo con zona horaria / límites de semana (definir si semana empieza lunes o domingo).
- **Frontend:**
  - Nueva página protegida `/analitica` con **gráficos**. Librería sugerida: Chart.js (con `ng2-charts`) o `ngx-charts`. Añadir la dependencia y un componente por gráfico.
  - Tarjetas de KPIs + gráficos de líneas/barras. Reusar tokens del sistema de diseño.
- **Nota:** es la pieza más grande y la menos definida; se beneficia de tener más datos acumulados. Dejar para el final.

### Pendientes técnicos transversales (deuda / mejoras)
- **Tests de auth:** el código nuevo de seguridad (Tareas 1–2) no tiene tests propios aún. Agregar tests de `JwtService`, del filtro y de los guards por rol/`demo`.
- **Aislamiento por sesión de invitado:** hoy es reset-on-login (aceptado). Si se necesitara concurrencia real de varios visitantes, añadir un `sessionId` al JWT de invitado y scopear las cotizaciones demo por sesión + limpieza por TTL.
- **Flyway:** migrar el esquema a migraciones versionadas (`src/main/resources/db/migration`, carpeta ya creada) y cambiar `ddl-auto` de **prod** a `validate` (hoy está en `update`).
- **Secretos:** las llaves de iLovePDF están como default en `application.yml` (comprometidas en el repo). Idealmente moverlas a solo-env y rotarlas. El `jwt.secret`/`seed` de dev también son defaults; en prod ya son obligatorios por env.
- **Refresh token:** hoy es un JWT único ~24h sin refresh (re-login al expirar). Si la sesión se siente corta, evaluar refresh token.

# Abylu — Frontend

Aplicación **Angular 19** para la gestión de cotizaciones de **Abylu**: creación de cotizaciones con cálculo de precios en tiempo real, generación y descarga de PDF, historial paginado con búsqueda, y un design system propio tokenizado. SSR habilitado y despliegue continuo a GitHub Pages.

> 🔗 **Demo en vivo:** **[inando4.github.io/Abylu_Frontend](https://inando4.github.io/Abylu_Frontend/)**
> 🛠️ **Backend (Spring Boot):** [software-api](https://github.com/inando4/software-api.git)

<p align="left">
  <img alt="Angular" src="https://img.shields.io/badge/Angular-19.2-DD0031?logo=angular&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-v4-38BDF8?logo=tailwindcss&logoColor=white">
  <img alt="RxJS" src="https://img.shields.io/badge/RxJS-7.8-B7178C?logo=reactivex&logoColor=white">
  <img alt="Playwright" src="https://img.shields.io/badge/Playwright-E2E-2EAD33?logo=playwright&logoColor=white">
  <img alt="Angular SSR" src="https://img.shields.io/badge/Angular_SSR-enabled-DD0031?logo=angular&logoColor=white">
  <img alt="Deploy" src="https://img.shields.io/badge/Deploy-GitHub_Pages-222?logo=githubpages&logoColor=white">
</p>

---

## Funcionalidades

- **Crear cotización** — formulario reactivo con `FormArray` de ítems, selector de productos por categoría (bottom-sheet) y cálculo de precios bidireccional.
- **Generar y descargar PDF** — el cliente encadena la creación de la cotización y la descarga del PDF en una sola operación.
- **Historial paginado** — lista de cotizaciones con búsqueda por prefijo de teléfono (debounced) y paginación servidor.
- **Detalle de cotización** — vista por `id` con acciones condicionadas al estado (borrador, enviada, aceptada, rechazada).
- **UI responsive** — navegación con drawer en móvil y barra horizontal en escritorio.

---

## Stack

| Capa | Tecnología |
| --- | --- |
| Framework | Angular 19.2 (standalone components, sin NgModules) |
| Lenguaje | TypeScript 5.7 |
| Estilos | Tailwind CSS v4 + design tokens en `@theme` |
| Reactividad | RxJS 7.8 |
| SSR | `@angular/ssr` + Express |
| Tests unitarios | Karma + Jasmine |
| Tests E2E | Playwright |
| CI/CD | GitHub Actions → GitHub Pages |

---

## Estructura del proyecto

```
src/
├── environments/
│   ├── environment.ts              # Producción (URL del backend en onrender)
│   └── environment.development.ts  # Dev/test (localhost:8090)
└── app/
    ├── core/
    │   └── services/
    │       ├── cotizacion.service.ts
    │       └── producto.service.ts
    ├── shared/
    │   └── models/                 # Tipos espejo de los DTOs Java del backend
    ├── pages/
    │   ├── splash/
    │   ├── cotizacion/             # Formulario reactivo con FormArray
    │   ├── historial/              # Lista paginada + búsqueda debounced
    │   └── detalle-cotizacion/     # Vista de detalle por id
    ├── components/
    │   └── header/                 # Nav responsive con drawer mobile
    ├── app.routes.ts               # Rutas lazy con loadComponent
    └── app.config.ts               # providers + HttpClient
```

---

## Decisiones técnicas

### Standalone components y rutas lazy

Cada página se carga con `loadComponent` en `app.routes.ts`, generando un chunk independiente y manteniendo el bundle inicial reducido (la página de cotización pesa ~307 kB por sí sola, fuera del bundle principal).

### Configuración por entorno (Angular environments)

La URL del backend **no está hardcodeada**: vive en `src/environments/` como única fuente de verdad.

- `environment.ts` (sin sufijo) → **producción** (`https://software-api-emyc.onrender.com/api`).
- `environment.development.ts` → **dev / test** (`http://localhost:8090/api`).

El intercambio lo hace `fileReplacements` en `angular.json`: `ng serve`, `ng build --configuration development` y `ng test` resuelven a localhost; `ng build` (producción) resuelve a onrender. Los servicios leen `environment.apiBaseUrl`, así que cambiar de entorno no toca el código.

### Modelos como contrato de cable

Los tipos en `src/app/shared/models/` reflejan exactamente los DTOs del backend Spring Boot. No son tipos internos: son **contratos de la API**. Tipos clave:

- `CrearCotizacionRequest` / `ItemCotizacionRequest` — body para crear cotizaciones. Si `productoId === null`, el ítem es manual y `descripcionManual` es obligatorio. Si `esIlimitado === true`, `cantidad` se ignora y el precio es fijo.
- `EstadoCotizacion = 'BORRADOR' | 'ENVIADA' | 'ACEPTADA' | 'RECHAZADA'` — controla la clase del badge (`'estado-' + estado.toLowerCase()`) y qué acciones se renderizan en la página de detalle.
- `PageResponse<T>` — espejo del `Page<T>` de Spring Data, con `content`, `number` (zero-indexed), `first`, `last`, etc.

### Cálculo bidireccional en el formulario

El formulario de cotización tiene un `FormArray` de ítems donde **`cantidad`, `precioUnitario` y `subtotal` están enlazados en los tres sentidos**:

- Editar `cantidad` → busca el `ProductoPrecioEscala` correspondiente, con fallback a `precioUnitario × cantidad`.
- Editar `subtotal` → recalcula `precioUnitario`.
- Editar `precioUnitario` → recalcula `subtotal`.

Esto permite cotizar tanto "quiero N unidades a este precio" como "tengo presupuesto de X, ¿cuánto compro?".

### Generación de PDF como observable encadenado

El backend no expone un endpoint único de "crear y descargar". El servicio compone los dos pasos en cliente:

```ts
crearYDescargarPdf(req: CrearCotizacionRequest): Observable<Blob> {
  return this.crear(req).pipe(
    switchMap(cot =>
      this.descargarPdf(cot.id) // GET .../pdf con responseType: 'blob'
    )
  );
}
```

El consumidor recibe un único observable y trata el flujo como una operación atómica.

### Búsqueda debounced en el historial

La búsqueda por prefijo de teléfono en `/historial` aplica `debounceTime(300)` + `distinctUntilChanged()` antes de llamar a la API, evitando peticiones por cada tecla.

### Design system tokenizado

Toda la paleta vive en `src/styles.css` dentro de `@theme { ... }` y se consume con `var(--color-...)`, manteniendo los colores consistentes en toda la app desde un único lugar.

---

## Ejecución local

### Requisitos

- Node.js 20+
- Backend corriendo en `http://localhost:8090` (ver [repo del backend](https://github.com/inando4/software-api.git))

### Instalación

```bash
git clone https://github.com/inando4/Abylu_Frontend.git
cd Abylu_Frontend
npm install
npm start            # equivale a: ng serve
```

La app queda disponible en `http://localhost:4200` (apunta automáticamente al backend local).

### Scripts

```bash
npm start                                 # dev server con hot reload (localhost:8090)
npm run build                             # build de producción → dist/ (backend onrender)
npm run watch                             # build de desarrollo en modo watch
npm test                                  # tests unitarios (Karma + Jasmine)
npm run test:e2e                          # tests E2E (Playwright)
npm run test:e2e:ui                       # Playwright en modo UI
npm run serve:ssr:Abylu_Frontend          # servir el build SSR
```

---

## Despliegue

La app se publica automáticamente en **GitHub Pages** con cada push a `master`, mediante GitHub Actions (`.github/workflows/deploy-pages.yml`):

1. `npm ci` e instalación de dependencias.
2. `npm run build -- --base-href /Abylu_Frontend/` (build de producción → apunta al backend en onrender).
3. Se sube el contenido de `dist/abylu-frontend/browser` como artefacto y se publica en Pages.

Como GitHub Pages sirve archivos estáticos, la app se despliega como **SPA** (el build de browser); el `--base-href` ajusta las rutas para que funcionen bajo el subpath `/Abylu_Frontend/`.

🔗 **Producción:** [inando4.github.io/Abylu_Frontend](https://inando4.github.io/Abylu_Frontend/)

---

## Testing

- **Unitarios** con Karma + Jasmine (`npm test`); infraestructura lista para sumar specs por servicio y componente.
- **E2E con Playwright** en `e2e/cotizacion.spec.ts`, cubriendo el flujo de creación de cotización.

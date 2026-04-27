# Abylu — Frontend

Aplicación Angular 19 que implementa la interfaz de gestión de cotizaciones de **Abylu**. Este repositorio es el código fuente del cliente; la versión desplegada (con descripción del producto y capturas) vive en el repo de deploy.

> **Demo y descripción completa del proyecto:** [abylu-deploy](https://github.com/inando4/Abylu_Deploy.git)
> **Backend (Spring Boot):** [abylu-backend](https://github.com/inando4/software-api.git)

<p align="left">
  <img alt="Angular" src="https://img.shields.io/badge/Angular-19.2-DD0031?logo=angular&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-v4-38BDF8?logo=tailwindcss&logoColor=white">
  <img alt="RxJS" src="https://img.shields.io/badge/RxJS-7.8-B7178C?logo=reactivex&logoColor=white">
  <img alt="Playwright" src="https://img.shields.io/badge/Playwright-E2E-2EAD33?logo=playwright&logoColor=white">
  <img alt="Angular SSR" src="https://img.shields.io/badge/Angular_SSR-enabled-DD0031?logo=angular&logoColor=white">
</p>

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

---

## Estructura del proyecto

```
src/app/
├── core/
│   ├── api.config.ts            # URL base del backend
│   └── services/
│       ├── cotizacion.service.ts
│       └── producto.service.ts
├── shared/
│   └── models/                  # Tipos espejo de los DTOs Java del backend
├── pages/
│   ├── splash/
│   ├── cotizacion/              # Formulario reactivo con FormArray
│   ├── historial/               # Lista paginada + búsqueda debounced
│   └── detalle-cotizacion/      # Vista de detalle por id
├── components/
│   └── header/                  # Nav responsive con drawer mobile
├── app.routes.ts                # Rutas lazy con loadComponent
└── app.config.ts                # providers + HttpClient
```

---

## Decisiones técnicas

### Standalone components y rutas lazy

Cada página se carga con `loadComponent` en `app.routes.ts`, generando un chunk independiente y manteniendo el bundle inicial reducido (la página de cotización pesa ~307 kB por sí sola, fuera del bundle principal).

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
  return this.http.post<Cotizacion>(`${API}/cotizaciones`, req).pipe(
    switchMap(cot =>
      this.http.get(`${API}/cotizaciones/${cot.id}/pdf`, { responseType: 'blob' })
    )
  );
}
```

El consumidor recibe un único observable y trata el flujo como una operación atómica.

### Búsqueda debounced en el historial

La búsqueda por prefijo de teléfono en `/historial` aplica `debounceTime(300)` + `distinctUntilChanged()` antes de llamar a la API, evitando peticiones por cada tecla.

### Design system tokenizado

Toda la paleta vive en `src/styles.css` dentro de `@theme { ... }` y se consume con `var(--color-...)`. 

---

## Ejecución

### Requisitos

- Node.js 18+
- Backend corriendo

### Instalación

```bash
git clone https://github.com/<tu-usuario>/abylu-frontend.git
cd abylu-frontend
npm install
npx ng serve
```

La app queda disponible en `http://localhost:4200`.

### Scripts

```bash
npx ng serve                              # dev server con hot reload
npx ng build                              # build de producción → dist/
npx ng build --configuration development  # build de desarrollo
npx ng test                               # tests unitarios (Karma + Jasmine)
npm run test:e2e                          # tests E2E (Playwright)
npm run test:e2e:ui                       # Playwright en modo UI
npm run serve:ssr:Abylu_Frontend          # servir el build SSR
```

---

## Testing

- **Unitarios** sobre los servicios HTTP y los componentes con lógica no trivial (cálculo bidireccional, paginación).
- **E2E con Playwright** en `e2e/` cubriendo el flujo completo de creación de cotización y descarga de PDF.

---


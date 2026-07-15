import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

/**
 * Rutas de la aplicación — equivalente a @RequestMapping en Spring.
 *
 * En Spring:  GET /api/productos → ProductoController
 * En Angular: URL /cotizacion    → CotizacionComponent
 *
 * loadComponent usa "lazy loading": el componente solo se descarga cuando
 * el usuario navega a esa ruta. Optimiza el tamaño inicial de la app.
 *
 * `canActivate: [authGuard]` protege las rutas del negocio: sin sesión, el guard
 * redirige a /login (solo en el navegador — ver auth.guard.ts para el detalle SSR).
 */
export const routes: Routes = [
  {
    path: '',                    // URL raíz: localhost:4200/ (splash, pública)
    loadComponent: () => import('./pages/splash/splash.component')
      .then(m => m.SplashComponent),
  },
  {
    path: 'login',               // localhost:4200/login (pública)
    loadComponent: () => import('./pages/login/login.component')
      .then(m => m.LoginComponent),
  },
  {
    path: 'cotizacion',          // localhost:4200/cotizacion (modo creación)
    canActivate: [authGuard],
    loadComponent: () => import('./pages/cotizacion/cotizacion.component')
      .then(m => m.CotizacionComponent),
  },
  {
    path: 'cotizacion/:id',      // localhost:4200/cotizacion/42 (modo edición)
    canActivate: [authGuard],
    loadComponent: () => import('./pages/cotizacion/cotizacion.component')
      .then(m => m.CotizacionComponent),
  },
  {
    path: 'historial',           // localhost:4200/historial
    canActivate: [authGuard],
    loadComponent: () => import('./pages/historial/historial.component')
      .then(m => m.HistorialComponent),
  },
  {
    path: 'productos',           // localhost:4200/productos (gestión de catálogo)
    canActivate: [authGuard],
    loadComponent: () => import('./pages/productos/productos.component')
      .then(m => m.ProductosComponent),
  },
  {
    path: 'historial/:id',       // localhost:4200/historial/42
    canActivate: [authGuard],
    loadComponent: () => import('./pages/detalle-cotizacion/detalle-cotizacion.component')
      .then(m => m.DetalleCotizacionComponent),
  },
];

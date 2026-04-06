import { Routes } from '@angular/router';

/**
 * Rutas de la aplicación — equivalente a @RequestMapping en Spring.
 *
 * En Spring:  GET /api/productos → ProductoController
 * En Angular: URL /cotizacion    → CotizacionComponent
 *
 * loadComponent usa "lazy loading": el componente solo se descarga cuando
 * el usuario navega a esa ruta. Optimiza el tamaño inicial de la app.
 */
export const routes: Routes = [
  {
    path: '',                    // URL raíz: localhost:4200/
    loadComponent: () => import('./pages/splash/splash.component')
      .then(m => m.SplashComponent),
  },
  {
    path: 'cotizacion',          // localhost:4200/cotizacion
    loadComponent: () => import('./pages/cotizacion/cotizacion.component')
      .then(m => m.CotizacionComponent),
  },
  {
    path: 'historial',           // localhost:4200/historial
    loadComponent: () => import('./pages/historial/historial.component')
      .then(m => m.HistorialComponent),
  },
  {
    path: 'historial/:id',       // localhost:4200/historial/42
    loadComponent: () => import('./pages/detalle-cotizacion/detalle-cotizacion.component')
      .then(m => m.DetalleCotizacionComponent),
  },
];

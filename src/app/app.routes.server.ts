import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Modo de render por ruta (SSR).
 *
 * Las rutas públicas (splash, login) se prerenderizan como HTML estático.
 * Las rutas protegidas se renderizan en el CLIENTE: dependen del token en
 * localStorage (que no existe en el servidor), así que el guard y la carga de
 * datos deben ocurrir en el navegador. Prerenderizarlas dejaría un shell o un
 * redirect "quemado" — ver auth.guard.ts.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'login', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];

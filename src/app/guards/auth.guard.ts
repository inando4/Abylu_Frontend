import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

/**
 * Protege rutas que requieren sesión.
 *
 * SSR: en el servidor devuelve `true` — el token vive en localStorage (solo navegador),
 * así que si el guard corriera en prerender no hallaría token y "quemaría" un redirect a
 * /login en el HTML. Al hidratar en el cliente, el guard vuelve a correr y sí redirige.
 */
export const authGuard: CanActivateFn = () => {
  const platformId = inject(PLATFORM_ID);
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAuthenticated() ? true : router.createUrlTree(['/login']);
};

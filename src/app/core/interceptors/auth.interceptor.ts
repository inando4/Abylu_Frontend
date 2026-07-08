import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Adjunta el JWT a cada request saliente y reacciona a los 401.
 *
 * SSR: solo actúa en el navegador. En el servidor no hay token (localStorage no existe),
 * así que la request sale tal cual — nunca se intenta leer storage en prerender.
 *
 * Ante un 401 (token ausente/expirado/ inválido) limpia la sesión y manda a /login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!isPlatformBrowser(platformId)) {
    return next(req);
  }

  const token = auth.token;
  const request = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      // No redirigir si el 401 viene del propio login (credenciales incorrectas).
      const esLogin = req.url.includes('/auth/login');
      if (error.status === 401 && !esLogin) {
        auth.logout();
        router.navigate(['/login']);
      }
      return throwError(() => error);
    }),
  );
};

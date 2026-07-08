import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { LoginRequest, LoginResponse } from '../../shared/models';
import { environment } from '../../../environments/environment';

const TOKEN_KEY = 'abylu_token';
const USER_KEY = 'abylu_user';
const ROL_KEY = 'abylu_rol';

/**
 * Maneja la sesión: login, logout y persistencia del JWT.
 *
 * SSR: todo acceso a localStorage está protegido con isPlatformBrowser porque en el
 * servidor (prerender/SSR) `localStorage` no existe y rompería el render.
 *
 * `usuario` es una signal para que el header reaccione al iniciar/cerrar sesión.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {

  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private url = `${environment.apiBaseUrl}/auth`;

  /** Username del usuario autenticado, o null si no hay sesión. Reactiva. */
  readonly usuario = signal<string | null>(this.leer(USER_KEY));

  /** Rol del usuario autenticado ('CLIENTE' | 'INVITADO'), o null. Reactiva. */
  readonly rol = signal<string | null>(this.leer(ROL_KEY));

  /** true si la sesión activa es de modo invitado (para rotular la UI). */
  readonly esInvitado = computed(() => this.rol() === 'INVITADO');

  private get esNavegador(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  login(request: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.url}/login`, request).pipe(
      tap(res => this.guardarSesion(res)),
    );
  }

  /** Entra como invitado (rol INVITADO), sin credenciales. Persiste igual que login(). */
  guestLogin(): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.url}/guest`, {}).pipe(
      tap(res => this.guardarSesion(res)),
    );
  }

  logout(): void {
    this.borrar(TOKEN_KEY);
    this.borrar(USER_KEY);
    this.borrar(ROL_KEY);
    this.usuario.set(null);
    this.rol.set(null);
  }

  get token(): string | null {
    return this.leer(TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return this.token != null;
  }

  private guardarSesion(res: LoginResponse): void {
    this.escribir(TOKEN_KEY, res.token);
    this.escribir(USER_KEY, res.username);
    this.escribir(ROL_KEY, res.rol);
    this.usuario.set(res.username);
    this.rol.set(res.rol);
  }

  // --- Acceso a localStorage protegido para SSR ---

  private leer(key: string): string | null {
    return this.esNavegador ? localStorage.getItem(key) : null;
  }

  private escribir(key: string, value: string): void {
    if (this.esNavegador) {
      localStorage.setItem(key, value);
    }
  }

  private borrar(key: string): void {
    if (this.esNavegador) {
      localStorage.removeItem(key);
    }
  }
}

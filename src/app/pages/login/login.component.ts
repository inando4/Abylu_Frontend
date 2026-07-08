import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';

/**
 * Pantalla de inicio de sesión. Ruta pública `/login`.
 *
 * Al autenticar correctamente navega a /cotizacion. Los errores 401 (credenciales
 * incorrectas) se muestran en un banner; el interceptor NO redirige en este caso
 * porque la URL es /auth/login.
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {

  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  cargando = signal(false);
  error = signal<string | null>(null);
  mostrarPassword = signal(false);

  form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  enviar(): void {
    if (this.form.invalid || this.cargando()) {
      this.form.markAllAsTouched();
      return;
    }

    this.cargando.set(true);
    this.error.set(null);

    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => this.router.navigate(['/cotizacion']),
      error: (err: HttpErrorResponse) => {
        this.cargando.set(false);
        this.error.set(
          err.status === 401
            ? 'Usuario o contraseña incorrectos.'
            : 'No se pudo iniciar sesión. Intenta de nuevo.',
        );
      },
    });
  }

  /** Muestra u oculta la contraseña en el campo correspondiente. */
  togglePassword(): void {
    this.mostrarPassword.update(v => !v);
  }

  /** Entra como invitado (modo demo), sin credenciales. */
  entrarComoInvitado(): void {
    if (this.cargando()) {
      return;
    }

    this.cargando.set(true);
    this.error.set(null);

    this.auth.guestLogin().subscribe({
      next: () => this.router.navigate(['/cotizacion']),
      error: () => {
        this.cargando.set(false);
        this.error.set('No se pudo entrar como invitado. Intenta de nuevo.');
      },
    });
  }
}

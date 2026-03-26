import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Splash Screen — pantalla de bienvenida con animación del logo.
 *
 * Concepto: Lifecycle Hooks (ciclo de vida)
 * Angular tiene "hooks" que se ejecutan en momentos específicos:
 *   - OnInit    → cuando el componente se inicializa (como @PostConstruct en Spring)
 *   - OnDestroy → cuando se destruye (como @PreDestroy)
 *
 * Aquí usamos OnInit para iniciar el timer de redirección.
 */
@Component({
  selector: 'app-splash',
  imports: [],
  templateUrl: './splash.component.html',
  styleUrl: './splash.component.css'
})
export class SplashComponent implements OnInit {

  private router = inject(Router);

  /** Controla las clases CSS de animación */
  logoVisible = false;
  fadeOut = false;

  ngOnInit(): void {
    // Paso 1: Mostrar logo con fade-in (tras breve delay para que se note)
    setTimeout(() => this.logoVisible = true, 200);

    // Paso 2: Iniciar fade-out después de 2 segundos
    setTimeout(() => this.fadeOut = true, 2200);

    // Paso 3: Navegar a cotización después del fade-out (2.5s total)
    setTimeout(() => this.router.navigate(['/cotizacion']), 2700);
  }
}

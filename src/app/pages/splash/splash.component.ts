import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Splash Screen — Variación 2 "Cálido cinematográfico".
 *
 * Timeline:
 *   t=0.00s  → barras letterbox se abren
 *   t=0.55s  → logo zoom-in
 *   t=0.60s  → sweep de luz
 *   t=1.00s  → burst de sparkles
 *   t=1.10s  → tagline aparece
 *   t=1.25s  → firma "By N4ND0" aparece
 *   t=3.70s  → fade-out global (1.5s extra para leer la firma)
 *   t=4.20s  → navegación a /cotizacion
 */
@Component({
  selector: 'app-splash',
  templateUrl: './splash.component.html',
  styleUrl: './splash.component.css'
})
export class SplashComponent implements OnInit {

  private router = inject(Router);

  started = false;
  fadeOut = false;

  ngOnInit(): void {
    // Activar las animaciones (un tick después para garantizar el reflow inicial)
    setTimeout(() => this.started = true, 50);

    // Fade-out global antes de navegar (con 1.5s extra para que el usuario lea la firma)
    setTimeout(() => this.fadeOut = true, 3700);

    // Navegar a la cotización tras el fade-out
    setTimeout(() => this.router.navigate(['/cotizacion']), 4200);
  }
}

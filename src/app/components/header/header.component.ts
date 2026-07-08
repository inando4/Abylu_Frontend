import { Component, HostListener, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {

  private auth = inject(AuthService);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  /** Username en sesión (reactivo), para mostrarlo en la barra. */
  readonly usuario = this.auth.usuario;

  /** true si la sesión es de modo invitado, para rotular la barra. */
  readonly esInvitado = this.auth.esInvitado;

  menuAbierto = false;

  toggleMenu(): void {
    this.menuAbierto = !this.menuAbierto;
  }

  cerrarMenu(): void {
    this.menuAbierto = false;
  }

  cerrarSesion(): void {
    this.cerrarMenu();
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  /** Cierra el menú móvil cuando la ventana pasa a tamaño desktop. */
  @HostListener('window:resize')
  onResize(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    if (window.innerWidth >= 768 && this.menuAbierto) {
      this.menuAbierto = false;
    }
  }
}

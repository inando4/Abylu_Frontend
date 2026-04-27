import { Component, HostListener } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {

  menuAbierto = false;

  toggleMenu(): void {
    this.menuAbierto = !this.menuAbierto;
  }

  cerrarMenu(): void {
    this.menuAbierto = false;
  }

  /** Cierra el menú móvil cuando la ventana pasa a tamaño desktop. */
  @HostListener('window:resize')
  onResize(): void {
    if (window.innerWidth >= 768 && this.menuAbierto) {
      this.menuAbierto = false;
    }
  }
}

import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { CotizacionService } from '../../core/services';
import { CotizacionResponse, EstadoCotizacion } from '../../shared/models';

@Component({
  selector: 'app-detalle-cotizacion',
  imports: [CommonModule, HeaderComponent],
  templateUrl: './detalle-cotizacion.component.html',
  styleUrl: './detalle-cotizacion.component.css'
})
export class DetalleCotizacionComponent implements OnInit {

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cotizacionService = inject(CotizacionService);

  cotizacion: CotizacionResponse | null = null;
  cargando = true;
  error = '';
  cambiandoEstado = false;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id || isNaN(id)) {
      this.router.navigate(['/historial']);
      return;
    }
    this.cargarCotizacion(id);
  }

  private cargarCotizacion(id: number): void {
    this.cargando = true;
    this.error = '';

    this.cotizacionService.buscarPorId(id).subscribe({
      next: (data) => {
        this.cotizacion = data;
        this.cargando = false;
      },
      error: () => {
        this.error = 'No se pudo cargar la cotización.';
        this.cargando = false;
      }
    });
  }

  cambiarEstado(nuevoEstado: EstadoCotizacion): void {
    if (!this.cotizacion || this.cambiandoEstado) return;

    this.cambiandoEstado = true;
    this.cotizacionService.cambiarEstado(this.cotizacion.id, nuevoEstado).subscribe({
      next: (data) => {
        this.cotizacion = data;
        this.cambiandoEstado = false;
      },
      error: () => {
        this.error = 'No se pudo cambiar el estado.';
        this.cambiandoEstado = false;
      }
    });
  }

  descargarPdf(): void {
    if (!this.cotizacion) return;

    this.cotizacionService.descargarPdf(this.cotizacion.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Cotizacion-${this.cotizacion!.numeroCotizacion}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        this.error = 'No se pudo descargar el PDF.';
      }
    });
  }

  volver(): void {
    this.router.navigate(['/historial']);
  }

  formatearFecha(fechaIso: string): string {
    if (!fechaIso) return '';
    const fecha = new Date(fechaIso);
    return fecha.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  }
}

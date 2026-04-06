import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../components/header/header.component';
import { CotizacionService } from '../../core/services';
import { CotizacionSummaryResponse, PageResponse, EstadoCotizacion } from '../../shared/models';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-historial',
  imports: [CommonModule, HeaderComponent],
  templateUrl: './historial.component.html',
  styleUrl: './historial.component.css'
})
export class HistorialComponent implements OnInit, OnDestroy {

  private cotizacionService = inject(CotizacionService);

  pagina: PageResponse<CotizacionSummaryResponse> | null = null;
  telefonoBusqueda = '';
  cargando = false;
  error = '';

  private busqueda$ = new Subject<string>();
  private busquedaSub!: Subscription;

  ngOnInit(): void {
    this.busquedaSub = this.busqueda$.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(telefono => {
      this.telefonoBusqueda = telefono;
      this.cargarCotizaciones(0);
    });

    this.cargarCotizaciones(0);
  }

  ngOnDestroy(): void {
    this.busquedaSub?.unsubscribe();
  }

  onBusquedaCambiada(event: Event): void {
    const valor = (event.target as HTMLInputElement).value;
    this.busqueda$.next(valor);
  }

  cargarCotizaciones(page: number): void {
    this.cargando = true;
    this.error = '';

    const telefono = this.telefonoBusqueda.trim() || undefined;

    this.cotizacionService.listar(telefono, page).subscribe({
      next: (data) => {
        this.pagina = data;
        this.cargando = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar las cotizaciones. ¿Está corriendo el backend?';
        this.cargando = false;
      }
    });
  }

  paginaAnterior(): void {
    if (this.pagina && !this.pagina.first) {
      this.cargarCotizaciones(this.pagina.number - 1);
    }
  }

  paginaSiguiente(): void {
    if (this.pagina && !this.pagina.last) {
      this.cargarCotizaciones(this.pagina.number + 1);
    }
  }

  badgeClase(estado: EstadoCotizacion): string {
    switch (estado) {
      case 'BORRADOR':  return 'bg-slate-100 text-slate-600';
      case 'ENVIADA':   return 'bg-blue-50 text-primary';
      case 'ACEPTADA':  return 'bg-emerald-50 text-emerald-600';
      case 'RECHAZADA': return 'bg-red-50 text-secondary';
    }
  }

  formatearFecha(fechaIso: string): string {
    if (!fechaIso) return '';
    const fecha = new Date(fechaIso);
    return fecha.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }
}

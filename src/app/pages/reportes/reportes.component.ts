import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HeaderComponent } from '../../components/header/header.component';
import { AnaliticaService } from '../../core/services';
import { AnaliticaResumen, PeriodoComparado, PuntoSerie } from '../../shared/models';

/**
 * Atajos de rango. 'todo' se manda sin fechas y lo resuelve el backend;
 * 'custom' es el estado tras editar una fecha a mano (ningún chip activo).
 */
export type PresetPeriodo = 'mes' | 'meses6' | 'anio' | 'todo' | 'custom';

/** Contra qué se compara: el rango contiguo anterior o el mismo del año pasado. */
export type ModoComparacion = 'anterior' | 'anio';

/** Una barra ya posicionada en el viewBox del SVG. */
interface Barra {
  x: number;
  y: number;
  alto: number;
  ancho: number;
  tipo: 'pasado' | 'actual' | 'futuro';
  etiqueta: string;
  mostrarEtiqueta: boolean;
  ingreso: number;
  cantidad: number;
  clave: string;
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
                      'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Geometría del gráfico, en unidades del viewBox.
const SLOT = 26;
const BARRA = 15;
const ALTO_UTIL = 92;
const BASE_Y = 92;

@Component({
  selector: 'app-reportes',
  imports: [CommonModule, HeaderComponent],
  templateUrl: './reportes.component.html',
  styleUrl: './reportes.component.css'
})
export class ReportesComponent implements OnInit {

  private analiticaService = inject(AnaliticaService);
  private router = inject(Router);

  resumen: AnaliticaResumen | null = null;
  cargando = false;
  error = '';

  presetActivo: PresetPeriodo = 'anio';
  modoComparacion: ModoComparacion = 'anio';
  sinSalidaOpen = false;

  /** Rango del formulario, en 'YYYY-MM-DD'. Se sincroniza con el preset. */
  desde = '';
  hasta = '';

  /** Barras del gráfico, recalculadas al llegar cada resumen. */
  barras: Barra[] = [];
  anchoGrafico = 0;
  barraSeleccionada: Barra | null = null;
  /** true cuando el rango es tan largo que las barras pasan a ser años. */
  porAnio = false;

  ngOnInit(): void {
    this.aplicarPreset('anio');
  }

  // ══════════ Periodo ══════════

  aplicarPreset(preset: PresetPeriodo): void {
    this.presetActivo = preset;
    const hoy = new Date();

    if (preset === 'todo') {
      // Sin fechas: el backend responde con el rango que aplicó y lo mostramos.
      this.desde = '';
      this.hasta = '';
    } else if (preset === 'mes') {
      this.desde = this.iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
      this.hasta = this.iso(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0));
    } else if (preset === 'meses6') {
      this.desde = this.iso(new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1));
      this.hasta = this.iso(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0));
    } else {
      this.desde = this.iso(new Date(hoy.getFullYear(), 0, 1));
      this.hasta = this.iso(new Date(hoy.getFullYear(), 11, 31));
    }

    this.cargar();
  }

  /** Editar una fecha a mano deja de ser un preset: ningún chip queda activo. */
  onFechaCambiada(campo: 'desde' | 'hasta', event: Event): void {
    this[campo] = (event.target as HTMLInputElement).value;
    this.presetActivo = 'custom';

    // Un rango invertido daría 400; se espera a que el usuario termine.
    if (this.desde && this.hasta && this.desde <= this.hasta) {
      this.cargar();
    }
  }

  cargar(): void {
    this.cargando = true;
    this.error = '';
    this.barraSeleccionada = null;

    // Si falta alguna fecha, el backend la resuelve y se adopta lo que conteste:
    // así los inputs nunca quedan vacíos mostrando datos de un rango invisible
    // (pasa con el preset "Todo" y al borrar una de las dos). Cuando el usuario
    // tiene las dos puestas no se tocan, para no pisarle lo que acaba de escribir.
    const faltaAlguna = !this.desde || !this.hasta;

    this.analiticaService.resumen(this.desde || undefined, this.hasta || undefined)
      .subscribe({
        next: (data) => {
          this.resumen = data;
          if (faltaAlguna) {
            this.desde = data.desde;
            this.hasta = data.hasta;
          }
          this.construirBarras(data);
          this.cargando = false;
        },
        error: () => {
          this.error = 'No se pudieron cargar los reportes. ¿Está corriendo el backend?';
          this.resumen = null;
          this.cargando = false;
        }
      });
  }

  // ══════════ Comparación ══════════

  get comparado(): PeriodoComparado | null {
    if (!this.resumen) return null;
    return this.modoComparacion === 'anterior'
      ? this.resumen.periodoAnterior
      : this.resumen.mismoPeriodoAnioAnterior;
  }

  cambiarComparacion(modo: ModoComparacion): void {
    // Los dos periodos ya vienen en la misma respuesta: no hay que recargar.
    this.modoComparacion = modo;
  }

  /** Etiqueta del periodo con el que se compara, para no dejar el delta sin contexto. */
  get etiquetaComparacion(): string {
    const c = this.comparado;
    if (!c) return '';
    return this.modoComparacion === 'anterior'
      ? `vs ${this.rangoCorto(c.desde, c.hasta)}`
      : `vs ${new Date(c.desde + 'T00:00:00').getFullYear()}`;
  }

  /** '+23%' / '−12%' / '—' si no hay base con la que comparar. */
  formatearDelta(delta: number | null): string {
    if (delta === null || delta === undefined) return '—';
    const pct = Math.round(delta * 100);
    if (pct === 0) return '0%';
    return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
  }

  claseDelta(delta: number | null): string {
    if (delta === null || delta === undefined) return 'flat';
    if (delta > 0) return 'up';
    if (delta < 0) return 'down';
    return 'flat';
  }

  // ══════════ Gráfico ══════════

  /**
   * Convierte la serie en rectángulos ya posicionados.
   *
   * Se calcula una vez por respuesta y no en un getter: el template lo leería
   * en cada ciclo de detección de cambios.
   */
  private construirBarras(data: AnaliticaResumen): void {
    let serie: PuntoSerie[] = data.serieMensual ?? [];

    // Con el preset "Todo" el rango puede abarcar décadas (una sola cotización
    // con fecha de evento antigua ya estira el histórico): 300 barras mensuales
    // no se leen ni con scroll. Por encima de dos años se agrupa por año.
    // Solo suma puntos existentes, así que el total del gráfico no cambia.
    this.porAnio = serie.length > 24;
    if (this.porAnio) {
      const acc = new Map<number, PuntoSerie>();
      for (const p of serie) {
        const a = acc.get(p.anio);
        if (a) {
          a.cantidad += p.cantidad;
          a.ingreso += p.ingreso;
        } else {
          acc.set(p.anio, { anio: p.anio, mes: 1, cantidad: p.cantidad, ingreso: p.ingreso });
        }
      }
      serie = [...acc.values()].sort((x, y) => x.anio - y.anio);
    }

    this.anchoGrafico = Math.max(serie.length * SLOT, SLOT);
    const max = serie.reduce((m, p) => Math.max(m, p.ingreso), 0);

    const hoy = new Date();
    const anioHoy = hoy.getFullYear();
    const mesHoy = hoy.getMonth() + 1;

    // Con muchas barras las etiquetas se solapan: se muestran salteadas.
    const paso = serie.length <= 12 ? 1 : serie.length <= 24 ? 2 : 3;

    this.barras = serie.map((p, i) => {
      const alto = max > 0 ? (p.ingreso / max) * ALTO_UTIL : 0;
      const esActual = this.porAnio
        ? p.anio === anioHoy
        : p.anio === anioHoy && p.mes === mesHoy;
      const esFuturo = this.porAnio
        ? p.anio > anioHoy
        : p.anio > anioHoy || (p.anio === anioHoy && p.mes > mesHoy);

      return {
        x: i * SLOT + (SLOT - BARRA) / 2,
        y: BASE_Y - alto,
        alto,
        ancho: BARRA,
        tipo: esActual ? 'actual' : esFuturo ? 'futuro' : 'pasado',
        etiqueta: this.porAnio ? String(p.anio) : MESES_CORTOS[p.mes - 1],
        mostrarEtiqueta: i % paso === 0,
        ingreso: p.ingreso,
        cantidad: p.cantidad,
        clave: this.porAnio ? `a${p.anio}` : `${p.anio}-${p.mes}`,
      } as Barra;
    });
  }

  seleccionarBarra(barra: Barra): void {
    this.barraSeleccionada = this.barraSeleccionada?.clave === barra.clave ? null : barra;
  }

  /** Ancho mínimo en px para que con muchos meses el gráfico haga scroll en vez de aplastarse. */
  get minAnchoGrafico(): number | null {
    return this.barras.length > 14 ? this.barras.length * 24 : null;
  }

  get baseY(): number { return BASE_Y; }

  // ══════════ Navegación ══════════

  /** Salta al historial ya filtrado por ese cliente. */
  verCliente(telefono: string): void {
    this.router.navigate(['/historial'], { queryParams: { telefono } });
  }

  // ══════════ Formato ══════════

  /** Date → 'YYYY-MM-DD' sin pasar por UTC (toISOString restaría un día). */
  private iso(d: Date): string {
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
  }

  formatearFecha(iso: string): string {
    if (!iso) return '';
    return new Date(iso + 'T00:00:00')
      .toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  rangoCorto(desde: string, hasta: string): string {
    if (!desde || !hasta) return '';
    const d = new Date(desde + 'T00:00:00');
    const h = new Date(hasta + 'T00:00:00');
    const mismoAnio = d.getFullYear() === h.getFullYear();
    const fmt = (x: Date) => `${MESES_CORTOS[x.getMonth()]} ${x.getFullYear()}`;
    if (mismoAnio && d.getMonth() === h.getMonth()) return fmt(d);
    return `${fmt(d)} – ${fmt(h)}`;
  }

  /** Porcentaje del total, para el desglose por tipo de evento. */
  porcentaje(parte: number): number {
    const total = this.resumen?.ingresoAceptado ?? 0;
    return total > 0 ? (parte / total) * 100 : 0;
  }

  /** Ancho de la barra de ranking, relativo al primero de la lista. */
  anchoRanking(ingreso: number): number {
    const mayor = this.resumen?.topProductos?.[0]?.ingreso ?? 0;
    return mayor > 0 ? (ingreso / mayor) * 100 : 0;
  }

  get hayDatos(): boolean {
    return !!this.resumen && this.resumen.cotizacionesAceptadas > 0;
  }
}

/**
 * Espejo de los DTOs de com.abylu.software_api.dto.analitica (Tarea 4).
 * Contrato de red: la forma debe coincidir con el backend.
 *
 * Todo se calcula sobre las cotizaciones cuyo estado ACTUAL es ACEPTADA,
 * agrupadas por fechaEvento. El backend no guarda cuándo se aceptó una
 * cotización, así que "agosto" significa eventos de agosto que hoy están
 * aceptados: las cifras de un mes pasado pueden subir si más adelante se
 * acepta una cotización antigua.
 */

export interface AnaliticaResumen {
  /** Rango realmente aplicado. Sin params, el backend resuelve todo el histórico. */
  desde: string;               // 'YYYY-MM-DD'
  hasta: string;
  /** El rango llega al futuro: las comparaciones aún no son justas. */
  periodoEnCurso: boolean;

  ingresoAceptado: number;
  cotizacionesAceptadas: number;
  /** null si no hubo aceptadas: no hay promedio de nada. */
  ticketPromedio: number | null;
  /** Suma de las ENVIADA: dinero esperando respuesta. */
  ingresoPotencial: number;

  conversion: Conversion;

  periodoAnterior: PeriodoComparado;
  mismoPeriodoAnioAnterior: PeriodoComparado;

  antelacion: Antelacion;

  /** Invariante: la suma de sus ingresos es exactamente ingresoAceptado. */
  serieMensual: PuntoSerie[];

  topProductos: TopProducto[];
  productosSinSalida: ProductoSinSalida[];
  itemsFueraCatalogo: ItemsFueraCatalogo;
  porTipoEvento: TipoEventoAgregado[];
  clientesRecurrentes: ClienteRecurrente[];
}

export interface Conversion {
  aceptadas: number;
  rechazadas: number;
  enviadas: number;
  borradores: number;
  /** aceptadas / (aceptadas + rechazadas + enviadas). null si ninguna salió al cliente. */
  tasaAceptacion: number | null;
}

export interface PeriodoComparado {
  desde: string;
  hasta: string;
  ingreso: number;
  cotizaciones: number;
  ticketPromedio: number | null;
  tasaAceptacion: number | null;
  /** Fracción, no porcentaje: 0.23 = +23%. null cuando la base es 0. */
  deltaIngreso: number | null;
  deltaCotizaciones: number | null;
  deltaTicket: number | null;
}

export interface Antelacion {
  /** Días entre COTIZAR y el evento — no entre aceptar y el evento. */
  promedioDias: number | null;
  minimoDias: number | null;
  /** Cotizaciones registradas después de su evento, excluidas del promedio. */
  descartadas: number;
}

export interface PuntoSerie {
  anio: number;
  mes: number;      // 1-12
  cantidad: number;
  ingreso: number;
}

export interface TopProducto {
  productoId: number;
  nombre: string;
  vecesCotizado: number;
  cantidadTotal: number;
  ingreso: number;
}

/** Producto activo sin ventas EN EL RANGO — no significa "nunca vendido". */
export interface ProductoSinSalida {
  productoId: number;
  nombre: string;
  categoria: string;
}

export interface ItemsFueraCatalogo {
  total: number;
  ingreso: number;
  top: ItemManual[];
}

export interface ItemManual {
  descripcion: string;
  veces: number;
  ingreso: number;
}

export interface TipoEventoAgregado {
  tipoEvento: string;
  cantidad: number;
  ingreso: number;
}

/** Solo teléfono: la entidad Cliente del backend no guarda nombre. */
export interface ClienteRecurrente {
  telefono: string;
  eventos: number;
  ingreso: number;
}

/**
 * Request para crear cotización — mapea a CrearCotizacionRequest.java del backend.
 * Es lo que enviaremos en el POST /api/cotizaciones.
 */
export interface CrearCotizacionRequest {
  clienteTelefono: string;
  fechaEvento: string;          // formato: 'YYYY-MM-DD'
  tipoEvento: string;
  lugarEvento: string;
  notas: string;
  descuento: number;
  movilidad: number;
  items: ItemCotizacionRequest[];
}

/**
 * Cada item/producto dentro de la cotización.
 * Mapea a ItemCotizacionRequest.java del backend.
 */
export interface ItemCotizacionRequest {
  productoId: number;
  cantidad: number | null;       // null si es ilimitado
  esIlimitado: boolean;
  precioUnitarioManual: number | null;  // null si usa precio de escala
}

/**
 * Respuesta del backend al crear o consultar una cotización.
 * Mapea a CotizacionResponse.java.
 */
export interface CotizacionResponse {
  id: number;
  numeroCotizacion: string;      // ej: "COT-2026-0001"
  clienteTelefono: string;
  fechaEvento: string;
  tipoEvento: string;
  lugarEvento: string;
  notas: string;
  subtotal: number;
  descuento: number;
  movilidad: number;
  total: number;
  horasServicio: string;
  estado: EstadoCotizacion;
  detalles: DetalleResponse[];
}

/**
 * Cada línea del detalle en la respuesta.
 * Mapea a DetalleResponse.java.
 */
export interface DetalleResponse {
  productoNombre: string;
  cantidad: number | null;
  esIlimitado: boolean;
  precioUnitario: number;
  subtotal: number;
}

/**
 * Estados posibles de una cotización.
 * Mapea al enum EstadoCotizacion.java.
 *
 * En Java: enum EstadoCotizacion { BORRADOR, ENVIADA, ... }
 * En TS:  type literal union — mismo efecto, el compilador valida los valores.
 */
export type EstadoCotizacion = 'BORRADOR' | 'ENVIADA' | 'ACEPTADA' | 'RECHAZADA';

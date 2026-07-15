/**
 * Mapea a la entidad Producto del backend (GET /api/productos).
 *
 * En Java esto es una @Entity con @Data de Lombok.
 * En TypeScript usamos una interface — mismo concepto, solo tipado.
 */
export interface Producto {
  id: number;
  nombre: string;
  precioUnitario: number;
  categoria: string;  // 'ilimitado', 'snack', 'Estacion Salada', … — abierta: la gestiona el dueño
  activo: boolean;
}

/**
 * Mapea a ProductoPrecioEscala del backend.
 * Representa un precio especial por volumen (ej: 50 uds → $290).
 */
export interface ProductoPrecioEscala {
  id: number;
  productoId: number;
  cantidad: number;
  precioTotal: number;
  activo: boolean;
}

/* ══════════ Gestión de catálogo (Tarea 3) — espejo de los DTOs del backend ══════════ */

/** Escala dentro de ProductoGestionResponse. */
export interface EscalaGestion {
  id: number;
  cantidad: number;
  precioTotal: number;
}

/**
 * Mapea a ProductoGestionResponse (GET /api/productos/gestion).
 * Incluye productos inactivos (para reactivarlos) y sus escalas activas.
 */
export interface ProductoGestion {
  id: number;
  nombre: string;
  precioUnitario: number;
  categoria: string;
  activo: boolean;
  escalas: EscalaGestion[];
}

/** Escala dentro de CrearProductoRequest. */
export interface EscalaRequest {
  cantidad: number;
  precioTotal: number;
}

/**
 * Mapea a CrearProductoRequest (POST /api/productos y PUT /api/productos/{id}).
 * Las escalas se reemplazan en bloque: `null` = no tocar las existentes (solo PUT);
 * `[]` = eliminarlas todas. `activo` solo lo usa el PUT (reactivación).
 */
export interface CrearProductoRequest {
  nombre: string;
  precioUnitario: number;
  categoria: string;
  activo?: boolean;
  escalas: EscalaRequest[] | null;
}

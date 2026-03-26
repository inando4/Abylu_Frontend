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
  categoria: 'ilimitado' | 'snack';  // Union type = el equivalente TS de un enum Java
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

/**
 * Barrel export — permite importar todo desde un solo path:
 *   import { Producto, CotizacionResponse } from '../shared/models';
 *
 * En lugar de:
 *   import { Producto } from '../shared/models/producto.model';
 *   import { CotizacionResponse } from '../shared/models/cotizacion.model';
 */
export * from './producto.model';
export * from './cotizacion.model';

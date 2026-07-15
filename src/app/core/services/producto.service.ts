import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CrearProductoRequest,
  Producto,
  ProductoGestion,
  ProductoPrecioEscala,
} from '../../shared/models';
import { environment } from '../../../environments/environment';

/**
 * Service para productos — se comunica con ProductoController.java del backend.
 *
 * Comparación con Spring:
 *   @Injectable = @Service        → Marca la clase como singleton inyectable
 *   inject(HttpClient) = @Autowired RestClient  → Inyecta el cliente HTTP
 *   Observable<T> = ResponseEntity<T>           → Respuesta tipada asíncrona
 *
 * providedIn: 'root' significa que Angular crea UNA sola instancia (Singleton)
 * para toda la app, igual que @Service en Spring por defecto.
 */
@Injectable({ providedIn: 'root' })
export class ProductoService {

  private http = inject(HttpClient);
  private url = `${environment.apiBaseUrl}/productos`;

  /**
   * GET /api/productos → Lista de productos activos.
   * Equivale a llamar a ProductoController.listarActivos() del backend.
   *
   * Retorna un Observable: no se ejecuta hasta que alguien se "suscriba".
   * Es como un CompletableFuture de Java — lazy por defecto.
   */
  listarActivos(): Observable<Producto[]> {
    return this.http.get<Producto[]>(this.url);
  }

  /** GET /api/productos/escalas → Escalas de precio (50 uds, 100 uds, etc.) */
  listarEscalas(): Observable<ProductoPrecioEscala[]> {
    return this.http.get<ProductoPrecioEscala[]>(`${this.url}/escalas`);
  }

  /* ══════════ Gestión de catálogo (Tarea 3) ══════════
     El ámbito lo decide el backend según el rol del token:
     CLIENTE gestiona el catálogo real, INVITADO el demo. */

  /** GET /api/productos/gestion → catálogo completo (activos e inactivos) con escalas. */
  listarGestion(): Observable<ProductoGestion[]> {
    return this.http.get<ProductoGestion[]>(`${this.url}/gestion`);
  }

  /** GET /api/productos/categorias → categorías existentes (select del formulario). */
  listarCategorias(): Observable<string[]> {
    return this.http.get<string[]>(`${this.url}/categorias`);
  }

  /** POST /api/productos → crea producto + escalas. */
  crear(request: CrearProductoRequest): Observable<ProductoGestion> {
    return this.http.post<ProductoGestion>(this.url, request);
  }

  /**
   * PUT /api/productos/{id} → actualiza y reemplaza las escalas en bloque
   * (escalas: null = no tocarlas). `activo: true` reactiva un producto desactivado.
   */
  actualizar(id: number, request: CrearProductoRequest): Observable<ProductoGestion> {
    return this.http.put<ProductoGestion>(`${this.url}/${id}`, request);
  }

  /** DELETE /api/productos/{id} → soft delete (activo=false). Reversible con actualizar(). */
  eliminar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}

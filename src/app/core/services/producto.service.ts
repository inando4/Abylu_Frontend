import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Producto, ProductoPrecioEscala } from '../../shared/models';
import { API_BASE_URL } from '../api.config';

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
  private url = `${API_BASE_URL}/productos`;

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
}

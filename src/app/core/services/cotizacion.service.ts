import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, switchMap } from 'rxjs';
import { CrearCotizacionRequest, CotizacionResponse, CotizacionSummaryResponse, PageResponse, EstadoCotizacion } from '../../shared/models';
import { API_BASE_URL } from '../api.config';

/**
 * Service para cotizaciones — se comunica con CotizacionController.java.
 *
 * Maneja dos operaciones principales:
 *   1. Crear cotización (POST)
 *   2. Generar y descargar PDF (GET con responseType blob)
 */
@Injectable({ providedIn: 'root' })
export class CotizacionService {

  private http = inject(HttpClient);
  private url = `${API_BASE_URL}/cotizaciones`;

  /**
   * GET /api/cotizaciones — Lista cotizaciones paginadas.
   *
   * Soporta filtro por prefijo de teléfono y paginación.
   * Equivale a CotizacionController.listar() del backend.
   */
  listar(telefono?: string, page = 0, size = 10): Observable<PageResponse<CotizacionSummaryResponse>> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());
    if (telefono) {
      params = params.set('telefono', telefono);
    }
    return this.http.get<PageResponse<CotizacionSummaryResponse>>(this.url, { params });
  }

  /**
   * POST /api/cotizaciones — Crea una nueva cotización.
   *
   * Equivale a CotizacionController.crear() del backend.
   * El body se serializa automáticamente a JSON (igual que @RequestBody en Spring).
   */
  crear(request: CrearCotizacionRequest): Observable<CotizacionResponse> {
    return this.http.post<CotizacionResponse>(this.url, request);
  }

  /**
   * GET /api/cotizaciones/{id} — Obtiene una cotización por ID.
   */
  buscarPorId(id: number): Observable<CotizacionResponse> {
    return this.http.get<CotizacionResponse>(`${this.url}/${id}`);
  }

  /**
   * GET /api/cotizaciones/{id}/pdf — Descarga el PDF generado.
   *
   * responseType: 'blob' le dice a HttpClient que la respuesta NO es JSON,
   * sino bytes crudos (un archivo). Es como recibir un byte[] en Java.
   */
  descargarPdf(id: number): Observable<Blob> {
    return this.http.get(`${this.url}/${id}/pdf`, { responseType: 'blob' });
  }

  /**
   * PATCH /api/cotizaciones/{id}/estado — Cambia el estado de una cotización.
   */
  cambiarEstado(id: number, estado: EstadoCotizacion): Observable<CotizacionResponse> {
    return this.http.patch<CotizacionResponse>(`${this.url}/${id}/estado`, { estado });
  }

  /**
   * Flujo completo: Crear cotización → Descargar PDF.
   *
   * switchMap es un operador de RxJS. Funciona así:
   *   1. Espera a que el POST termine y devuelva la cotización creada
   *   2. Toma el ID de la respuesta
   *   3. Inicia automáticamente el GET del PDF
   *
   * Es como encadenar dos CompletableFuture con .thenCompose() en Java.
   */
  crearYDescargarPdf(request: CrearCotizacionRequest): Observable<Blob> {
    return this.crear(request).pipe(
      switchMap(cotizacion => this.descargarPdf(cotizacion.id))
    );
  }
}

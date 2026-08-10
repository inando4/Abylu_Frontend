import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AnaliticaResumen } from '../../shared/models';
import { environment } from '../../../environments/environment';

/**
 * Service de reportes — habla con AnaliticaController.java (Tarea 4).
 *
 * El ámbito de los datos lo decide el backend según el rol del token:
 * CLIENTE ve cifras reales, INVITADO las del entorno demo. El authInterceptor
 * ya adjunta el Bearer, aquí no hay que hacer nada.
 */
@Injectable({ providedIn: 'root' })
export class AnaliticaService {

  private http = inject(HttpClient);
  private url = `${environment.apiBaseUrl}/analitica`;

  /**
   * GET /api/analitica/resumen → todas las métricas de un rango en una llamada.
   *
   * Las fechas son opcionales: sin ellas el backend toma todo el histórico y
   * devuelve en `desde`/`hasta` el rango que aplicó. Por eso el preset "Todo"
   * no necesita saber de antemano cuál fue el primer evento.
   */
  resumen(desde?: string, hasta?: string): Observable<AnaliticaResumen> {
    let params = new HttpParams();
    if (desde) {
      params = params.set('desde', desde);
    }
    if (hasta) {
      params = params.set('hasta', hasta);
    }
    return this.http.get<AnaliticaResumen>(`${this.url}/resumen`, { params });
  }
}

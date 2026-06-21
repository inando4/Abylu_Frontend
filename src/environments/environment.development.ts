/**
 * Environment de DESARROLLO / TEST (archivo CON sufijo).
 *
 * Reemplaza a `environment.ts` cuando se corre:
 *   - `ng serve`                       (defaultConfiguration: development)
 *   - `ng build --configuration development`
 *   - `ng test`                        (vía fileReplacements del target test)
 *
 * Apunta al backend local (Spring Boot en localhost:8090).
 */
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:8090/api',
};

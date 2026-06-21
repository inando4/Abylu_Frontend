/**
 * Environment de PRODUCCIÓN (archivo base, SIN sufijo).
 *
 * ⚠️ Punto clave que confunde a todos al aprender environments:
 * el archivo SIN sufijo (este) es el de PRODUCCIÓN. Angular lo usa
 * por defecto y, SOLO durante `ng serve` / build de desarrollo, lo
 * REEMPLAZA por `environment.development.ts` (ver `fileReplacements`
 * en angular.json).
 *
 * Esta es la ÚNICA fuente de verdad de la URL de producción.
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://software-api-emyc.onrender.com/api',
};

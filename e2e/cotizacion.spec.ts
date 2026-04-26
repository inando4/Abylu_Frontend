import { expect, test, type Page } from '@playwright/test';

const datosCotizacion = {
  telefono: '987654321',
  lugar: 'Av. Principal 123',
  fechaEvento: '2026-05-15',
  horasServicio: '4',
};

async function irACotizacion(page: Page) {
  await page.goto('/cotizacion');
  await expect(page.getByRole('heading', { name: 'Nuevo pedido' })).toBeVisible();
}

async function llenarDatosObligatorios(page: Page) {
  await page.getByTestId('cliente-telefono').fill(datosCotizacion.telefono);
  await page.getByTestId('lugar-evento').fill(datosCotizacion.lugar);
  await page.getByTestId('fecha-evento').fill(datosCotizacion.fechaEvento);
  await page.getByTestId('horas-servicio').fill(datosCotizacion.horasServicio);
}

async function agregarPrimerProducto(page: Page) {
  await page.getByRole('button', { name: 'Agregar carrito' }).click();
  await expect(page.getByRole('heading', { name: 'Elige un carrito' })).toBeVisible();
  await page.getByTestId('product-tile').first().click();
  await expect(page.getByText('1 en carrito')).toBeVisible();
}

test.describe('Cotizacion - generacion de PDF', () => {
  test('CP-001 - muestra validacion si faltan campos obligatorios', async ({ page }) => {
    // Objetivo: evitar que el usuario avance sin completar los datos minimos.
    await irACotizacion(page);

    await page.getByRole('button', { name: 'Generar cotización' }).click();

    await expect(page.getByTestId('error-banner')).toContainText('Completa los campos obligatorios');
    await expect(page.getByTestId('confirm-dialog')).toBeHidden();
  });

  test('CP-002 - prepara una cotizacion valida y abre la confirmacion', async ({ page }) => {
    // Objetivo: comprobar el flujo normal hasta antes de crear la cotizacion real.
    await irACotizacion(page);
    await llenarDatosObligatorios(page);
    await agregarPrimerProducto(page);

    await page.getByRole('button', { name: 'Generar cotización' }).click();

    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await expect(page.getByText(`+51 ${datosCotizacion.telefono}`)).toBeVisible();
    await expect(page.getByText(datosCotizacion.fechaEvento)).toBeVisible();
    await expect(page.getByTestId('confirm-generate-pdf')).toBeVisible();
  });

  const testConEscritura = process.env['RUN_E2E_WRITE'] === 'true' ? test : test.skip;
  testConEscritura('CP-003 - genera y descarga el PDF con backend real', async ({ page }) => {
    // Objetivo: probar el flujo completo. Crea datos reales; requiere RUN_E2E_WRITE=true.
    await irACotizacion(page);
    await llenarDatosObligatorios(page);
    await agregarPrimerProducto(page);
    await page.getByRole('button', { name: 'Generar cotización' }).click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('confirm-generate-pdf').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('Cotizacion ABYLU');
  });
});

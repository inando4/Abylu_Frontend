import { expect, test, type Page } from '@playwright/test';

async function irACotizacion(page: Page) {
  await page.goto('/cotizacion');
  await expect(page.getByRole('heading', { name: 'Nuevo pedido' })).toBeVisible();
}

async function llenarDatosObligatorios(page: Page) {
  await page.getByTestId('cliente-telefono').fill('987654321');
  await page.getByTestId('lugar-evento').fill('Av. Principal 123');
  await page.getByTestId('fecha-evento').fill('2026-05-15');
  await page.getByTestId('horas-servicio').fill('4');
}

async function agregarPrimerProducto(page: Page) {
  await page.getByRole('button', { name: 'Agregar carrito' }).click();
  await expect(page.getByRole('heading', { name: 'Elige un carrito' })).toBeVisible();
  await page.getByTestId('product-tile').first().click();
  await expect(page.getByText('1 en carrito')).toBeVisible();
}

test.describe('cotizacion', () => {
  test('muestra validacion si faltan campos obligatorios', async ({ page }) => {
    await irACotizacion(page);

    await page.getByRole('button', { name: 'Generar cotización' }).click();

    await expect(page.getByTestId('error-banner')).toContainText('Completa los campos obligatorios');
    await expect(page.getByTestId('confirm-dialog')).toBeHidden();
  });

  test('permite preparar una cotizacion y abre la confirmacion', async ({ page }) => {
    await irACotizacion(page);
    await llenarDatosObligatorios(page);
    await agregarPrimerProducto(page);

    await page.getByRole('button', { name: 'Generar cotización' }).click();

    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await expect(page.getByText('+51 987654321')).toBeVisible();
    await expect(page.getByText('2026-05-15')).toBeVisible();
    await expect(page.getByTestId('confirm-generate-pdf')).toBeVisible();
  });

  const testConEscritura = process.env['RUN_E2E_WRITE'] === 'true' ? test : test.skip;
  testConEscritura('genera y descarga el PDF con backend real', async ({ page }) => {
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

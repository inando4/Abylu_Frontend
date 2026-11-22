import { expect, test, type Page } from '@playwright/test';

const datosCotizacion = {
  telefono: '987654321',
  lugar: 'Av. Principal 123',
  fechaEvento: '2026-05-15',
  horasServicio: '4',
};

// /cotizacion tiene authGuard: sin sesión redirige a /login. El invitado no necesita
// credenciales y sus datos demo se restauran en cada login.
async function entrarComoInvitado(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Entrar como invitado' }).click();
  await page.waitForURL('**/cotizacion');
}

async function irACotizacion(page: Page) {
  await entrarComoInvitado(page);
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

test.describe('Cotizacion - estado inicial (modo invitado)', () => {
  test('CP-004 - "Guardar borrador" crea la cotizacion en estado BORRADOR', async ({ page }) => {
    // Objetivo: el backend crea ENVIADA por defecto; el boton de borrador debe pedir
    // BORRADOR explicitamente. Usa el invitado: sus datos demo se restauran en cada login.
    await entrarComoInvitado(page);
    await llenarDatosObligatorios(page);
    await agregarPrimerProducto(page);

    await page.getByTestId('guardar-borrador').click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await page.getByTestId('confirm-generate-pdf').click();

    await page.waitForURL(/\/historial\/\d+$/);
    await expect(page.locator('.estado-badge')).toHaveText('BORRADOR');
  });
});

test.describe('Cotizacion - tope de filas del PDF (modo invitado)', () => {
  // El PDF admite 8 filas de productos; con descuento la movilidad ocupa una más.
  async function agregarPersonalizados(page: Page, n: number) {
    for (let i = 0; i < n; i++) {
      await page.getByRole('button', { name: 'Agregar producto personalizado' }).click();
    }
  }

  test('CP-005 - con 9 productos avisa cuántos sobran y no deja generar', async ({ page }) => {
    await entrarComoInvitado(page);
    await llenarDatosObligatorios(page);
    await agregarPersonalizados(page, 9);

    const mensaje = 'El PDF admite como máximo 8 productos y esta cotización tiene 9. Quita 1 producto para continuar.';
    await expect(page.getByTestId('aviso-filas-pdf')).toHaveText(mensaje);

    await page.getByRole('button', { name: 'Generar cotización' }).click();
    await expect(page.getByTestId('error-banner')).toHaveText(mensaje);
    await expect(page.getByTestId('confirm-dialog')).toBeHidden();

    // Al quitar uno vuelve a caber: los dos avisos desaparecen solos.
    await page.getByRole('button', { name: 'Eliminar' }).first().click();
    await expect(page.getByTestId('aviso-filas-pdf')).toBeHidden();
    await expect(page.getByTestId('error-banner')).toBeHidden();
  });

  test('CP-006 - con descuento la movilidad cuenta como fila y se explica', async ({ page }) => {
    await entrarComoInvitado(page);
    await llenarDatosObligatorios(page);
    await agregarPersonalizados(page, 8);
    await expect(page.getByTestId('aviso-filas-pdf')).toBeHidden();

    await page.locator('input[formcontrolname="movilidad"]').fill('30');
    await page.locator('input[formcontrolname="descuento"]').fill('50');
    await expect(page.getByTestId('aviso-filas-pdf')).toHaveText(
      'El PDF admite como máximo 8 filas y esta cotización ocupa 9: 8 productos + la movilidad, '
      + 'que se imprime como una fila más porque hay descuento. Quita 1 producto o quita el descuento para continuar.');

    await page.locator('input[formcontrolname="descuento"]').fill('0');
    await expect(page.getByTestId('aviso-filas-pdf')).toBeHidden();
  });

  test('CP-007 - muestra el motivo que devuelve el backend en un 400', async ({ page }) => {
    const motivo = 'Mensaje de validación del backend';
    await page.route('**/api/cotizaciones', route =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ status: 400, message: motivo }) })
        : route.continue());

    await entrarComoInvitado(page);
    await llenarDatosObligatorios(page);
    await agregarPrimerProducto(page);
    await page.getByRole('button', { name: 'Generar cotización' }).click();
    await page.getByTestId('confirm-generate-pdf').click();

    await expect(page.getByTestId('error-banner')).toHaveText(motivo);
  });
});

import { expect, test, type Page } from '@playwright/test';

/**
 * Reportes (Tarea 4), en MODO INVITADO: los agregados salen del entorno demo,
 * que el backend restaura en cada login de invitado. Requiere el backend
 * corriendo en :8090.
 *
 * Los datos demo pueden no tener cotizaciones ACEPTADAS, así que los tests
 * comprueban la estructura de la página y su comportamiento, no cifras
 * concretas: afirmar "S/ 12,450" haría el test rehén del seed.
 */

async function entrarComoInvitado(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Entrar como invitado' }).click();
  // El guest login navega a /cotizacion; de ahí vamos a reportes.
  await page.waitForURL('**/cotizacion');
  await page.goto('/reportes');
  await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible();
}

/**
 * Pulsa "Todo" y espera a que la página haya terminado de repintarse.
 *
 * No basta con esperar la respuesta HTTP: Angular re-renderiza un tick después,
 * y `count()` no reintenta. Se espera a que exista uno de los dos desenlaces
 * posibles —gráfico o estado vacío—, que son mutuamente excluyentes en la
 * plantilla; a partir de ahí contar es determinista.
 */
async function verTodoElHistorico(page: Page) {
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/analitica/resumen') && r.ok()),
    page.getByTestId('preset-todo').click(),
  ]);
  await expect(page.getByTestId('preset-todo')).toHaveClass(/on/);
  await expect(
    page.getByTestId('chart-ingresos').or(page.getByTestId('reportes-empty'))
  ).toBeVisible();
}

// Serial: cada login de invitado RESETEA los datos demo, así que estos tests no
// pueden correr en paralelo entre sí.
test.describe.configure({ mode: 'serial' });

test.describe('Reportes - analitica de cotizaciones aceptadas (modo invitado)', () => {

  test('RP-001 - carga el resumen con el preset "Este año" activo', async ({ page }) => {
    await entrarComoInvitado(page);

    // El ingreso aceptado siempre se pinta, aunque sea S/ 0.00.
    await expect(page.getByTestId('kpi-ingreso')).toBeVisible();
    await expect(page.getByTestId('kpi-ingreso')).toContainText('S/');
    await expect(page.getByTestId('kpi-ticket')).toBeVisible();
    await expect(page.getByTestId('kpi-conversion')).toBeVisible();

    // "Este año" es el preset por defecto y el rango se refleja en los inputs.
    await expect(page.getByTestId('preset-anio')).toHaveClass(/on/);
    const anio = new Date().getFullYear();
    await expect(page.getByTestId('rango-desde')).toHaveValue(`${anio}-01-01`);
    await expect(page.getByTestId('reportes-error')).toHaveCount(0);
  });

  test('RP-002 - cambiar de preset recarga y actualiza el rango', async ({ page }) => {
    await entrarComoInvitado(page);

    await page.getByTestId('preset-mes').click();

    await expect(page.getByTestId('preset-mes')).toHaveClass(/on/);
    await expect(page.getByTestId('preset-anio')).not.toHaveClass(/on/);

    // "Este mes" arranca el día 1 del mes en curso.
    const hoy = new Date();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    await expect(page.getByTestId('rango-desde'))
      .toHaveValue(`${hoy.getFullYear()}-${mes}-01`);
  });

  test('RP-003 - el preset "Todo" resuelve el rango en el backend', async ({ page }) => {
    await entrarComoInvitado(page);

    await page.getByTestId('preset-todo').click();
    await expect(page.getByTestId('preset-todo')).toHaveClass(/on/);

    // Se manda sin fechas y el backend contesta con el rango que aplicó:
    // los inputs tienen que acabar rellenos igualmente.
    await expect(page.getByTestId('rango-desde')).not.toHaveValue('');
    await expect(page.getByTestId('rango-hasta')).not.toHaveValue('');
  });

  test('RP-004 - alternar la comparacion no dispara otra peticion', async ({ page }) => {
    await entrarComoInvitado(page);

    let peticiones = 0;
    page.on('request', (req) => {
      if (req.url().includes('/analitica/resumen')) peticiones++;
    });

    await page.getByTestId('comparar-anterior').click();
    await expect(page.getByTestId('comparar-anterior')).toHaveClass(/on/);
    await page.getByTestId('comparar-anio').click();
    await expect(page.getByTestId('comparar-anio')).toHaveClass(/on/);

    // Los dos periodos vienen en la misma respuesta; alternar es solo pintar.
    expect(peticiones).toBe(0);
  });

  test('RP-005 - un rango sin eventos muestra el estado vacio', async ({ page }) => {
    await entrarComoInvitado(page);

    // Rango muy anterior a cualquier dato demo. Se pone "hasta" PRIMERO a
    // propósito: deja el rango invertido, el componente no llega a pedir nada,
    // y al fijar luego "desde" se dispara una única carga. Al revés habría dos
    // peticiones y la aserción podría leer la respuesta de la primera.
    await page.getByTestId('rango-hasta').fill('2001-12-31');
    await page.getByTestId('rango-desde').fill('2001-01-01');

    await expect(page.getByTestId('reportes-empty')).toBeVisible();
    await expect(page.getByTestId('reportes-empty')).toContainText('Sin cotizaciones aceptadas');
    // El gráfico no se pinta si no hay nada que graficar.
    await expect(page.getByTestId('chart-ingresos')).toHaveCount(0);
  });

  test('RP-006 - el grafico y el top de productos aparecen si hay aceptadas', async ({ page }) => {
    await entrarComoInvitado(page);
    await verTodoElHistorico(page);

    if (await page.getByTestId('reportes-empty').count() > 0) {
      // El seed demo no trae cotizaciones aceptadas: nada que graficar.
      test.skip(true, 'Sin cotizaciones aceptadas en los datos demo');
    }

    await expect(page.getByTestId('chart-ingresos')).toBeVisible();
    await expect(page.getByTestId('chart-ingresos').locator('rect').first()).toBeVisible();
  });

  test('RP-007 - tocar un cliente recurrente abre el historial ya filtrado', async ({ page }) => {
    await entrarComoInvitado(page);
    await verTodoElHistorico(page);

    const clientes = page.getByTestId('clientes-recurrentes');
    if (await clientes.count() === 0) {
      test.skip(true, 'Sin clientes con dos o más eventos en los datos demo');
    }

    const fila = clientes.locator('button').first();
    const telefono = (await fila.locator('.cli-tel').innerText()).trim();
    await fila.click();

    await page.waitForURL('**/historial?telefono=*');
    // El buscador del historial llega sembrado con ese teléfono.
    await expect(page.locator('input[type="tel"]')).toHaveValue(telefono);
  });
});

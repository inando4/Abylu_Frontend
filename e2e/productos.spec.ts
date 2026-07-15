import { expect, test, type Page } from '@playwright/test';

/**
 * CRUD de productos (Tarea 3), en MODO INVITADO: todo corre sobre el catálogo
 * demo, que el backend restaura en cada login de invitado — el test no ensucia
 * datos reales y es idempotente. Requiere el backend corriendo en :8090.
 */

async function entrarComoInvitado(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Entrar como invitado' }).click();
  // El guest login navega a /cotizacion; de ahí vamos a la gestión.
  await page.waitForURL('**/cotizacion');
  await page.goto('/productos');
  await expect(page.getByRole('heading', { name: 'Productos' })).toBeVisible();
}

// Serial: cada login de invitado RESETEA los datos demo, así que estos tests no
// pueden correr en paralelo entre sí (se borrarían el catálogo unos a otros).
test.describe.configure({ mode: 'serial' });

test.describe('Productos - gestion de catalogo (modo invitado)', () => {

  test('PG-001 - muestra el catalogo demo agrupado por categoria', async ({ page }) => {
    await entrarComoInvitado(page);

    // El catálogo demo trae 6 productos activos en 3 categorías.
    await expect(page.getByText('6 productos')).toBeVisible();
    await expect(page.getByText('Canchita Demo')).toBeVisible();
    // Chips de escalas visibles (estructura de precios de un vistazo).
    await expect(page.getByText('50 → S/ 355').first()).toBeVisible();
  });

  test('PG-002 - crea un producto con escalas y aparece en su grupo', async ({ page }) => {
    await entrarComoInvitado(page);

    await page.getByTestId('btn-nuevo-producto').click();
    await expect(page.getByTestId('sheet-producto')).toBeVisible();

    await page.getByRole('textbox', { name: 'Nombre *' }).fill('Churros E2E');
    await page.getByLabel('Categoría').selectOption('snack');
    await page.getByRole('button', { name: '+ Añadir escala' }).click();
    await page.getByLabel('Cantidad de la escala 1').fill('50');
    await page.getByLabel('Precio total de la escala 1').fill('320');

    await page.getByTestId('btn-guardar-producto').click();

    await expect(page.getByTestId('sheet-producto')).toBeHidden();
    await expect(page.getByText('Churros E2E')).toBeVisible();
    await expect(page.getByText('50 → S/ 320')).toBeVisible();
  });

  test('PG-003 - valida escalas con cantidad duplicada antes de enviar', async ({ page }) => {
    await entrarComoInvitado(page);

    await page.getByTestId('btn-nuevo-producto').click();
    await page.getByRole('textbox', { name: 'Nombre *' }).fill('Duplicado E2E');
    await page.getByLabel('Categoría').selectOption('snack');
    await page.getByRole('button', { name: '+ Añadir escala' }).click();
    await page.getByLabel('Cantidad de la escala 1').fill('50');
    await page.getByLabel('Precio total de la escala 1').fill('100');
    await page.getByRole('button', { name: '+ Añadir escala' }).click();
    await page.getByLabel('Cantidad de la escala 2').fill('50');
    await page.getByLabel('Precio total de la escala 2').fill('200');

    await page.getByTestId('btn-guardar-producto').click();

    await expect(page.getByText('Hay dos escalas con la misma cantidad.')).toBeVisible();
    await expect(page.getByTestId('sheet-producto')).toBeVisible(); // no se envió
  });

  test('PG-004 - edita un producto demo y refleja el cambio', async ({ page }) => {
    await entrarComoInvitado(page);

    const fila = page.locator('.prod-row', { hasText: 'Canchita Demo' });
    await fila.getByRole('button', { name: 'Editar Canchita Demo' }).click();
    await expect(page.getByTestId('sheet-producto')).toBeVisible();

    await page.getByRole('textbox', { name: 'Nombre *' }).fill('Canchita Demo Editada');
    await page.getByTestId('btn-guardar-producto').click();

    await expect(page.getByTestId('sheet-producto')).toBeHidden();
    await expect(page.getByText('Canchita Demo Editada')).toBeVisible();
  });

  test('PG-006 - la busqueda filtra el catalogo por nombre', async ({ page }) => {
    await entrarComoInvitado(page);

    await page.getByTestId('buscar-producto').fill('canchita');
    await expect(page.getByText('Canchita Demo')).toBeVisible();
    await expect(page.getByText('Nachos con Queso Demo')).toBeHidden();

    // Sin coincidencias → estado vacío de búsqueda.
    await page.getByTestId('buscar-producto').fill('zzz');
    await expect(page.getByText('No hay productos que coincidan')).toBeVisible();

    // Limpiar restaura el catálogo completo.
    await page.getByRole('button', { name: 'Limpiar búsqueda' }).click();
    await expect(page.getByText('Nachos con Queso Demo')).toBeVisible();
  });

  test('PG-007 - precio fijo y escalas son excluyentes segun la categoria', async ({ page }) => {
    await entrarComoInvitado(page);

    await page.getByTestId('btn-nuevo-producto').click();

    // Por defecto: categoría con escalas (no Ilimitado) y sin campo de precio fijo.
    await expect(page.getByLabel('Categoría')).toHaveValue('snack');
    await expect(page.getByLabel(/Precio fijo/)).toBeHidden();
    await page.getByRole('button', { name: '+ Añadir escala' }).click();
    await page.getByLabel('Cantidad de la escala 1').fill('50');

    // Cambiar a Ilimitado: aparece el precio fijo, desaparecen (y se descartan) las escalas.
    await page.getByLabel('Categoría').selectOption('ilimitado');
    await expect(page.getByLabel(/Precio fijo/)).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Añadir escala' })).toBeHidden();
    await expect(page.getByText('no llevan escalas')).toBeVisible();

    // Volver a snack: se ocultó el precio fijo y el bloque de escalas vuelve vacío.
    await page.getByLabel('Categoría').selectOption('snack');
    await expect(page.getByLabel(/Precio fijo/)).toBeHidden();
    await expect(page.getByRole('button', { name: '+ Añadir escala' })).toBeVisible();
    await expect(page.getByLabel('Cantidad de la escala 1')).toBeHidden();
  });

  test('PG-005 - desactiva con confirmacion y reactiva desde Desactivados', async ({ page }) => {
    await entrarComoInvitado(page);

    const fila = page.locator('.prod-row', { hasText: 'Nachos con Queso Demo' });
    await fila.getByRole('button', { name: 'Desactivar Nachos con Queso Demo' }).click();

    // Confirmación (soft delete, reversible).
    await expect(page.getByTestId('confirm-desactivar')).toBeVisible();
    await expect(page.getByText('¿Desactivar “Nachos con Queso Demo”?')).toBeVisible();
    await page.getByTestId('confirm-desactivar-btn').click();

    // Pasa a la sección Desactivados (se auto-expande tras desactivar).
    await expect(page.getByRole('button', { name: /Desactivados/ })).toBeVisible();
    const filaInactiva = page.locator('.prod-row.inactiva', { hasText: 'Nachos con Queso Demo' });
    await expect(filaInactiva).toBeVisible();

    // Ya no aparece en el picker de cotización.
    await page.goto('/cotizacion');
    await page.getByRole('button', { name: 'Agregar carrito' }).click();
    await expect(page.getByText('Nachos con Queso Demo')).toBeHidden();

    // Reactivar lo devuelve al catálogo con sus escalas.
    await page.goto('/productos');
    await page.getByRole('button', { name: /Desactivados/ }).click();
    await page.locator('.prod-row.inactiva', { hasText: 'Nachos con Queso Demo' })
      .getByRole('button', { name: 'Reactivar' }).click();

    const filaActiva = page.locator('.prod-row:not(.inactiva)', { hasText: 'Nachos con Queso Demo' });
    await expect(filaActiva).toBeVisible();
    await expect(filaActiva.getByText('50 → S/ 275')).toBeVisible();
  });
});

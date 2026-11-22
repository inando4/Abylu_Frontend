import { defineConfig, devices } from '@playwright/test';

const port = process.env['E2E_PORT'] || '4200';
// localhost y no 127.0.0.1: el CORS del backend en dev solo admite http://localhost:4200;
// con 127.0.0.1 el navegador manda otro Origin y el login (p. ej. el de invitado) falla.
const baseURL = process.env['E2E_BASE_URL'] || `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  // En serie: cada login de invitado reinicia todo el demo en el backend
  // (DemoDataService.resetSesion), así que dos tests a la vez se borran los datos entre sí.
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: process.env['E2E_BASE_URL']
    ? undefined
    : {
        command: `npm start -- --host localhost --port ${port}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
});

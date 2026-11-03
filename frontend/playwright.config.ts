import { defineConfig, devices } from '@playwright/test'

const PORT = 5173
const isCI = Boolean(process.env.CI)

// End-to-end tests (D-019). Chromium only, so results do not depend on whichever browser is
// installed on the machine. The `.e2e.ts` suffix keeps Vitest from collecting these files.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'chromium',
      // Fixed viewport: drag and connect checks depend on layout geometry.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 60_000,
  },
})

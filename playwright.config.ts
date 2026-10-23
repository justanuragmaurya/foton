import { defineConfig, devices } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Headless Chromium has no GPU; enable WebGPU on SwiftShader so the real pipeline runs.
        launchOptions: { args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader"] },
      },
    },
  ],
  webServer: {
    command: `pnpm --filter @foton/web dev --port ${port}`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

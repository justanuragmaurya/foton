import { expect, test } from "@playwright/test";

test("editor boots the GPU engine and edits layers with undo", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/edit");
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.getByTestId("backend")).toHaveText(/WebGPU|WebGL2/, { timeout: 30_000 });

  const rows = page.getByTestId("layer-row");
  const history = page.getByTestId("history");
  await expect(rows).toHaveText(["Background"]);

  await page.getByRole("button", { name: /^New Layer/ }).click();
  await page.getByRole("button", { name: /^New Layer/ }).click();
  await expect(rows).toHaveText(["Layer 2", "Layer 1", "Background"]);

  await page.getByLabel("Blend mode").selectOption("multiply");
  await page.getByTestId("document-canvas").click(); // focus the page body for shortcuts
  await page.keyboard.press("5");
  await expect(rows.first()).toContainText("50%");
  await expect(history.getByRole("listitem")).toHaveText(["New", "New Layer", "New Layer", "Blending Change", "Layer Opacity"]);

  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByLabel("Blend mode")).toHaveValue("normal");
  await expect(rows.first()).not.toContainText("50%");

  await history.getByRole("listitem").first().click();
  await expect(rows).toHaveText(["Background"]);

  expect(errors).toEqual([]);
});

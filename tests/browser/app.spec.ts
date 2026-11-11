import { test, expect } from "@playwright/test";
test("demo, profile isolation, score logging, persistence, search and coaching guidance", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Less grinding.")).toBeVisible();
  await expect(
    page.getByText("You’re exploring a demo profile."),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/overview.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Start my profile", exact: true })
    .click();
  await expect(page.getByText("Your personal playspace.")).toBeVisible();
  await page.getByRole("button", { name: "Song library", exact: true }).click();
  await page.getByRole("textbox", { name: "Search songs" }).fill("Oshama");
  await expect(page.locator(".song-card").first()).toBeVisible();
  await page
    .getByRole("button", { name: "Log score", exact: true })
    .first()
    .click();
  await page.getByLabel("Achievement (%)").fill("99.4321");
  await page.getByLabel("Combo badge").selectOption("fc");
  await page.getByRole("button", { name: "Save result", exact: true }).click();
  await page.getByRole("button", { name: "My scores", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("99.4321%");
  await page.reload();
  await expect(page.getByText("Your personal playspace.")).toBeVisible();
  await page.getByRole("button", { name: "My scores", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Explore demo", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(65);
  await page
    .getByRole("button", { name: "Start my profile", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Session planner", exact: false })
    .first()
    .click();
  await page
    .getByRole("main")
    .getByRole("button", { name: "Build my session", exact: true })
    .click();
  await expect(page.locator(".plan-track")).toHaveCount(9);
  await page.getByRole("button", { name: "Get guidance", exact: true }).click();
  await expect(page.locator(".advice-summary")).toBeVisible();
  await expect(page.locator(".advice-body")).not.toContainText("AI-generated");
  await page.screenshot({
    path: "docs/screenshots/planner.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("mobile navigation, search and horizontal layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("Less grinding.")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "Song library", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Search songs" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Difficulty", exact: true })
    .selectOption("expert");
  await page
    .getByRole("textbox", { name: "Search songs" })
    .fill("no-such-song-abcdefg");
  await expect(
    page.getByText("No charts found", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("invalid imports are rejected; valid imports merge with best scores", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "My scores", exact: true }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from("{"),
    });
  await expect(page.getByRole("status")).toContainText("not valid JSON");
  const { charts } = await (await page.request.get("/api/catalog")).json();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "scores.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          region: "intl",
          scores: [{ chartId: charts[0].id, achievement: 99.1234 }],
        }),
      ),
    });
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByText("Your personal playspace.")).toBeVisible();
});

/**
 * Mobile screenshots of the demo target: 390x844 (iPhone-class) at DPR 2, light theme.
 *
 * Bun run shots # builds nothing, serves ./dist via vite preview
 *
 * CI uploads the PNGs as the `mobile-screenshots` artifact. Locally they land in
 * frontend/screenshots/ (git-ignored).
 */
import { type Browser, chromium, type Page } from "playwright";

const ROOT = `${import.meta.dir}/..`;
const PORT = Number(Bun.env.SCREENSHOT_PORT ?? "4173");
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = `${ROOT}/${Bun.env.SCREENSHOT_DIR ?? "screenshots"}`;

const VIEWPORT = { width: 390, height: 844 } as const;

async function waitForServer(url: string, deadline = Date.now() + 30_000): Promise<void> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (response.ok) {
      return;
    }
  } catch {
    // server still starting
  }
  if (Date.now() > deadline) {
    throw new Error(`${url} did not answer in time`);
  }
  await Bun.sleep(200);
  await waitForServer(url, deadline);
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
}

async function capture(page: Page, name: string, fullPage = true): Promise<void> {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  await Bun.stdout.write(`  captured ${name}.png\n`);
}

async function openRole(page: Page, roleCode: string): Promise<void> {
  await page.goto(`${BASE}/#/role/${roleCode}`, { waitUntil: "domcontentloaded" });
  await settle(page);
}

async function blurFocused(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
}

async function openTab(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("tab", { name }).click();
  await page.waitForTimeout(250);
  await blurFocused(page);
}

/** The office page collapses its six tabs into a Select on phones. */
async function openSection(page: Page, label: string): Promise<void> {
  await page.getByRole("combobox", { name: "Sekcja" }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await page.waitForTimeout(250);
  await blurFocused(page);
}

async function captureShellStates(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Powiadomienia/ }).click();
  await page.waitForTimeout(250);
  await capture(page, "01-shell-powiadomienia", false);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Menu sesji" }).click();
  await page.waitForSelector('[data-slot="sheet-content"]');
  await page.waitForTimeout(250);
  await capture(page, "02-shell-role-sheet", false);

  // Switching the persona closes the sheet and confirms with a toast.
  await page.getByRole("button", { name: /Kierownik laboratorium/ }).click();
  await page.waitForSelector("[data-sonner-toast]");
  await page.waitForTimeout(300);
  await capture(page, "03-shell-toast-rola", false);
  await page.waitForSelector("[data-sonner-toast]", { state: "detached", timeout: 8000 });
  await page.keyboard.press("Escape");
}

async function captureAdmin(page: Page): Promise<void> {
  await openRole(page, "ADMIN");
  await capture(page, "10-admin-harmonogram");

  await page.getByRole("radio", { name: "Widok listy" }).click();
  await page.waitForTimeout(250);
  await page.locator("select").first().selectOption("due");
  await page.waitForTimeout(200);
  await page.evaluate(() => window.scrollTo(0, 620));
  await capture(page, "11-admin-harmonogram-lista", false);

  await openSection(page, "Urządzenia");
  await page.getByPlaceholder("Kod, nazwa, pracownia, nr seryjny…").fill("waga");
  await page.waitForTimeout(250);
  await blurFocused(page);
  await page.evaluate(() => window.scrollTo(0, 520));
  await capture(page, "12-admin-urzadzenia-szukanie", false);

  await page.locator("ul button").first().click();
  await page.waitForSelector('[data-slot="sheet-content"]');
  await page.waitForTimeout(350);
  await capture(page, "13-admin-karta-urzadzenia", false);
  await page.keyboard.press("Escape");

  await openSection(page, "Wyniki");
  await page.evaluate(() => window.scrollTo(0, 540));
  await capture(page, "14-admin-wyniki", false);

  await openSection(page, "Odczynniki");
  await page.evaluate(() => window.scrollTo(0, 560));
  await capture(page, "15-admin-odczynniki", false);

  await openSection(page, "Historia");
  await page.evaluate(() => window.scrollTo(0, 560));
  await capture(page, "16-admin-historia", false);
}

async function captureWorker(page: Page): Promise<void> {
  await openRole(page, "PRACOWNIK");
  await capture(page, "20-worker-zadania");

  await page.getByRole("button", { name: "Wpisz sprawdzenie" }).first().click();
  await page.waitForSelector('[data-slot="dialog-content"]');
  await page.waitForTimeout(300);
  await capture(page, "21-worker-sprawdzenie", false);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Wpisz spis" }).first().click();
  await page.waitForSelector('[data-slot="dialog-content"]');
  await page.waitForTimeout(300);
  await capture(page, "22-worker-spis", false);
  await page.keyboard.press("Escape");
}

async function captureManager(page: Page): Promise<void> {
  await openRole(page, "KIEROWNIK");
  await capture(page, "30-manager-raporty");

  await openTab(page, /Wykres próbek/);
  await page.waitForSelector(".recharts-surface");
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 560));
  await capture(page, "31-manager-wykres", false);

  await openTab(page, /Weryfikacja/);
  await page.evaluate(() => window.scrollTo(0, 540));
  await capture(page, "32-manager-weryfikacja", false);

  await openTab(page, /Pracownie/);
  await page.evaluate(() => window.scrollTo(0, 540));
  await capture(page, "33-manager-pracownie", false);
}

async function main(): Promise<void> {
  await Bun.spawn(["rm", "-rf", OUT]).exited;
  await Bun.spawn(["mkdir", "-p", OUT]).exited;

  const preview = Bun.spawn(
    ["bunx", "vite", "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"],
    { cwd: ROOT, stdout: "ignore", stderr: "inherit" },
  );

  let browser: Browser | null = null;
  try {
    await waitForServer(`${BASE}/`);
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: "pl-PL",
      timezoneId: "Europe/Warsaw",
      colorScheme: "light",
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => {
      void Bun.stderr.write(`page error: ${error.message}\n`);
      process.exitCode = 1;
    });

    await Bun.stdout.write(`Mobile target ${VIEWPORT.width}x${VIEWPORT.height} @2x -> ${OUT}\n`);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await settle(page);
    await captureShellStates(page);
    await captureAdmin(page);
    await captureWorker(page);
    await captureManager(page);
  } finally {
    await browser?.close();
    preview.kill();
  }
}

await main();

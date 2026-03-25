import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUTPUT_DIR = path.join(process.cwd(), "docs", "screenshots", "design-tokens");
const PASSWORD = "Passw0rd!";
const runTag = `${Date.now()}`;

const roleScenarios = [
  {
    role: "TEACHER",
    name: "Token Teacher",
    email: `teacher.${runTag}@example.com`,
    dashboardPath: "/teacher/dashboard",
    auth: "register",
  },
  {
    role: "STUDENT",
    name: "Token Student",
    email: `student.${runTag}@example.com`,
    dashboardPath: "/student/dashboard",
    auth: "register",
  },
  {
    role: "GUARDIAN",
    name: "Token Guardian",
    email: `guardian.${runTag}@example.com`,
    dashboardPath: "/guardian/dashboard",
    auth: "register",
  },
  {
    role: "ADMIN",
    name: "Token Admin",
    email: `admin.${runTag}@example.com`,
    dashboardPath: "/admin/dashboard",
    auth: "login",
    password: PASSWORD,
  },
];

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function login(page, email, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
}

async function createAdminAccount(scenario) {
  const response = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: BASE_URL,
      referer: `${BASE_URL}/register`,
    },
    body: JSON.stringify({
      name: scenario.name,
      email: scenario.email,
      password: scenario.password ?? PASSWORD,
      role: "ADMIN",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `admin sign-up failed (${response.status}): ${body.slice(0, 300)}`
    );
  }
}

async function register(page, scenario) {
  await page.goto(`${BASE_URL}/register`, { waitUntil: "networkidle" });
  await page.fill("#name", scenario.name);
  await page.fill("#email", scenario.email);
  await page.fill("#password", PASSWORD);
  await page.selectOption("#role", scenario.role);
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(300);
}

async function captureDashboard(page, role, dashboardPath) {
  const targetUrl = `${BASE_URL}${dashboardPath}`;
  await page.waitForTimeout(500);

  try {
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
  } catch (error) {
    const message = String(error);
    if (!message.includes("ERR_ABORTED")) {
      throw error;
    }
    await page.waitForTimeout(700);
    await page.goto(targetUrl, { waitUntil: "networkidle" });
  }
  await page.waitForTimeout(500);

  const roleName = role.toLowerCase();
  const lightPath = path.join(OUTPUT_DIR, `${roleName}-dashboard-light.png`);
  const darkPath = path.join(OUTPUT_DIR, `${roleName}-dashboard-dark.png`);

  await page.screenshot({ path: lightPath, fullPage: true });

  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.body.classList.add("dark");
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: darkPath, fullPage: true });

  return { lightPath, darkPath };
}

async function run() {
  ensureOutputDir();
  const browser = await chromium.launch({ headless: true });

  try {
    for (const scenario of roleScenarios) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1024 },
      });
      const page = await context.newPage();

      if (scenario.auth === "register") {
        await register(page, scenario);
        await login(page, scenario.email, scenario.password ?? PASSWORD);
      } else {
        await createAdminAccount(scenario);
        await login(page, scenario.email, scenario.password ?? PASSWORD);
      }

      const { lightPath, darkPath } = await captureDashboard(
        page,
        scenario.role,
        scenario.dashboardPath
      );

      console.log(`[captured] ${scenario.role}`);
      console.log(`  light: ${lightPath}`);
      console.log(`  dark : ${darkPath}`);

      await context.close();
    }
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error("capture failed", error);
  process.exit(1);
});

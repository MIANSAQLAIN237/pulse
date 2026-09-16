import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "demo");
const BASE = process.env.PULSE_DEMO_URL ?? "http://localhost:5173";

async function caption(page, text) {
  await page.evaluate((t) => {
    let el = document.getElementById("pulse-demo-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "pulse-demo-caption";
      el.style.cssText = [
        "position:fixed",
        "left:20px",
        "right:20px",
        "bottom:16px",
        "z-index:2147483647",
        "background:#1c140f",
        "color:#fffbf3",
        "font:600 17px Figtree,system-ui,sans-serif",
        "padding:12px 16px",
        "border-radius:14px",
        "box-shadow:4px 4px 0 #e23d2a",
        "pointer-events:none",
        "line-height:1.35",
      ].join(";");
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}

async function say(page, text, ms = 2400) {
  await caption(page, text);
  await page.waitForTimeout(ms);
}

async function hold(page, ms) {
  await page.waitForTimeout(ms);
}

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  slowMo: 90,
});

await mkdir(OUT_DIR, { recursive: true });

const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  recordVideo: {
    dir: OUT_DIR,
    size: { width: 1280, height: 720 },
  },
});

const page = await context.newPage();
page.setDefaultTimeout(20_000);

await page.goto(BASE, { waitUntil: "networkidle" });
await hold(page, 600);
await say(page, "Pulse — live meeting polls. Host asks. The room answers in real time.", 2800);

await say(page, "Anyone can sit in a seeded demo room, or print a new poll in seconds.", 2200);
await page.getByRole("link", { name: "Sit in the demo" }).hover();
await hold(page, 700);

await page.locator("form").scrollIntoViewIfNeeded();
await say(page, "Create a poll: a question, 2–8 options, optional hidden scoreboard, and an expiry.", 2600);

const question = page.getByPlaceholder("Which topic should we cover next?");
await question.click();
await question.fill("Where should we eat after this meetup?");
await hold(page, 400);

await page.getByPlaceholder("Option 1").fill("Pizza");
await page.getByPlaceholder("Option 2").fill("Tacos");
await page.getByRole("button", { name: "Add another option" }).click();
await page.getByPlaceholder("Option 3").fill("Salad");
await hold(page, 500);

await page.locator("select").selectOption("6");
await say(page, "Rooms expire on a timer — default 24 hours, here we set 6.", 2000);

await page.getByText("Hide the scoreboard until I reveal").click();
await say(page, "Hide results until the host reveals, so the room votes without copying the leader.", 2600);

await page.getByRole("button", { name: "Create poll" }).click();
await page.getByRole("heading", { name: "Scoreboard" }).waitFor();
await say(page, "Host desk: 4-character room code, QR for phones, live presence, and true totals.", 3200);

const code = (page.url().match(/\/host\/([A-Z0-9]+)/i) ?? [])[1]?.toUpperCase();
if (!code) throw new Error(`Could not read room code from ${page.url()}`);

await page.getByRole("button", { name: "Copy room code" }).click();
await hold(page, 900);

await say(page, "Open the audience view — this is what people see on their phones.", 2200);
await page.getByRole("link", { name: "Audience view" }).click();
await page.getByRole("heading", { name: "Where should we eat after this meetup?" }).waitFor();
await say(page, "Scoreboard is covered. One tap, one vote. Letters A B C make it fast in a room.", 2800);

await page.getByRole("button", { name: "Pizza" }).click();
await page.getByText("Your vote is in.").waitFor();
await say(page, "Vote is locked to this browser with a signed cookie — a second tap is rejected.", 2600);

await page.goBack();
  await page.getByRole("heading", { name: "Scoreboard" }).waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Lock" && !b.disabled),
  );
  await say(page, "Host still sees real counts while the room sees zeros. Pizza already has the vote.", 3000);

await page.getByRole("button", { name: "Reveal", exact: true }).click();
await hold(page, 800);
await say(page, "Reveal lifts the cover. The audience scoreboard now matches the host.", 2400);

await page.getByRole("link", { name: "Audience view" }).click();
await page.getByText("%").first().waitFor();
await say(page, "Audience now sees live percentages. Your choice stays marked.", 2600);

await page.goBack();
  await page.getByRole("heading", { name: "Scoreboard" }).waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Lock" && !b.disabled),
  );
  await page.getByRole("button", { name: "Lock", exact: true }).click();
  await hold(page, 700);
  await say(page, "Lock stops new votes mid-meeting. Unlock opens the room again.", 2400);

  await page.getByRole("button", { name: "Unlock", exact: true }).click();
  await hold(page, 700);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByText("closed", { exact: true }).waitFor();
await say(page, "Close ends the poll. Status becomes closed and voting stays off.", 2400);

await page.goto(`${BASE}/join`, { waitUntil: "networkidle" });
await say(page, "People can also type the room code — no account required.", 2200);
await page.getByPlaceholder("K7MQ").click();
await page.getByPlaceholder("K7MQ").pressSequentially("K7MQ", { delay: 160 });
await page.getByRole("button", { name: "Join the room" }).click();
await page.getByRole("heading", { name: "Which topic should we cover next?" }).waitFor();
await say(page, "Seeded demo room K7MQ is ready for a recruiter click — question, options, live bars.", 3000);

await page.goto(`${BASE}/host/K7MQ?host=pulse-demo-host-token`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "Scoreboard" }).waitFor();
await say(page, "Host console for the same demo: QR, lock, reveal, close, presence.", 2800);

await page.goto(`${BASE}/join`, { waitUntil: "networkidle" });
await page.getByPlaceholder("K7MQ").fill("ZZZZ");
await page.getByRole("button", { name: "Join the room" }).click();
await page.getByRole("alert").waitFor();
await say(page, "Unknown codes fail clearly. Empty rooms are not silent 404 pages.", 2600);

await page.goto(BASE, { waitUntil: "networkidle" });
await say(page, "That’s Pulse: create, share code or QR, vote once, live results, host controls.", 3200);

const video = page.video();
await context.close();
await browser.close();

if (!video) throw new Error("Playwright did not record a video");
const webm = await video.path();
const destWebm = path.join(OUT_DIR, "pulse-walkthrough.webm");
await copyFile(webm, destWebm);
console.log(destWebm);
console.log(code);

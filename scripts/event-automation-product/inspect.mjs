import { chromium } from "@playwright/test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

const output = path.resolve(
  process.env.EVENT_E2E_OUTPUT || ".commander/event-automation-current/runtime"
)
await mkdir(output, { recursive: true })
const cdp = process.env.EVENT_E2E_CDP
const browser = cdp
  ? await chromium.connectOverCDP(cdp)
  : await chromium.launch({ channel: "chrome", headless: true })
const context = cdp
  ? browser.contexts()[0]
  : await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = cdp
  ? context.pages().find((item) => !item.url().startsWith("devtools:"))
  : await context.newPage()
if (!page) throw new Error("No application page in desktop CDP session")
if (!cdp)
  await page.goto(process.env.EVENT_E2E_URL || "http://127.0.0.1:4311", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  })
await page.locator("body").waitFor()
await page.screenshot({
  path: path.join(output, cdp ? "desktop-inspect.png" : "web-inspect.png"),
  fullPage: true,
})
const body = await page.locator("body").innerText()
await writeFile(
  path.join(output, cdp ? "desktop-inspect.txt" : "web-inspect.txt"),
  `${page.url()}\n${body}`
)
console.log(page.url())
console.log(body.slice(0, 18000))
await browser.close()

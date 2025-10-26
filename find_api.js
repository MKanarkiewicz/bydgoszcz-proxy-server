// find_api.js
// Node 18+ (ESM). npm i playwright
import fs from "fs";
import { chromium } from "playwright";

if (process.argv.length < 3) {
  console.log("Użycie: node find_api.js <stopId>  (np. node find_api.js 8095)");
  process.exit(1);
}

const stopId = process.argv[2];
const target = `http://odjazdy.zdmikp.bydgoszcz.pl/panels/0/default.aspx?stop=${stopId}`;

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Zbierz XHR/fetch requests
  const requests = [];
  page.on("request", (req) => {
    const rtype = req.resourceType();
    if (rtype === "xhr" || rtype === "fetch") {
      requests.push({
        id: req._guid || req.url(), // internal id fallback
        method: req.method(),
        url: req.url(),
        headers: req.headers(),
        postData: req.postData(),
        time: Date.now(),
      });
      console.log("[REQ]", req.method(), req.url());
    }
  });

  // Zbierz odpowiedzi dla XHR/fetch
  page.on("response", async (res) => {
    try {
      const rtype = res.request().resourceType();
      if (rtype === "xhr" || rtype === "fetch") {
        const url = res.url();
        let shortBody = "";
        // próbujemy najpierw json, potem text (bez przechwytywania ogromnych binarek)
        const ct = (res.headers() && res.headers()["content-type"]) || "";
        if (ct.includes("application/json") || ct.includes("text/json")) {
          const json = await res.json();
          shortBody = JSON.stringify(json, null, 2).slice(0, 2000);
        } else {
          const txt = await res.text();
          shortBody = txt.slice(0, 2000);
        }
        console.log("\n[RES]", res.status(), url);
        console.log("[CT]", ct);
        console.log("[BODY PREVIEW]\n", shortBody.substring(0, 1500), "\n----\n");
        // zapis do pliku (możesz przeszukać offline)
        fs.appendFileSync("found_requests.log", `\n=== ${new Date().toISOString()} ===\nREQ: ${res.request().method()} ${url}\nStatus: ${res.status()}\nCT:${ct}\nBODY:\n${shortBody}\n\n`);
      }
    } catch (e) {
      console.warn("err reading response:", e.message);
    }
  });

  console.log("Otwieram:", target);
  // większy timeout + networkidle żeby strona miała czas na każdy fetch
  await page.goto(target, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  // dodatkowe czekanie — jeśli strona wykonuje cykliczne zapytania, daj chwilę
  await page.waitForTimeout(2500);

  // Zapis listy requestów wykrytych
  fs.writeFileSync("requests_summary.json", JSON.stringify(requests, null, 2));
  console.log("Zapisano found_requests.log oraz requests_summary.json");
  await browser.close();
  process.exit(0);
})();

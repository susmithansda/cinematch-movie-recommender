import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

// Local integration QA only. Never point this account-creating helper at a
// deployed Site: every account and diary mutation below belongs to local D1.
const origin = "http://127.0.0.1:5173";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(origin).hostname));
const root = process.cwd();
const output = path.join(root, "outputs");
const runId = Date.now().toString(36);
const downloads = path.join(output, "bengali-downloads", runId);
await Promise.all([mkdir(output, { recursive: true }), mkdir(downloads, { recursive: true })]);

const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = spawn(chrome, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-port=9232", `--user-data-dir=${path.join(root, ".sites-runtime", "bengal-qa")}`,
  "about:blank",
], { windowsHide: true, stdio: "ignore" });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const result = { origin, startedAt: new Date().toISOString(), checks: [], screenshots: [], runtimeErrors: [], consoleErrors: [], localNetworkErrors: [] };
let ws;
let call;
let evaluate;
let browserApi;
let account;
let accountCreated = false;

async function phase(name, run) {
  const started = Date.now();
  try {
    const details = await run();
    result.checks.push({ name, passed: true, elapsedMs: Date.now() - started, ...(details ? { details } : {}) });
    console.log(`PASS ${name}`);
    return details;
  } catch (error) {
    result.checks.push({ name, passed: false, elapsedMs: Date.now() - started, error: error.message });
    throw error;
  }
}

try {
  // Fail before account creation if the local application is unavailable.
  const response = await fetch(origin, { signal: AbortSignal.timeout(10000) });
  assert.ok(response.ok, `Local preview is unavailable: HTTP ${response.status}`);
  let pages;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { pages = await (await fetch("http://127.0.0.1:9232/json/list")).json(); if (pages.some((page) => page.type === "page")) break; } catch {}
    await wait(150);
  }
  const page = pages?.find((candidate) => candidate.type === "page");
  assert.ok(page?.webSocketDebuggerUrl, "QA Chrome did not start on port 9232");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  const pending = new Map();
  const requests = new Map();
  let nextId = 1;
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      if (request) {
        clearTimeout(request.timer);
        pending.delete(message.id);
        message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
      }
    }
    if (message.method === "Runtime.exceptionThrown") {
      const detail = message.params.exceptionDetails;
      result.runtimeErrors.push(detail.exception?.description || detail.text);
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      result.consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(" "));
    }
    if (message.method === "Network.requestWillBeSent") requests.set(message.params.requestId, message.params.request.url);
    if (message.method === "Network.loadingFailed") {
      const url = requests.get(message.params.requestId);
      if (url?.startsWith(origin) && !message.params.canceled) result.localNetworkErrors.push({ url, error: message.params.errorText });
    }
  });
  call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  evaluate = async (expression, ...args) => {
    const source = typeof expression === "function" ? `(${expression.toString()})(${args.map((arg) => JSON.stringify(arg)).join(",")})` : expression;
    const evaluation = await call("Runtime.evaluate", { expression: source, awaitPromise: true, returnByValue: true });
    if (evaluation.exceptionDetails) throw new Error(evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text);
    return evaluation.result.value;
  };
  const waitFor = async (condition, description, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await evaluate(condition)) return;
      await wait(150);
    }
    throw new Error(`Timed out waiting for ${description}`);
  };
  const screenshot = async (name) => {
    // Capture the settled dialog rather than its entrance animation.
    await wait(500);
    const file = `bengali-${name}.png`;
    await writeFile(path.join(output, file), Buffer.from((await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })).data, "base64"));
    result.screenshots.push(file);
  };
  const click = async (selector) => {
    assert.equal(await evaluate((value) => Boolean(document.querySelector(value)), selector), true, `Missing control: ${selector}`);
    await evaluate((value) => document.querySelector(value).click(), selector);
  };
  const fill = async (selector, value) => evaluate((target, next) => {
    const input = document.querySelector(target);
    if (!input) throw new Error(`Missing input ${target}`);
    if (input instanceof HTMLInputElement && input.type === "checkbox") {
      if (input.checked !== Boolean(next)) input.click();
      return;
    }
    const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, String(next));
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, selector, value);
  const escape = async () => {
    await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitFor(() => !document.querySelector('[role="dialog"]'), "Escape to close the modal");
  };
  const open = async (testId) => {
    await click(`[data-testid="${testId}"]`);
    await waitFor(() => Boolean(document.querySelector('[role="dialog"]')), `${testId} dialog`);
  };
  const loadHome = async () => {
    await call("Page.navigate", { url: origin });
    await waitFor(() => Boolean(document.querySelector('[data-testid="club-open-compass"]')) && document.querySelectorAll(".movie-card").length >= 4, "feature launchers and movie catalog", 30000);
    await waitFor(() => !document.querySelector(".data-status")?.textContent.includes("Finding"), "movie catalog loading", 20000);
  };
  browserApi = async (route, method = "GET", body) => evaluate(async (url, verb, payload) => {
    if (location.hostname !== "127.0.0.1" && location.hostname !== "localhost") throw new Error("Test mutations require a local preview");
    const response = await fetch(url, { method: verb, headers: { "Content-Type": "application/json" }, ...(verb !== "GET" ? { body: JSON.stringify(payload ?? {}) } : {}) });
    let data;
    try { data = await response.json(); } catch { data = null; }
    return { status: response.status, ok: response.ok, data };
  }, route, method, body);

  await call("Page.enable");
  await call("Runtime.enable");
  await call("Network.enable");
  await call("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads, eventsEnabled: true });
  await call("Network.clearBrowserCookies");
  await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await loadHome();

  let bengaliCatalog;
  await phase("Bengali navigation shows strictly Bengali originals with an honest data-source label", async () => {
    const nav = await evaluate(() => [...document.querySelectorAll(".main-nav>button")].map(button => button.textContent.replace(/[^A-Za-z ]/g, "").trim()));
    assert.deepEqual(nav, ["Discover", "Hollywood", "Bollywood", "Bengali"]);
    await click('[data-testid="nav-bengali"]');
    await wait(550);
    await waitFor(() => !document.querySelector(".data-status")?.textContent.includes("Finding") && document.querySelectorAll(".movie-card").length > 0, "Bengali movie shelf", 25000);
    const response = await browserApi("/api/movies?industry=bengali&country=US");
    assert.ok(response.ok);
    bengaliCatalog = response.data;
    assert.ok(bengaliCatalog.movies.length > 0, "Bengali discovery must remain useful without credentials");
    assert.ok(bengaliCatalog.movies.every(movie => movie.originalLanguage === "bn" && movie.industry === "bengali"), "Hindi dubbing, Indian origin, and Bengali subtitles must not stand in for a Bengali original");
    const shelf = await evaluate(() => ({ titles: [...document.querySelectorAll(".movie-card .movie-title")].map(item => item.textContent.trim()), status: document.querySelector(".data-status")?.textContent, notice: document.querySelector(".source-notice")?.textContent || "" }));
    assert.ok(shelf.titles.every(title => bengaliCatalog.movies.some(movie => movie.title === title)));
    if (!bengaliCatalog.live) {
      assert.match(shelf.status, /curated/i);
      assert.ok(bengaliCatalog.notice && shelf.notice, "An editorial collection must explain that it is not a live release feed");
    } else assert.match(shelf.status, /live/i);
    await screenshot("desktop");
    await click(".poster-link");
    await waitFor(() => Boolean(document.querySelector(".detail-content h2")), "Bengali movie details");
    const detail = await evaluate(() => ({ title: document.querySelector(".detail-content h2").textContent.trim(), text: document.querySelector(".detail-content").textContent }));
    assert.ok(bengaliCatalog.movies.some(movie => movie.title === detail.title));
    assert.match(detail.text, /Bengali|বাংলা|\bBN\b/i);
    await screenshot("details");
    await escape();
    return { count: bengaliCatalog.movies.length, live: bengaliCatalog.live, source: bengaliCatalog.source, shelf, detail: detail.title };
  });

  await phase("Bengali-script film aliases work through the API and the visible search", async () => {
    const alias = "পথের পাঁচালী";
    const found = await browserApi("/api/movies?industry=bengali&country=US&q=" + encodeURIComponent(alias));
    assert.ok(found.ok && found.data.movies.some(movie => /Pather\s+Panchali/i.test(movie.title)), "The Bengali alias must match Pather Panchali");
    const selector = 'input[type="search"], .search-box input, input[placeholder*="Search"], input[aria-label="Search movies"]';
    await fill(selector, alias);
    await wait(650);
    await waitFor(() => !document.querySelector(".data-status")?.textContent.includes("Finding") && [...document.querySelectorAll(".movie-card .movie-title")].some(item => /Pather\s+Panchali/i.test(item.textContent)), "Bengali-script search result", 20000);
    const titles = await evaluate(() => [...document.querySelectorAll(".movie-card .movie-title")].map(item => item.textContent.trim()));
    assert.ok(titles.every(title => found.data.movies.some(movie => movie.title === title)), "Search must narrow the shelf rather than leave the previous catalog visible");
    await screenshot("alias-search");
    await fill(selector, "");
    await wait(550);
    return { alias, titles };
  });

  await phase("Hollywood and Hindi discovery remain available alongside Bengali cinema", async () => {
    const results = [];
    for (const [industry, language] of [["hollywood", "en"], ["bollywood", "hi"]]) {
      await click('[data-testid="nav-' + industry + '"]');
      await wait(550);
      await waitFor(() => !document.querySelector(".data-status")?.textContent.includes("Finding") && document.querySelectorAll(".movie-card").length > 0, industry + " movie shelf", 25000);
      const response = await browserApi("/api/movies?industry=" + industry + "&country=US");
      assert.ok(response.ok && response.data.movies.length > 0);
      assert.ok(response.data.movies.every(movie => movie.originalLanguage === language && movie.industry === industry));
      results.push({ industry, language, count: response.data.movies.length });
    }
    await click('[data-testid="nav-all"]');
    await wait(550);
    return results;
  });

  await phase("Movie Night Planner can create a Bengali-only programme", async () => {
    await open("club-open-planner");
    await fill('form [name="mode"]', "single");
    await fill('form [name="mood"]', "anything");
    await fill('form [name="industry"]', "bengali");
    await fill('form [name="maxMinutes"]', 240);
    await click('[data-testid="planner-generate"]');
    await waitFor(() => Boolean(document.querySelector(".night-plan")), "Bengali movie night");
    const plan = await evaluate(() => {
      const node = document.querySelector(".night-plan");
      return { total: Number(node.dataset.totalMinutes), count: Number(node.dataset.filmCount), films: [...node.querySelectorAll('[data-testid="planned-film"]')].map(film => ({ runtime: Number(film.dataset.runtime), industry: film.dataset.industry, title: film.querySelector("strong")?.textContent })) };
    });
    assert.equal(plan.count, 1);
    assert.equal(plan.films.length, 1);
    assert.ok(plan.films.every(film => film.industry === "bengali" && film.runtime > 0));
    assert.equal(plan.total, plan.films[0].runtime);
    assert.ok(plan.total <= 240);
    await screenshot("planner");
    await escape();
    return plan;
  });

  await phase("Guest Taste Compass clearly identifies its curated cold start", async () => {
    await open("club-open-compass");
    await waitFor(() => Boolean(document.querySelector('[data-testid="compass-cold-start"]')), "Compass cold-start explanation");
    await fill('[name="tasteLane"]', "bridge");
    await fill('[name="tasteIndustry"]', "bengali");
    await waitFor(() => document.querySelectorAll('[data-testid="compass-result"]').length > 0, "guest Bengali suggestions");
    const guest = await evaluate(() => ({ cold: document.querySelector('[data-testid="compass-cold-start"]').textContent, profile: document.querySelector('[data-testid="taste-profile"]').textContent, languages: [...document.querySelectorAll('[data-testid="compass-result"]')].map(node => node.dataset.language), text: document.querySelector(".taste-compass-experience").textContent }));
    assert.match(guest.cold, /curated|starting point/i);
    assert.ok(guest.languages.every(language => language === "bn"));
    assert.ok(!/\d+(?:\.\d+)?\s*%/.test(guest.text), "Compass must explain metadata matches without invented confidence percentages");
    await screenshot("compass-guest");
    await escape();
    return { cold: guest.cold, profile: guest.profile, count: guest.languages.length };
  });

  await phase("The Bengal festival fits three Bengali originals and two intervals in its budget", async () => {
    await open("club-open-festival");
    await fill('[name="festivalTheme"]', "bengal-stories");
    await fill('[name="festivalBudget"]', 480);
    await click('[data-testid="festival-generate"]');
    await waitFor(() => Boolean(document.querySelector('[data-testid="festival-result"]')), "Bengal festival programme");
    const plan = await evaluate(() => {
      const node = document.querySelector('[data-testid="festival-result"]');
      return { total: Number(node.dataset.totalMinutes), count: Number(node.dataset.filmCount), films: [...node.querySelectorAll('[data-testid="festival-film"]')].map(film => ({ runtime: Number(film.dataset.runtime), language: film.dataset.language, title: film.querySelector(".festival-act-copy>button")?.textContent })) };
    });
    assert.equal(plan.count, 3);
    assert.equal(plan.films.length, 3);
    assert.ok(plan.films.every(film => film.language === "bn" && film.runtime > 0));
    assert.equal(plan.total, plan.films.reduce((total, film) => total + film.runtime, 30));
    assert.ok(plan.total <= 480);
    assert.equal(new Set(plan.films.map(film => film.title)).size, 3);
    await screenshot("festival-bengal");
    await click('[data-testid="festival-calendar"]');
    let files = [];
    for (let attempt = 0; attempt < 50; attempt++) { files = (await readdir(downloads)).filter(file => file.endsWith(".ics")); if (files.length) break; await wait(100); }
    assert.ok(files.length, "Festival must produce a real local calendar file");
    const calendar = await readFile(path.join(downloads, files[0]), "utf8");
    assert.match(calendar, /BEGIN:VCALENDAR/);
    assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 5, "The three films and two intervals must be separate sessions");
    assert.equal(new Set([...calendar.matchAll(/^UID:(.+)$/gm)].map(match => match[1].trim())).size, 5, "Each downloaded calendar event needs a distinct UID");
    return { ...plan, calendar: path.relative(root, path.join(downloads, files[0])) };
  });

  await phase("World Tour retains one English, one Hindi, and one Bengali film without relaxing the budget", async () => {
    await fill('[name="festivalTheme"]', "world-tour");
    await fill('[name="festivalBudget"]', 600);
    await click('[data-testid="festival-generate"]');
    await waitFor(() => Boolean(document.querySelector('[data-testid="festival-result"]')), "World Tour programme");
    const plan = await evaluate(() => {
      const node = document.querySelector('[data-testid="festival-result"]');
      return { total: Number(node.dataset.totalMinutes), count: Number(node.dataset.filmCount), films: [...node.querySelectorAll('[data-testid="festival-film"]')].map(film => ({ runtime: Number(film.dataset.runtime), language: film.dataset.language })) };
    });
    assert.equal(plan.count, 3);
    assert.deepEqual(plan.films.map(film => film.language).sort(), ["bn", "en", "hi"]);
    assert.equal(plan.total, plan.films.reduce((total, film) => total + film.runtime, 30));
    assert.ok(plan.total <= 600);
    await screenshot("festival-world-tour");
    await fill('[name="festivalBudget"]', 180);
    await click('[data-testid="festival-generate"]');
    await waitFor(() => !document.querySelector('[data-testid="festival-result"]') && Boolean(document.querySelector(".festival-experience .club-empty")), "honest impossible-budget state");
    const empty = await evaluate(() => document.querySelector(".festival-experience .club-empty").textContent);
    assert.match(empty, /more room|more time|budget|different films|known runtimes/i);
    await screenshot("festival-empty");
    await escape();
    return { ...plan, impossibleBudget: 180, empty };
  });

  await phase("A real local diary rating shapes the compass after refresh and keeps watched films out", async () => {
    account = { name: "FRAME Bengal QA", email: "qa-bengal-" + runId + "@frame.example.test", password: "Frame local Bengal QA " + runId + " only!" };
    const registered = await browserApi("/api/auth/register", "POST", account);
    assert.ok(registered.ok, "Local account creation failed: " + registered.status + " " + (registered.data?.error || ""));
    accountCreated = true;
    const movie = await browserApi("/api/movies/seed-693134");
    assert.ok(movie.ok && movie.data.movie.genres.includes("Adventure"));
    const written = await browserApi("/api/diary", "PUT", { movie: movie.data.movie, rating: 5, note: "Bengali discovery QA: Adventure is a favorite.", watchedAt: "2026-11-14" });
    assert.ok(written.ok);
    await loadHome();
    await open("club-open-compass");
    await waitFor(() => document.querySelector('[data-testid="taste-profile"] strong')?.textContent === "1" && Boolean(document.querySelector(".compass-profile-shape")), "profile from persisted five-star rating");
    const profile = await evaluate(() => ({ counts: document.querySelector('[data-testid="taste-profile"]').textContent, description: document.querySelector(".taste-compass-drawing").getAttribute("aria-label"), points: document.querySelector(".compass-profile-shape").getAttribute("points"), cold: Boolean(document.querySelector('[data-testid="compass-cold-start"]')) }));
    assert.equal(profile.cold, false);
    assert.match(profile.description, /Adventure/);
    const points = profile.points.trim().split(/[ ,]+/).map(Number);
    assert.ok(points.some((value, index) => Math.abs(value - (index % 2 === 0 ? 160 : 145)) > 1), "Positive genre weights must produce a real profile shape rather than a collapsed zero-weight point");
    await fill('[name="tasteLane"]', "comfort");
    await fill('[name="tasteIndustry"]', "hollywood");
    await waitFor(() => document.querySelectorAll('[data-testid="compass-result"]').length > 0 && [...document.querySelectorAll('[data-testid="compass-result"]')].every(node => node.dataset.language === "en"), "personal English recommendations");
    const knownKey = "movie:duneparttwo:2024";
    assert.ok((await evaluate(() => [...document.querySelectorAll('[data-testid="compass-result"]')].map(node => node.dataset.movieKey))).every(key => key !== knownKey), "A canonical copy of the logged film must not be recommended");
    await screenshot("compass-profile");
    await fill('[name="tasteLane"]', "bridge");
    await fill('[name="tasteIndustry"]', "bengali");
    await waitFor(() => document.querySelectorAll('[data-testid="compass-result"]').length > 0 && [...document.querySelectorAll('[data-testid="compass-result"]')].every(node => node.dataset.language === "bn"), "personal Bengali bridge");
    const bridge = await evaluate(() => ({ languages: [...document.querySelectorAll('[data-testid="compass-result"]')].map(node => node.dataset.language), reasons: [...document.querySelectorAll('[data-testid="compass-result"] li')].map(node => node.textContent.trim()), text: document.querySelector(".taste-compass-experience").textContent }));
    assert.ok(bridge.reasons.some(reason => /Adventure.*(?:connects|ratings|saved)/i.test(reason)), "A Bengali adventure match must explain its connection to the member's actual positive genre evidence");
    assert.ok(!/\d+(?:\.\d+)?\s*%/.test(bridge.text));
    await screenshot("compass-bridge");
    await escape();
    return { account: account.email, profile, bridge: { count: bridge.languages.length, reasons: bridge.reasons } };
  });

  for (const device of [{ name: "mobile", width: 390, height: 844 }, { name: "tablet", width: 768, height: 1024 }]) {
    await phase(device.width + "px layout keeps four cinemas and six club tabs accessible without page overflow", async () => {
      await call("Emulation.setDeviceMetricsOverride", { width: device.width, height: device.height, deviceScaleFactor: 1, mobile: true });
      await evaluate(() => window.scrollTo(0, 0));
      await wait(250);
      const page = await evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, navCount: document.querySelectorAll(".main-nav>button").length }));
      assert.equal(page.navCount, 4);
      assert.ok(page.scrollWidth <= page.width + 1 && page.bodyWidth <= page.width + 1);
      for (const id of ["nav-all", "nav-hollywood", "nav-bollywood", "nav-bengali"]) {
        const target = await evaluate(testId => { const button = document.querySelector('[data-testid="' + testId + '"]'); button.scrollIntoView({ block: "nearest", inline: "nearest" }); button.focus(); const rect = button.getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width, focused: document.activeElement === button, pageWidth: document.documentElement.scrollWidth }; }, id);
        assert.ok(target.width > 0 && target.left >= -1 && target.right <= device.width + 1 && target.focused, id + " must be reachable");
        assert.ok(target.pageWidth <= device.width + 1);
      }
      await screenshot(device.name);
      await open("club-open-compass");
      const tabs = await evaluate(() => { const nav = document.querySelector(".club-tabs"), buttons = [...nav.querySelectorAll("button")]; const last = buttons.at(-1); last.scrollIntoView({ block: "nearest", inline: "nearest" }); last.focus(); const rect = last.getBoundingClientRect(); return { count: buttons.length, scrollWidth: nav.scrollWidth, clientWidth: nav.clientWidth, overflowX: getComputedStyle(nav).overflowX, focused: document.activeElement === last, lastLeft: rect.left, lastRight: rect.right, pageWidth: document.documentElement.scrollWidth }; });
      assert.equal(tabs.count, 6);
      assert.ok(tabs.focused && tabs.lastLeft >= -1 && tabs.lastRight <= device.width + 1);
      assert.ok(tabs.pageWidth <= device.width + 1);
      if (tabs.scrollWidth > tabs.clientWidth + 1) assert.ok(["auto", "scroll"].includes(tabs.overflowX), "Overflow belongs inside the club tab strip");
      await screenshot(device.name + "-compass");
      await escape();
      return { ...page, tabs };
    });
  }

  assert.deepEqual(result.runtimeErrors, [], "No runtime exceptions are allowed");
  assert.deepEqual(result.consoleErrors, [], "No console errors are allowed");
  assert.deepEqual(result.localNetworkErrors, [], "Local app requests must not fail");
  result.passed = true;

} catch (error) {
  result.passed = false;
  result.failure = { message: error.message, stack: error.stack };
  console.error(error.message);
  if (call) {
    try { await writeFile(path.join(output, "bengali-failure.png"), Buffer.from((await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })).data, "base64")); result.screenshots.push("bengali-failure.png"); } catch {}
  }
  process.exitCode = 1;
} finally {
  if (accountCreated && browserApi) {
    try {
      // This is a unique fake local account created by this run, so its leftover
      // test entries can also be cleaned if an earlier UI assertion failed.
      const me = await browserApi("/api/auth/me");
      if (me.data?.user?.email === account.email) {
        const diary = await browserApi("/api/diary");
        for (const entry of diary.data?.entries || []) {
          const id = entry.movie?.id || entry.movieId;
          if (id) await browserApi(`/api/diary?id=${encodeURIComponent(id)}`, "DELETE");
        }
        const loggedOut = await browserApi("/api/auth/logout", "POST");
        result.localAccountLoggedOut = loggedOut.ok;
      }
    } catch (error) { result.cleanupError = error.message; }
  }
  result.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, "bengali-qa.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (call) await call("Browser.close").catch(() => {});
  ws?.close();
  browser.kill();
}

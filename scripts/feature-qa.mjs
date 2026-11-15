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
const downloads = path.join(output, "feature-downloads", runId);
await Promise.all([mkdir(output, { recursive: true }), mkdir(downloads, { recursive: true })]);

const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = spawn(chrome, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-port=9230", `--user-data-dir=${path.join(root, ".sites-runtime", "feature-qa")}`,
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
    try { pages = await (await fetch("http://127.0.0.1:9230/json/list")).json(); if (pages.some((page) => page.type === "page")) break; } catch {}
    await wait(150);
  }
  const page = pages?.find((candidate) => candidate.type === "page");
  assert.ok(page?.webSocketDebuggerUrl, "QA Chrome did not start on port 9230");
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
    const file = `feature-${name}.png`;
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
    await waitFor(() => Boolean(document.querySelector('[data-testid="club-open-planner"]')) && document.querySelectorAll(".movie-card").length >= 4, "feature launchers and movie catalog", 30000);
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
  await screenshot("desktop");

  await phase("A known-runtime Hindi and English double feature fits the selected time budget", async () => {
    await open("club-open-planner");
    await fill('form [name="mode"]', "double");
    await fill('form [name="mood"]', "anything");
    await fill('form [name="industry"]', "all");
    await fill('form [name="maxMinutes"]', 360);
    await fill('form [name="bothWorlds"]', true);
    await click('[data-testid="planner-generate"]');
    await waitFor(() => Boolean(document.querySelector(".night-plan")), "generated movie night");
    const plan = await evaluate(() => {
      const plan = document.querySelector(".night-plan");
      return {
        total: Number(plan.dataset.totalMinutes), count: Number(plan.dataset.filmCount),
        films: [...plan.querySelectorAll('[data-testid="planned-film"]')].map((film) => ({
          runtime: Number(film.dataset.runtime), industry: film.dataset.industry,
          title: film.querySelector("h3,h4,strong")?.textContent?.trim() || "",
        })),
      };
    });
    assert.equal(plan.count, 2);
    assert.equal(plan.films.length, 2);
    assert.ok(plan.films.every((film) => Number.isFinite(film.runtime) && film.runtime > 0), "Only films with known positive runtimes may enter a timed plan");
    const runtime = plan.films.reduce((total, film) => total + film.runtime, 0);
    assert.equal(plan.total, runtime + 15, "A double feature includes exactly one 15-minute interval");
    assert.ok(plan.total <= 360, "Film runtimes plus the interval must fit the maximum budget");
    assert.deepEqual([...new Set(plan.films.map((film) => film.industry))].sort(), ["bollywood", "hollywood"]);
    await screenshot("planner");
    await click('[data-testid="planner-calendar"]');
    let files = [];
    for (let attempt = 0; attempt < 50; attempt++) {
      files = (await readdir(downloads)).filter((file) => file.toLowerCase().endsWith(".ics"));
      if (files.length) break;
      await wait(100);
    }
    assert.ok(files.length, "Planner must generate a real local ICS download");
    const calendar = await readFile(path.join(downloads, files[0]), "utf8");
    assert.match(calendar, /BEGIN:VCALENDAR/);
    assert.match(calendar, /BEGIN:VEVENT/);
    assert.match(calendar, /DTSTART/);
    assert.match(calendar, /END:VCALENDAR/);
    assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 3, "The two films and interval are separate calendar events");
    await escape();
    return { ...plan, runtime, calendar: path.relative(root, path.join(downloads, files[0])) };
  });

  await phase("Comparison accepts three films and keeps the fourth out", async () => {
    const candidates = await evaluate(() => [...document.querySelectorAll(".compare-toggle")].slice(0, 4).map((button) => button.getAttribute("aria-label").replace(/^Compare\s+/i, "")));
    assert.equal(candidates.length, 4, "Need four distinct catalog cards to test the three-film limit");
    for (let index = 0; index < 4; index++) await evaluate((position) => document.querySelectorAll(".compare-toggle")[position].click(), index);
    const selection = await evaluate(() => [...document.querySelectorAll(".compare-toggle")].slice(0, 4).map((button) => button.getAttribute("aria-pressed")));
    assert.deepEqual(selection, ["true", "true", "true", "false"]);
    assert.equal(await evaluate(() => Boolean(document.querySelector('[data-testid="compare-tray"]'))), true);
    await open("club-open-compare");
    await waitFor(() => Boolean(document.querySelector(".compare-table")), "comparison table");
    const text = await evaluate(() => document.querySelector(".compare-table").textContent);
    for (const title of candidates.slice(0, 3)) assert.ok(text.includes(title), `Comparison should include ${title}`);
    assert.ok(!text.includes(candidates[3]), "The fourth selected title must not be added");
    await screenshot("comparison");
    await escape();
    await evaluate(() => document.querySelector('.compare-toggle[aria-pressed="true"]').click());
    assert.equal(await evaluate(() => document.querySelectorAll('.compare-toggle[aria-pressed="true"]').length), 2);
    return { titles: candidates.slice(0, 3), rejected: candidates[3] };
  });

  await phase("Blind Date conceals the title, reveals it, and opens that film", async () => {
    await open("club-open-blind");
    assert.equal(await evaluate(() => Boolean(document.querySelector(".blind-film-title"))), false, "Blind Date must conceal its title until reveal");
    await screenshot("blind-hidden");
    await click('[data-testid="blind-reveal"]');
    await waitFor(() => Boolean(document.querySelector(".blind-film-title")), "Blind Date reveal");
    const first = await evaluate(() => document.querySelector(".blind-film-title").textContent.trim());
    assert.ok(first);
    await click('[data-testid="blind-next"]');
    await waitFor(() => !document.querySelector(".blind-film-title"), "reroll to conceal the next title");
    await click('[data-testid="blind-reveal"]');
    await waitFor(() => Boolean(document.querySelector(".blind-film-title")), "rerolled title reveal");
    const title = await evaluate(() => document.querySelector(".blind-film-title").textContent.trim());
    await screenshot("blind-revealed");
    await click('[data-testid="blind-open-film"]');
    await waitFor(() => Boolean(document.querySelector(".detail-content h2")), "revealed film details");
    assert.equal(await evaluate(() => document.querySelector(".detail-content h2").textContent.trim()), title);
    assert.equal(await evaluate(() => document.querySelectorAll('[role="dialog"]').length), 1, "Opening the movie must not nest focus traps");
    await escape();
    return { first, openedTitle: title };
  });

  await phase("Guest Cinema Passport offers sign-in", async () => {
    await open("club-open-passport");
    assert.equal(await evaluate(() => Boolean(document.querySelector('[data-testid="passport-signin"]'))), true);
    assert.equal(await evaluate(() => Boolean(document.querySelector(".passport-stats"))), false);
    await screenshot("passport-guest");
    await click('[data-testid="passport-signin"]');
    await waitFor(() => Boolean(document.querySelector(".auth-content")), "guest passport sign-in form");
    await escape();
    return { signInCta: true };
  });

  let diaryMovie;
  let diaryNote;
  let uiLoggedMovie;
  await phase("A local account stores a diary entry and reads it after a full reload", async () => {
    account = { name: "FRAME Feature QA", email: `qa-${runId}@frame.example.test`, password: `Frame local QA ${runId} only!` };
    const registered = await browserApi("/api/auth/register", "POST", account);
    assert.ok(registered.ok, `Local account creation failed: HTTP ${registered.status} ${registered.data?.error || ""}`);
    accountCreated = true;
    const movie = await browserApi("/api/movies/seed-693134");
    assert.ok(movie.ok && movie.data?.movie?.id, "Known editorial movie details must be available for diary QA");
    diaryMovie = movie.data.movie;
    diaryNote = `Local feature QA ${runId}: a memorable movie night.`;
    const written = await browserApi("/api/diary", "PUT", { movie: diaryMovie, rating: 4, note: diaryNote, watchedAt: "2026-11-14" });
    assert.ok(written.ok, `Diary save failed: HTTP ${written.status} ${written.data?.error || ""}`);
    await loadHome();
    const me = await browserApi("/api/auth/me");
    assert.equal(me.data?.user?.email, account.email);
    await open("club-open-passport");
    await waitFor(() => Boolean(document.querySelector(".passport-stats")) && Boolean(document.querySelector(".diary-card")), "persisted Cinema Passport entry");
    const passport = await evaluate(() => ({ text: document.querySelector('.club-modal[role="dialog"]')?.textContent || document.querySelector('[role="dialog"]').textContent, cards: document.querySelectorAll(".diary-card").length }));
    assert.ok(passport.text.includes(diaryMovie.title));
    assert.ok(passport.text.includes(diaryNote));
    const saved = await browserApi("/api/diary");
    const entry = saved.data?.entries?.find((candidate) => candidate.movie?.id === diaryMovie.id || candidate.movieId === diaryMovie.id);
    assert.ok(entry, "The signed-in API must return the same persisted movie");
    assert.equal(entry.rating, 4);
    assert.equal(entry.note, diaryNote);
    assert.equal(entry.watchedAt, "2026-11-14");
    await screenshot("passport-signed-in");
    return { account: account.email, movie: diaryMovie.title, cards: passport.cards, rating: entry.rating, watchedAt: entry.watchedAt };
  });

  await phase("A signed-in member can log a film from its details and keep it after refresh", async () => {
    await escape();
    const picked = await evaluate((existingTitle) => {
      const card = [...document.querySelectorAll(".movie-card")].find((item) => item.querySelector(".movie-title")?.textContent.trim() !== existingTitle);
      if (!card) return false;
      card.querySelector(".poster-link").click();
      return true;
    }, diaryMovie.title);
    assert.equal(picked, true, "A different catalog title must be available for a new diary entry");
    await waitFor(() => Boolean(document.querySelector('[data-testid="log-movie"]')), "log action on movie details");
    const title = await evaluate(() => document.querySelector(".detail-content h2").textContent.trim());
    await click('[data-testid="log-movie"]');
    await waitFor(() => Boolean(document.querySelector('[data-testid="diary-save"]')), "new diary form");
    await fill('form [name="rating"]', "3");
    await fill('form [name="watchedAt"]', "2026-11-14");
    const note = `Local feature QA ${runId}: logged from the film details.`;
    await fill('form [name="note"]', note);
    await click('[data-testid="diary-save"]');
    for (let attempt = 0; attempt < 60; attempt++) {
      const list = await browserApi("/api/diary");
      const entry = list.data?.entries?.find((candidate) => candidate.movie?.title === title && candidate.note === note);
      if (entry) { uiLoggedMovie = entry.movie; assert.equal(entry.rating, 3); break; }
      await wait(150);
    }
    assert.ok(uiLoggedMovie?.id, "Saving through the diary form must create the matching API record");
    await loadHome();
    await open("club-open-passport");
    await waitFor(() => document.querySelectorAll(".diary-card").length >= 2, "both diary entries after refresh");
    const text = await evaluate(() => [...document.querySelectorAll(".diary-card")].map((card) => card.textContent).join("\n"));
    assert.ok(text.includes(title) && text.includes(note));
    assert.ok(text.includes(diaryMovie.title) && text.includes(diaryNote));
    await screenshot("passport-ui-log");
    return { title, rating: 3, note };
  });

  await phase("Diary edit form updates rating, date, and note and survives another reload", async () => {
    const opened = await evaluate((title) => {
      const card = [...document.querySelectorAll(".diary-card")].find((item) => item.querySelector("h4")?.textContent.trim() === title);
      if (!card) return false;
      card.querySelector('[data-testid="diary-edit"]').click();
      return true;
    }, diaryMovie.title);
    assert.equal(opened, true, "The known diary entry must remain editable");
    await waitFor(() => Boolean(document.querySelector('[data-testid="diary-save"]')), "diary edit form");
    const updatedNote = `${diaryNote} Edited through the form.`;
    await fill('form [name="rating"]', "5");
    await fill('form [name="watchedAt"]', "2026-11-13");
    await fill('form [name="note"]', updatedNote);
    await screenshot("diary-edit");
    await click('[data-testid="diary-save"]');
    let entry;
    for (let attempt = 0; attempt < 60; attempt++) {
      const list = await browserApi("/api/diary");
      entry = list.data?.entries?.find((candidate) => candidate.movie?.id === diaryMovie.id || candidate.movieId === diaryMovie.id);
      if (entry?.note === updatedNote) break;
      await wait(150);
    }
    assert.equal(entry?.note, updatedNote);
    assert.equal(entry?.rating, 5);
    assert.equal(entry?.watchedAt, "2026-11-13");
    await loadHome();
    await open("club-open-passport");
    await waitFor(() => Boolean(document.querySelector(".diary-card")), "updated diary after refresh");
    assert.ok((await evaluate(() => [...document.querySelectorAll(".diary-card")].map((card) => card.textContent).join("\n"))).includes(updatedNote));
    await screenshot("passport-persisted");
    await escape();
    return { rating: entry.rating, watchedAt: entry.watchedAt, note: entry.note };
  });

  await phase("The local diary DELETE endpoint removes only the test entries", async () => {
    const ids = [diaryMovie.id, uiLoggedMovie.id];
    for (const id of ids) {
      const removed = await browserApi(`/api/diary?id=${encodeURIComponent(id)}`, "DELETE");
      assert.ok(removed.ok, `Diary deletion failed: HTTP ${removed.status}`);
    }
    const list = await browserApi("/api/diary");
    assert.ok(!list.data?.entries?.some((entry) => ids.includes(entry.movie?.id) || ids.includes(entry.movieId)));
    return { removedMovies: [diaryMovie.title, uiLoggedMovie.title] };
  });

  for (const device of [{ name: "mobile", width: 390, height: 844 }, { name: "tablet", width: 768, height: 1024 }]) {
    await phase(`${device.width}px layout and planner modal fit without horizontal overflow`, async () => {
      await call("Emulation.setDeviceMetricsOverride", { width: device.width, height: device.height, deviceScaleFactor: 1, mobile: true });
      await evaluate(() => window.scrollTo(0, 0));
      await wait(250);
      const page = await evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth }));
      assert.ok(page.scrollWidth <= page.width + 1 && page.bodyWidth <= page.width + 1, `${device.name} page overflows horizontally`);
      await screenshot(device.name);
      await open("club-open-planner");
      const modal = await evaluate(() => {
        const rect = document.querySelector('[role="dialog"]').getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, pageWidth: document.documentElement.scrollWidth };
      });
      assert.ok(modal.left >= -1 && modal.right <= device.width + 1, `${device.name} modal must fit the viewport`);
      assert.ok(modal.pageWidth <= device.width + 1, `${device.name} modal must not create page overflow`);
      await screenshot(`${device.name}-planner`);
      await escape();
      return { ...page, modal };
    });
  }

  assert.deepEqual(result.runtimeErrors, [], "No browser runtime exceptions are allowed");
  assert.deepEqual(result.consoleErrors, [], "No console errors are allowed during feature interactions");
  assert.deepEqual(result.localNetworkErrors, [], "Local app requests must not fail");
  result.passed = true;
} catch (error) {
  result.passed = false;
  result.failure = { message: error.message, stack: error.stack };
  console.error(error.message);
  if (call) {
    try { await writeFile(path.join(output, "feature-failure.png"), Buffer.from((await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })).data, "base64")); result.screenshots.push("feature-failure.png"); } catch {}
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
  await writeFile(path.join(output, "feature-qa.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (call) await call("Browser.close").catch(() => {});
  ws?.close();
  browser.kill();
}

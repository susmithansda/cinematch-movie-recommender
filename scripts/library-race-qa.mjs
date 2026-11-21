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
const downloads = path.join(output, "race-downloads", runId);
await Promise.all([mkdir(output, { recursive: true }), mkdir(downloads, { recursive: true })]);

const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = spawn(chrome, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-port=9234", `--user-data-dir=${path.join(root, ".sites-runtime", "library-race-qa")}`,
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
    try { pages = await (await fetch("http://127.0.0.1:9234/json/list")).json(); if (pages.some((page) => page.type === "page")) break; } catch {}
    await wait(150);
  }
  const page = pages?.find((candidate) => candidate.type === "page");
  assert.ok(page?.webSocketDebuggerUrl, "QA Chrome did not start on port 9234");
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
    const file = `library-race-${name}.png`;
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

  const gateFetch = (target, verb) => {
    const nativeFetch = window.fetch.bind(window);
    const gate = { endpoint: target, method: verb, started: false, held: false, returned: false, release: null, nativeFetch };
    window.__frameRaceGate = gate;
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.url, location.href);
      const requestMethod = (init?.method || (typeof input !== "string" ? input.method : "GET") || "GET").toUpperCase();
      const shouldHold = !gate.started && url.pathname === target && requestMethod === verb;
      if (shouldHold) gate.started = true;
      const response = await nativeFetch(input, init);
      if (shouldHold) {
        gate.responseStatus = response.status;
        gate.held = true;
        await new Promise(resolve => { gate.release = resolve; });
        gate.returned = true;
      }
      return response;
    };
  };
  const installResponseGate = async (endpoint, method) => evaluate(gateFetch, endpoint, method);
  const releaseResponse = async () => {
    await evaluate(() => { if (!window.__frameRaceGate?.release) throw new Error("No held response to release"); window.__frameRaceGate.release(); window.fetch = window.__frameRaceGate.nativeFetch; });
    await waitFor(() => window.__frameRaceGate?.returned === true, "delayed response to return to its original handler");
    await wait(350);
  };
  const signOutWhileHeld = async () => {
    if (await evaluate(() => Boolean(document.querySelector('[role="dialog"]')))) await escape();
    await click('[aria-label="Sign out"]');
    await waitFor(() => Boolean(document.querySelector(".signin-button")) && !document.querySelector('[aria-label="Sign out"]'), "guest identity after logout");
    const identity = await browserApi("/api/auth/me");
    assert.equal(identity.data.user, null, "The session really must be logged out before releasing the old response");
  };
  const assertGuestLibraryIsEmpty = async (label) => {
    assert.equal(await evaluate(() => Boolean(document.querySelector('[role="dialog"]'))), false, "A stale save must not reopen its old modal after sign-out");
    assert.equal(await evaluate(() => Boolean(document.querySelector(".watchlist-nav b"))), false, "No prior-account watchlist count may reappear");
    await open("club-open-compass");
    await waitFor(() => Boolean(document.querySelector('[data-testid="taste-profile"]')), "guest compass state after delayed response");
    const guest = await evaluate(() => ({
      counts: [...document.querySelectorAll('[data-testid="taste-profile"] strong')].map(node => Number(node.textContent)),
      cold: Boolean(document.querySelector('[data-testid="compass-cold-start"]')),
      hasPrivateShape: Boolean(document.querySelector(".compass-profile-shape")),
      graph: document.querySelector(".taste-compass-drawing")?.getAttribute("aria-label"),
      copy: document.querySelector(".compass-profile-copy")?.textContent,
    }));
    assert.deepEqual(guest.counts, [0, 0, 0], "Guest profile must have zero rated/logged films and explored languages");
    assert.equal(guest.cold, true, "A delayed watchlist save must not personalize the guest compass");
    assert.equal(guest.hasPrivateShape, false, "No prior-account genre-weight graph may reappear");
    assert.ok(!/Relative genre preferences|Private race fixture/i.test((guest.graph || "") + " " + (guest.copy || "")));
    await screenshot(label + "-guest-compass");
    await escape();
    await click(".watchlist-nav");
    await waitFor(() => Boolean(document.querySelector(".empty-state")), "empty guest watchlist");
    assert.equal(await evaluate(() => document.querySelectorAll(".movie-card").length), 0, "No prior-account saved title may leak into the guest shelf");
    assert.match(await evaluate(() => document.querySelector(".empty-state").textContent), /sign in/i);
    await screenshot(label + "-guest-watchlist");
    return guest;
  };

  await phase("A delayed diary PUT cannot restore the prior account's private state after sign-out", async () => {
    account = { name: "FRAME Library Race QA", email: "qa-race-" + runId + "@frame.example.test", password: "Frame local race QA " + runId + " only!" };
    const registered = await browserApi("/api/auth/register", "POST", account);
    assert.ok(registered.ok, "Local fake account creation failed: " + registered.status + " " + (registered.data?.error || ""));
    accountCreated = true;
    await loadHome();
    await waitFor(() => Boolean(document.querySelector('[aria-label="Sign out"]')), "signed-in fake local account");
    await click(".hero-info");
    await waitFor(() => Boolean(document.querySelector('[data-testid="log-movie"]')), "diary action on the known hero film");
    const title = await evaluate(() => document.querySelector(".detail-content h2").textContent.trim());
    await click('[data-testid="log-movie"]');
    await waitFor(() => Boolean(document.querySelector('[data-testid="diary-save"]')), "new diary form");
    await fill('form [name="rating"]', "5");
    await fill('form [name="note"]', "Private race fixture " + runId + ": Adventure is my favorite.");
    await fill('form [name="watchedAt"]', "2026-11-14");
    await installResponseGate("/api/diary", "PUT");
    await click('[data-testid="diary-save"]');
    await waitFor(() => window.__frameRaceGate?.held === true, "actual diary response held after the server write");
    const gate = await evaluate(() => ({ started: window.__frameRaceGate.started, held: window.__frameRaceGate.held, status: window.__frameRaceGate.responseStatus }));
    assert.equal(gate.status, 200);
    const stored = await browserApi("/api/diary");
    assert.ok(stored.data.entries.some(entry => entry.movie.title === title && entry.rating === 5), "The fixture must delay a real committed write, not a fake response");
    await signOutWhileHeld();
    await releaseResponse();
    const guest = await assertGuestLibraryIsEmpty("diary-race");
    return { title, gate, guest };
  });

  await phase("A delayed watchlist PUT cannot restore a saved title or guest taste profile after sign-out", async () => {
    const login = await browserApi("/api/auth/login", "POST", { email: account.email, password: account.password });
    assert.ok(login.ok, "The same fake local account must be able to sign back in");
    const diary = await browserApi("/api/diary");
    for (const entry of diary.data.entries) {
      const removed = await browserApi("/api/diary?id=" + encodeURIComponent(entry.movie.id), "DELETE");
      assert.ok(removed.ok);
    }
    await loadHome();
    await waitFor(() => Boolean(document.querySelector('[aria-label="Sign out"]')), "signed-in empty library before the watchlist race");
    await installResponseGate("/api/watchlist", "PUT");
    await click(".hero-actions .button-glass");
    await waitFor(() => window.__frameRaceGate?.held === true, "actual watchlist response held after the server write");
    const gate = await evaluate(() => ({ held: window.__frameRaceGate.held, status: window.__frameRaceGate.responseStatus }));
    assert.equal(gate.status, 200);
    const stored = await browserApi("/api/watchlist");
    assert.equal(stored.data.movies.length, 1, "The fixture must delay a real successful watchlist save");
    const title = stored.data.movies[0].title;
    await signOutWhileHeld();
    await releaseResponse();
    const guest = await assertGuestLibraryIsEmpty("watchlist-race");
    return { title, gate, guest };
  });

  await phase("A delayed guest bootstrap cannot overwrite a newer successful sign-in", async () => {
    const preload = await call("Page.addScriptToEvaluateOnNewDocument", { source: "(" + gateFetch.toString() + ")('/api/auth/me','GET')" });
    try {
      await loadHome();
      await waitFor(() => window.__frameRaceGate?.held === true, "guest bootstrap response held before sign-in");
      assert.equal(await evaluate(() => Boolean(document.querySelector(".signin-button"))), true);
      await click(".signin-button");
      await waitFor(() => Boolean(document.querySelector(".auth-content")), "real sign-in form while the guest bootstrap waits");
      await fill('.auth-content [name="email"]', account.email);
      await fill('.auth-content [name="password"]', account.password);
      await click(".auth-submit");
      await waitFor(() => Boolean(document.querySelector('[aria-label="Sign out"]')) && !document.querySelector(".auth-content"), "successful newer UI sign-in");
      const authenticated = await browserApi("/api/auth/me");
      assert.equal(authenticated.data.user.email, account.email);
      await releaseResponse();
      assert.equal(await evaluate(() => Boolean(document.querySelector(".signin-button"))), false, "The old guest response must not make the signed-in interface look logged out");
      assert.equal(await evaluate(() => Boolean(document.querySelector('[aria-label="Sign out"]'))), true);
      const avatar = await evaluate(() => document.querySelector(".top-avatar")?.getAttribute("aria-label"));
      assert.ok(avatar.includes(account.name));
      await screenshot("bootstrap-keeps-new-identity");
      return { account: account.email, avatar };
    } finally { await call("Page.removeScriptToEvaluateOnNewDocument", { identifier: preload.identifier }); }
  });

  await phase("An authenticated bootstrap invalidates a festival generated with guest history", async () => {
    const preload = await call("Page.addScriptToEvaluateOnNewDocument", { source: "(" + gateFetch.toString() + ")('/api/auth/me','GET')" });
    try {
      await loadHome();
      await waitFor(() => window.__frameRaceGate?.held === true, "authenticated bootstrap response held before restoring identity");
      assert.equal(await evaluate(() => Boolean(document.querySelector(".signin-button"))), true, "The plan starts before the restored account is known to the interface");
      await open("club-open-festival");
      await fill('[name="festivalTheme"]', "world-tour");
      await fill('[name="festivalBudget"]', 600);
      await click('[data-testid="festival-generate"]');
      await waitFor(() => Boolean(document.querySelector('[data-testid="festival-result"]')), "guest-history festival programme");
      const count = await evaluate(() => Number(document.querySelector('[data-testid="festival-result"]').dataset.filmCount));
      assert.equal(count, 3);
      await releaseResponse();
      await waitFor(() => Boolean(document.querySelector('[aria-label="Sign out"]')) && Boolean(document.querySelector('[data-testid="festival-stale-notice"]')), "identity-boundary festival invalidation");
      assert.equal(await evaluate(() => Boolean(document.querySelector('[data-testid="festival-result"]'))), false);
      assert.equal(await evaluate(() => Boolean(document.querySelector('[data-testid="festival-calendar"]'))), false, "A programme from the previous identity must not remain exportable");
      const notice = await evaluate(() => document.querySelector('[data-testid="festival-stale-notice"]').textContent);
      assert.match(notice, /changed|curate again/i);
      await screenshot("festival-history-invalidated");
      await waitFor(() => !document.querySelector('[data-testid="festival-generate"]').disabled, "current account history ready for a fresh festival");
      await click('[data-testid="festival-generate"]');
      await waitFor(() => Boolean(document.querySelector('[data-testid="festival-result"]')) && !document.querySelector('[data-testid="festival-stale-notice"]'), "new programme based on current account history");
      await escape();
      return { previousFilmCount: count, notice, regenerated: true };
    } finally { await call("Page.removeScriptToEvaluateOnNewDocument", { identifier: preload.identifier }); }
  });

  assert.deepEqual(result.runtimeErrors, [], "No runtime exceptions are allowed during delayed responses");
  assert.deepEqual(result.consoleErrors, [], "No console errors are allowed during identity changes");
  assert.deepEqual(result.localNetworkErrors, [], "Real underlying local requests must all finish successfully");
  result.passed = true;

} catch (error) {
  result.passed = false;
  result.failure = { message: error.message, stack: error.stack };
  console.error(error.message);
  if (call) {
    try { await writeFile(path.join(output, "library-race-failure.png"), Buffer.from((await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })).data, "base64")); result.screenshots.push("library-race-failure.png"); } catch {}
  }
  process.exitCode = 1;
} finally {
  if (accountCreated && browserApi) {
    try {
      // This is a unique fake local account created by this run, so its leftover
      // test entries can also be cleaned if an earlier UI assertion failed.
      await evaluate(() => { window.__frameRaceGate?.release?.(); if (window.__frameRaceGate?.nativeFetch) window.fetch = window.__frameRaceGate.nativeFetch; });
      await browserApi("/api/auth/login", "POST", { email: account.email, password: account.password });
      const me = await browserApi("/api/auth/me");
      if (me.data?.user?.email === account.email) {
        const diary = await browserApi("/api/diary");
        for (const entry of diary.data?.entries || []) {
          const id = entry.movie?.id || entry.movieId;
          if (id) await browserApi(`/api/diary?id=${encodeURIComponent(id)}`, "DELETE");
        }
        const watchlist = await browserApi("/api/watchlist");
        for (const movie of watchlist.data?.movies || []) await browserApi("/api/watchlist?id=" + encodeURIComponent(movie.id), "DELETE");
        const loggedOut = await browserApi("/api/auth/logout", "POST");
        result.localAccountLoggedOut = loggedOut.ok;
      }
    } catch (error) { result.cleanupError = error.message; }
  }
  result.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, "library-race-qa.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (call) await call("Browser.close").catch(() => {});
  ws?.close();
  browser.kill();
}

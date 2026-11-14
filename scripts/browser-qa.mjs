import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'outputs');
await mkdir(output, { recursive: true });
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9228', `--user-data-dir=${path.join(root, '.sites-runtime', 'qa-browser')}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let ws;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let pages;
  for (let i = 0; i < 50; i++) { try { pages = await (await fetch('http://127.0.0.1:9228/json/list')).json(); if (pages.length) break; } catch {} await wait(200); }
  if (!pages?.length) throw new Error('Chrome did not start');
  ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  const pending = new Map(); let nextId = 1; const errors = [];
  ws.addEventListener('message', event => { const message = JSON.parse(event.data); if (message.id) { const item = pending.get(message.id); if (item) { pending.delete(message.id); message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result); } } if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + message.params.exceptionDetails.exception?.description); });
  function call(method, params = {}) { return new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }); }
  async function evaluate(expression) { const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; }
  await call('Page.enable'); await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  for (let i = 0; i < 90; i++) { if (await evaluate('Boolean(document.querySelector(".movie-card"))')) break; await wait(500); }
  await wait(8500);
  const initial = await evaluate('({title:document.title,h1:document.querySelector("h1")?.textContent,cards:document.querySelectorAll(".movie-card").length,images:Array.from(document.images).map(i=>({src:i.src,loaded:i.complete&&i.naturalWidth>0})),overflow:document.documentElement.scrollWidth>innerWidth,status:document.querySelector(".data-status")?.textContent})');
  await writeFile(path.join(output, 'desktop.png'), Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  // Exercise the real dialogs and genre controls in the hydrated application.
  await evaluate('document.querySelector(".poster-link").click()'); await wait(1200);
  const details = await evaluate('({dialog:document.querySelector("[role=dialog]")?.getAttribute("aria-label"),text:document.querySelector(".detail-content")?.textContent})');
  await writeFile(path.join(output, 'details.png'), Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await evaluate('document.querySelector(".modal-close").click(); document.querySelector(".signin-button")?.click()'); await wait(300);
  const auth = await evaluate('({dialog:document.querySelector("[role=dialog]")?.getAttribute("aria-label"),fields:document.querySelectorAll(".auth-content input").length})');
  await writeFile(path.join(output, 'auth.png'), Buffer.from((await call('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await evaluate('document.querySelector(".modal-close")?.click();document.querySelector(".music-fab").click()'); await wait(300);
  const music = await evaluate('Boolean(document.querySelector(".music-panel"))');
  await evaluate('document.querySelector(".music-panel .icon-btn").click()');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate('window.scrollTo(0,0)'); await wait(500);
  const mobile = await evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth,navHidden:getComputedStyle(document.querySelector(".sidebar")).transform})');
  await writeFile(path.join(output, 'mobile.png'), Buffer.from((await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64'));
  const result = { initial, details, auth, music, mobile, errors };
  await writeFile(path.join(output, 'browser-qa.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (initial.overflow || mobile.overflow || errors.length || !details.dialog || !auth.dialog || !music) process.exitCode = 1;
  await call('Browser.close').catch(() => {});
} finally { ws?.close(); browser.kill(); }

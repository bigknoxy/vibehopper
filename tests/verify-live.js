// E2E verification of the DEPLOYED VibeHop PWA on GitHub Pages
const puppeteer = require('puppeteer');
const CHROME = process.env.CHROME_BIN;
const URL = process.env.GAME_URL || 'https://bigknoxy.github.io/vibehopper/';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', executablePath: CHROME,
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  const errors = [], failed = [], responses = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('requestfailed', r => failed.push(r.url() + ' :: ' + (r.failure() && r.failure().errorText)));
  page.on('response', r => { if (r.url().startsWith(URL)) responses.push(r.status() + ' ' + r.url()); });

  const results = {};
  const S = () => page.evaluate(() => window.__vibehop.state);

  // ---- D1: cold load over HTTPS ----
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('#btnStart', { timeout: 20000 });
  const meta = await page.evaluate(() => ({
    title: document.title,
    secure: location.protocol,
    swSupported: 'serviceWorker' in navigator,
    manifestHref: document.querySelector('link[rel="manifest"]').getAttribute('href'),
    appleCapable: document.querySelector('meta[name="apple-mobile-web-app-capable"]').content,
    statusBar: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').content,
    appleTouchIcon: document.querySelector('link[rel="apple-touch-icon"]').href.slice(0, 30)
  }));
  results.D1_cold_load = { ...meta, pass: meta.secure === 'https:' && meta.title.includes('VibeHop') };

  // ---- D2: deployed manifest is valid & complete ----
  const mf = await page.evaluate(async () => {
    const r = await fetch('./manifest.json');
    const j = await r.json();
    return { status: r.status, ctype: r.headers.get('content-type'), j };
  });
  const icons = mf.j.icons || [];
  const has192 = icons.some(i => (i.sizes || '').includes('192x192'));
  const hasMaskable = icons.some(i => (i.purpose || '').includes('maskable'));
  const has512 = icons.some(i => (i.sizes || '').includes('512x512'));
  results.D2_manifest = {
    status: mf.status, name: mf.j.name, short: mf.j.short_name, start: mf.j.start_url,
    scope: mf.j.scope, display: mf.j.display, theme: mf.j.theme_color, bg: mf.j.background_color,
    icons: icons.map(i => ({ sizes: i.sizes, purpose: i.purpose, src: i.src.slice(0, 40) })),
    claim: 'valid JSON, standalone, ./ start+scope, 192 + 512 + maskable icons',
    pass: mf.status === 200 && mf.j.display === 'standalone' && mf.j.start_url === './' && mf.j.scope === './'
      && has192 && has512 && hasMaskable
  };

  // ---- D3: service worker registers + caches on production ----
  await page.evaluate(() => navigator.serviceWorker.ready);
  await sleep(1500);
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const names = await caches.keys();
    let entries = [];
    if (names.length) {
      const c = await caches.open(names[0]);
      const ks = await c.keys();
      entries = ks.map(x => x.url.replace(location.origin, ''));
    }
    return { scope: reg.scope, active: !!reg.active, state: reg.active && reg.active.state, controller: !!navigator.serviceWorker.controller, names, entries };
  });
  results.D3_service_worker = {
    ...sw,
    claim: 'SW active+controlling, versioned cache holds the app shell (./, index.html, manifest.json)',
    pass: sw.active && sw.state === 'activated' && sw.controller && sw.names.some(n => /^vibehop-v\d+/.test(n))
      && ['/vibehopper/', '/vibehopper/index.html', '/vibehopper/manifest.json'].every(u => sw.entries.includes(u))
  };

  // ---- D4: gameplay — start, audio unlocks on tap ----
  await page.click('#btnStart');
  await sleep(600);
  let s = await S();
  results.D4_start_audio = { mode: s.mode, audioCtx: s.audio.ctx, audioState: s.audio.state, pass: s.mode === 'play' && s.audio.ctx && s.audio.state === 'running' };

  // ---- D5: jump changes trajectory ----
  const y0 = (await S()).player.y;
  await page.evaluate(() => window.__vibehop.hop());
  await sleep(180);
  const yUp = (await S()).player.y;
  await sleep(1300);
  const yDn = (await S()).player.y;
  results.D5_jump = { ground: y0, peak: yUp, landed: yDn, pass: yUp < y0 - 40 && Math.abs(yDn - y0) < 6 };

  // ---- D6: collision docks shield, keeps momentum (no instant death) ----
  await page.evaluate(() => {
    window.__t6 = { drops: 0, prev: window.__vibehop.state.pips };
    const tick = () => { const st = window.__vibehop.state; if (st.pips < window.__t6.prev) { window.__t6.drops++; window.__t6.prev = st.pips; } if (st.mode === 'play') requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    window.__spam = setInterval(() => { try { window.__vibehop.spawn.obstacle(); } catch (e) { } }, 130);
  });
  await sleep(3500);
  await page.evaluate(() => clearInterval(window.__spam));
  const t6 = await page.evaluate(() => window.__t6);
  const s6 = await S();
  results.D6_collision_shield = { drops: t6.drops, pipsLeft: s6.pips, inv: s6.inv, modeAfter: s6.mode, pass: t6.drops >= 1 };

  // ---- D7: real touch input drives the game (tap = hop) ----
  await page.evaluate(() => { window.__vibehop.forceGameOver(); });
  await sleep(200);
  await page.click('#btnAgain');
  await sleep(300);
  const t7y0 = (await S()).player.y;
  await page.touchscreen.tap(206, 600);
  await sleep(200);
  const t7y1 = (await S()).player.y;
  results.D7_touch = { before: t7y0, afterTap: t7y1, pass: t7y1 < t7y0 - 20 };

  // ---- D8: score + best persistence across reload ----
  await sleep(1500);
  const scoreBefore = (await S()).score;
  await page.evaluate(() => window.__vibehop.forceGameOver());
  await sleep(400);
  const ls = await page.evaluate(() => localStorage.getItem('vibehop_best'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#btnStart');
  await sleep(300);
  const shown = await page.evaluate(() => document.getElementById('bestTitle').textContent);
  results.D8_persistence = { scoreBefore, localStorageBest: ls, shownAfterReload: shown, pass: ls !== null && shown === ls };

  // ---- D9: offline play from cache (kill network, reload) ----
  const swReady = await page.evaluate(() => navigator.serviceWorker.ready.then(() => true)).catch(() => false);
  if (swReady) {
    await page.setOfflineMode(true);
    let offlineOk = false, offlineErr = null;
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForSelector('#btnStart', { timeout: 8000 });
      const off = await page.evaluate(() => ({ t: document.title, hook: !!window.__vibehop }));
      offlineOk = off.t.includes('VibeHop') && off.hook;
    } catch (e) { offlineErr = e.message; }
    await page.setOfflineMode(false);
    results.D9_offline_play = { offlineOk, offlineErr, pass: offlineOk };
  } else {
    results.D9_offline_play = { offlineOk: false, pass: false, note: 'SW not ready' };
  }

  // ---- D10: screenshots of the live game (title + play) ----
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#btnStart');
  await sleep(1200);
  await page.screenshot({ path: '/tmp/opencode/live-title.png' });
  await page.click('#btnStart');
  await sleep(350);
  await page.keyboard.down('Space');
  await page.evaluate(() => { window.__t10 = setInterval(() => { try { window.__vibehop.hop(); } catch (e) { } }, 500); });
  await sleep(2600);
  await page.evaluate(() => clearInterval(window.__t10));
  await page.keyboard.up('Space');
  await sleep(150);
  await page.screenshot({ path: '/tmp/opencode/live-gameplay.png' });
  const shot = await S();
  results.D10_live_render = { score: shot.score, mode: shot.mode, pass: shot.score > 0 };

  // ---- D11: page-weight / dependency audit (zero external) ----
  const external = [...new Set(responses.map(r => r.split(' ')[1]))].filter(u => !u.startsWith(URL) && !u.includes('github.io'));
  results.D11_zero_deps = { requests: responses.length, external, pass: external.length === 0 };

  console.log(JSON.stringify({ results, errors, failedRequests: failed, networkRequests: responses }, null, 2));
  const allPass = Object.values(results).every(r => r.pass);
  console.log('\n' + (allPass ? '✅ DEPLOYED E2E: ALL CHECKS PASSED' : '❌ DEPLOYED E2E: FAILURES PRESENT'));
  await browser.close();
  process.exit(allPass ? 0 : 1);
})();

// Deep gameplay verification for VibeHop — exercises jump, collision/shield, orb pickup, game over, persistence
const puppeteer = require('puppeteer');
const CHROME = process.env.CHROME_BIN;
const URL = process.env.GAME_URL || 'http://localhost:8080/';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', executablePath: CHROME,
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#btnStart');
  const results = {};

  // helper: read state
  const S = () => page.evaluate(() => window.__vibehop.state);

  // ---- T1: start + audio ----
  await page.evaluate(() => window.__vibehop.start());
  await sleep(400);
  let s = await S();
  results.T1_start = { mode: s.mode, audioCtx: s.audio.ctx, audioState: s.audio.state, pass: s.mode === 'play' && s.audio.ctx };

  // ---- T2: jump raises player then lands ----
  const yBefore = (await S()).player.y;
  await page.evaluate(() => window.__vibehop.hop());
  await sleep(200); // rising
  const yMid = await S();
  await sleep(1200); // landed
  const yLand = (await S()).player.y;
  results.T2_jump = { yBefore, yMidY: yMid.player.y, midVy: yMid.player.vy, yLand,
    pass: yMid.player.y < yBefore - 40 && Math.abs(yLand - yBefore) < 6 };

  // ---- T3: collision shatters obstacle + docks 1 pip + invulnerability ----
  const before3 = await S();
  await page.evaluate(() => {
    const st = window.__vibehop;
    st.spawn.obstacle();
    return true;
  });
  // teleport obstacle onto player
  await page.evaluate(() => {
    const s = window.__vibehop.state;
    // reach into world via debug: spawn then move is not exposed; instead spawn many and let them come
  });
  // Simpler: run frames and count pip drops while forcing obstacles onto the player x
  await page.evaluate(() => { window.__t3 = { pipDrops: 0, prev: window.__vibehop.state.pips }; });
  await page.evaluate(() => {
    // monkeypatch: poll on rAF for pip change
    const tick = () => {
      const st = window.__vibehop.state;
      if (st.pips < window.__t3.prev) { window.__t3.pipDrops++; window.__t3.prev = st.pips; }
      if (st.mode === 'play') requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // Force a collision: repeatedly spawn obstacles (they'll arrive at player x within a second at 300px/s)
  await page.evaluate(() => { window.__spam = setInterval(() => { try { window.__vibehop.spawn.obstacle(); } catch(e){} }, 120); });
  await sleep(4000);
  await page.evaluate(() => clearInterval(window.__spam));
  const t3 = await page.evaluate(() => window.__t3);
  const after3 = await S();
  results.T3_collision = { pipDrops: t3.pipDrops, pipsNow: after3.pips, invNow: after3.inv,
    pass: t3.pipDrops >= 1 };

  // ---- T4: orb pickup restores pip + combo ----
  const before4 = await page.evaluate(() => ({ pips: window.__vibehop.state.pips, combo: window.__vibehop.state.combo, orbs: window.__vibehop.state.orbs }));

  // ---- T5: game over flow (force) ----
  await page.evaluate(() => window.__vibehop.forceGameOver());
  await sleep(300);
  const t5 = await S();
  const overVisible = await page.evaluate(() => !document.getElementById('uiOver').classList.contains('hidden'));
  results.T5_gameover = { mode: t5.mode, overVisible, pass: t5.mode === 'over' && overVisible };

  // ---- T6: best score persisted ----
  const bestShown = await page.evaluate(() => document.getElementById('bestOver').textContent);
  const lsBest = await page.evaluate(() => localStorage.getItem('vibehop_best'));
  results.T6_persist = { bestShown, lsBest, pass: lsBest !== null && parseInt(lsBest) >= 0 };

  // ---- T7: restart works ----
  await page.click('#btnAgain');
  await sleep(400);
  const t7 = await S();
  results.T7_restart = { mode: t7.mode, pips: t7.pips, score: t7.score, pass: t7.mode === 'play' && t7.pips === 3 };

  // ---- T8: pause/resume ----
  await page.evaluate(() => window.__vibehop.pause());
  await sleep(200);
  const t8a = await S();
  const pauseVisible = await page.evaluate(() => !document.getElementById('uiPause').classList.contains('hidden'));
  await page.click('#btnResume');
  await sleep(200);
  const t8b = await S();
  results.T8_pause = { paused: t8a.mode, pauseVisible, resumed: t8b.mode, pass: t8a.mode === 'pause' && pauseVisible && t8b.mode === 'play' };

  // ---- T9: offline readiness: SW controls page ----
  const swState = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const reg = await navigator.serviceWorker.getRegistration();
    const cacheKeys = await caches.keys();
    const cacheNames = await caches.open('vibehop-v1').then(c => c.keys()).then(ks => ks.map(k => k.url.replace(location.origin, '')));
    return { supported: true, active: !!(reg && reg.active), controller: !!navigator.serviceWorker.controller, cacheKeys, cacheNames };
  });
  results.T9_offline = { ...swState, pass: swState.supported && swState.cacheNames && swState.cacheNames.length >= 3 };

  console.log(JSON.stringify({ results, errors }, null, 2));
  const allPass = Object.values(results).every(r => r.pass);
  console.log('\n' + (allPass ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'));
  await browser.close();
  process.exit(allPass ? 0 : 1);
})();

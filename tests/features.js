// TDD — tests written BEFORE the features exist. Run against the current build: these MUST FAIL.
// After implementing, the same suite must pass unchanged.
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
  // stub navigator.share to capture the payload instead of opening the OS sheet
  await page.evaluateOnNewDocument(() => {
    window.__shared = null;
    try {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data) => { window.__shared = data; }
      });
    } catch (e) { }
  });
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('#btnStart');
  await sleep(600);

  const results = {};
  const S = () => page.evaluate(() => window.__vibehop.state);

  // ---------------------------------------------------------------- F1: mute
  const hasMute = await page.evaluate(() => !!document.getElementById('btnMute'));
  let muteWorks = false, mutePersists = false, muteState = null;
  if (hasMute) {
    await page.click('#btnStart');
    await sleep(400);
    await page.click('#btnMute');
    await sleep(250);
    muteState = await page.evaluate(() => ({
      ls: localStorage.getItem('vibehop_mute'),
      muted: window.__vibehop.state.audio.muted
    }));
    muteWorks = muteState.ls === '1' && muteState.muted === true;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#btnStart');
    await sleep(300);
    const after = await page.evaluate(() => {
      const b = document.getElementById('btnMute');
      return {
        muted: window.__vibehop.state.audio.muted,
        label: b.getAttribute('aria-label') || '',
        pressed: b.getAttribute('aria-pressed'),
        soundOnClass: b.classList.contains('sound-on')
      };
    });
    // the icon is an inline SVG now: assert the accessible contract, not an emoji
    mutePersists = after.muted === true && after.pressed === 'true' && after.soundOnClass === false
                   && /off|muted/i.test(after.label);
  }
  results.F1_mute_button = { hasMute, muteState, muteWorks, mutePersists, pass: hasMute && muteWorks && mutePersists };

  // ------------------------------------------------------------ F2: pause UI
  const pauseUi = await page.evaluate(() => {
    const b = document.getElementById('btnPause');
    return b ? { exists: true, display: getComputedStyle(b).display } : { exists: false };
  });
  let pauseWorks = false;
  if (pauseUi.exists) {
    await page.click('#btnStart');
    await sleep(400);
    const displayedDuringPlay = await page.evaluate(() => {
      const b = document.getElementById('btnPause');
      const cs = getComputedStyle(b);
      const r = b.getBoundingClientRect();
      return { display: cs.display, w: r.width, h: r.height, visible: cs.visibility !== 'hidden' && r.width > 0 };
    });
    pauseUi.duringPlay = displayedDuringPlay;
    await page.click('#btnPause');
    await sleep(250);
    const st = await S();
    pauseWorks = st.mode === 'pause';
    pauseUi.touchTarget = displayedDuringPlay.w >= 44 && displayedDuringPlay.h >= 44;
    await page.click('#btnResume');
    await sleep(200);
  }
  results.F2_pause_button = { ...pauseUi, pauseWorks, pass: pauseUi.exists && pauseWorks && pauseUi.touchTarget === true };

  // ------------------------------------------------------------ F3: share button
  const hasShare = await page.evaluate(() => !!document.getElementById('btnShare'));
  let sharePayload = null;
  if (hasShare) {
    await page.evaluate(() => window.__vibehop.forceGameOver());
    await sleep(300);
    await page.click('#btnShare').catch(() => { });
    await sleep(400);
    sharePayload = await page.evaluate(() => window.__shared);
  }
  results.F3_share_button = {
    hasShare, sharePayload,
    pass: hasShare && !!sharePayload && typeof sharePayload.url === 'string' && sharePayload.url.includes('vibehopper')
  };

  // ------------------------------------------------------------ F4: OG / social meta
  const og = await page.evaluate(() => ({
    ogTitle: (document.querySelector('meta[property="og:title"]') || {}).content || null,
    ogDesc: (document.querySelector('meta[property="og:description"]') || {}).content || null,
    ogImage: (document.querySelector('meta[property="og:image"]') || {}).content || null,
    ogUrl: (document.querySelector('meta[property="og:url"]') || {}).content || null,
    twitterCard: (document.querySelector('meta[name="twitter:card"]') || {}).content || null,
    themeColor: (document.querySelector('meta[name="theme-color"]') || {}).content || null
  }));
  results.F4_og_meta = {
    ...og,
    pass: !!og.ogTitle && !!og.ogDesc && !!og.ogImage && og.ogImage.startsWith('https://') && og.twitterCard === 'summary_large_image'
  };

  // ------------------------------------------------------------ F5: accessibility labels on canvas/buttons
  const a11y = await page.evaluate(() => {
    const c = document.getElementById('game');
    const ids = ['btnStart', 'btnPause', 'btnMute', 'btnShare', 'btnAgain', 'btnHome'];
    const missing = ids.filter(id => {
      const el = document.getElementById(id);
      if (!el) return true; // treated separately by other tests
      return !(el.getAttribute('aria-label') || el.textContent.trim());
    });
    return { canvasRole: c.getAttribute('role'), canvasLabel: c.getAttribute('aria-label'), missing };
  });
  results.F5_a11y = { ...a11y, pass: a11y.canvasRole === 'img' && !!a11y.canvasLabel };

  // ------------------------------------------------- F6: no stale input carry-over
  // tap the title overlay background (not the button), then start the game via the button:
  // the player must NOT immediately bunny-hop from a stuck held-input state.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#btnStart');
  await sleep(500);
  await page.mouse.click(206, 150);       // overlay background area
  await sleep(120);
  await page.click('#btnStart');
  await sleep(120);
  const stale = await page.evaluate(() => window.__vibehop.state);
  await sleep(600);
  const stale2 = await page.evaluate(() => ({
    held: window.__vibehop.state.player.onGround,
    vy: window.__vibehop.state.player.vy
  }));
  results.F6_no_stale_input = {
    vyRightAfterStart: stale.player.vy, onGroundAfter: stale2.held,
    pass: stale.player.vy === 0 && stale2.held === true
  };

  // --------------------------------------------------- F7: best score only ratchets up
  // seed a high best, let the game boot with it, then die with a low score:
  // the stored best must NOT be downgraded to the new (lower) score.
  await page.evaluate(() => localStorage.setItem('vibehop_best', '9999'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#btnStart');
  await sleep(400);
  await page.click('#btnStart');
  await sleep(300);
  const ratchet = await page.evaluate(async () => {
    window.__vibehop.forceGameOver();
    await new Promise(r => setTimeout(r, 250));
    return { ls: localStorage.getItem('vibehop_best'), shown: document.getElementById('bestOver').textContent };
  });
  results.F7_best_ratchet = { ...ratchet, pass: ratchet.ls === '9999' && ratchet.shown === '9999' };

  console.log(JSON.stringify({ feature: 'tdd-features', results, errors }, null, 2));
  const allPass = Object.values(results).every(r => r.pass);
  console.log('\n' + (allPass ? '✅ FEATURES: ALL PASS' : '❌ FEATURES: FAILING (expected before implementation)'));
  await browser.close();
  process.exit(allPass ? 0 : 1);
})();

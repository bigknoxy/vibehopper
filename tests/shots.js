// Capture README assets: portrait title + gameplay screenshots, optimised for GitHub.
// (The 1200x630 social card is composed separately by compose-og.js.)
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const CHROME = process.env.CHROME_BIN;
const URL = process.env.GAME_URL || 'https://bigknoxy.github.io/vibehopper/';
const OUT = process.env.OUT_DIR || path.join(__dirname, '..', 'docs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Ship-ready assets: 640px wide, 256 colours — a phone screenshot at 2x is ~800KB raw,
// this lands the README hero pair under ~700KB total with no visible loss at display size.
const HAS_CONVERT = (() => { try { execSync('command -v convert', { stdio: 'ignore' }); return true; } catch { return false; } })();
const optimize = (file) => {
  if (!HAS_CONVERT) { console.log('  (ImageMagick not found — keeping the raw capture for ' + path.basename(file) + ')'); return; }
  const before = fs.statSync(file).size;
  execSync('convert ' + JSON.stringify(file) + ' -strip -resize 640x -colors 256 -dither FloydSteinberg -define png:compression-level=9 ' + JSON.stringify(file));
  console.log('  optimised', path.basename(file), before, '->', fs.statSync(file).size, 'bytes');
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: 'new', executablePath: CHROME,
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars']
  });

  const shoot = async (name, viewport, prep) => {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    // hero shots should look like a real session, not a first launch
    await page.evaluateOnNewDocument(() => {
      try {
        localStorage.setItem('vibehop_best', '12480');
        localStorage.setItem('vibehop_dash_tut', 'done');
      } catch (e) {}
    });
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#btnStart');
    await sleep(900);
    if (prep) await prep(page);
    // wait for a ring/orb to be on screen AND for the damage flash to clear, so the
    // capture isn't tinted magenta
    for (let i = 0; i < 40; i++) {
      const c = await page.evaluate(() => { const s = window.__vibehop; if (!s || s.state.mode !== 'play') return null; const st = s.state; return { orbs: st.counts.orbs, rings: st.counts.rings, flash: st.flash }; });
      if (c && (c.orbs > 0 || c.rings > 0) && c.flash < 0.02) break;
      await sleep(160);
    }
    await page.evaluate(() => { const s = window.__vibehop; if (s && s.state.mode === 'play') s.probe.setPips(3); });
    // mid-jump reads far more dynamic than standing still
    await page.keyboard.press('Space');
    await sleep(200);
    await page.evaluate(() => { const s = window.__vibehop; if (s && s.state.mode === 'play') s.probe.setPips(3); });
    await sleep(40);
    const file = path.join(OUT, name);
    await page.screenshot({ path: file });
    optimize(file);
    console.log('saved', file);
    await page.close();
  };

  const play = (ms, tapsEvery) => async (page) => {
    await page.click('#btnStart');
    await sleep(300);
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      await page.keyboard.press('Space');
      await sleep(tapsEvery || 700);
    }
  };

  // portrait title (README hero, phone-accurate)
  await shoot('title.png', { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // portrait gameplay after ~14s (obstacles, rings, orbs, score, pips spent)
  await shoot('gameplay.png', { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    play(14000, 650));
  await browser.close();
})();

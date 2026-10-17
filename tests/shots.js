// Capture README/social assets: portrait title + gameplay, landscape hero + og (1200x630).
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_BIN;
const URL = process.env.GAME_URL || 'https://bigknoxy.github.io/vibehopper/';
const OUT = process.env.OUT_DIR || path.join(__dirname, '..', 'docs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: 'new', executablePath: CHROME,
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars']
  });

  const shoot = async (name, viewport, prep) => {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#btnStart');
    await sleep(900);
    if (prep) await prep(page);
    await sleep(150);
    const file = path.join(OUT, name);
    await page.screenshot({ path: file });
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
  // landscape 1200x630 candidates for OG / repo social preview
  await shoot('og-title.png', { width: 1200, height: 630, deviceScaleFactor: 1 });
  await shoot('og-play.png', { width: 1200, height: 630, deviceScaleFactor: 1 }, play(12000, 600));
  await browser.close();
})();

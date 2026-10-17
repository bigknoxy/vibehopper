// Local headless smoke test for VibeHop — checks render, gameplay state, no JS errors
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  const errors = [];
  const logs = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { const t = m.text(); logs.push(m.type() + ': ' + t); if (m.type() === 'error') errors.push('CONSOLE: ' + t); });
  page.on('requestfailed', r => errors.push('REQFAIL: ' + r.url() + ' ' + (r.failure() && r.failure().errorText)));

  await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#btnStart', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));

  const canvasInfo = await page.evaluate(() => {
    const c = document.getElementById('game');
    return { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight };
  });

  // Canvas must not be blank
  const nonBlank = await page.evaluate(() => {
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4000) seen.add(d[i] + ',' + d[i+1] + ',' + d[i+2]);
    return { distinctColors: seen.size };
  });

  // Start game via button
  await page.click('#btnStart');
  await new Promise(r => setTimeout(r, 1200));

  const state1 = await page.evaluate(() => ({
    titleHidden: document.getElementById('uiTitle').classList.contains('hidden'),
    score: document.querySelector('#uiOver') ? 1 : 0
  }));

  // play a bit: tap periodically to hop
  for (let i = 0; i < 60; i++) {
    await page.keyboard.down('Space');
    await new Promise(r => setTimeout(r, 40));
    await page.keyboard.up('Space');
    await new Promise(r => setTimeout(r, 300));
  }

  const alive = await page.evaluate(() => !document.getElementById('uiOver').classList.contains('hidden') === false);

  // Touch test
  await page.touchscreen.tap(206, 500);
  await new Promise(r => setTimeout(r, 500));

  // PWA checks
  const pwa = await page.evaluate(async () => {
    const mf = await fetch('./manifest.json').then(r => r.json());
    const sw = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().then(r => !!r) : 'unsupported';
    return {
      manifestName: mf.name, shortName: mf.short_name, display: mf.display,
      themeColor: mf.theme_color, iconPurpose: mf.icons[0].purpose, swRegistered: sw,
      standaloneMeta: !!document.querySelector('meta[name="apple-mobile-web-app-capable"]'),
      appleIcon: !!document.querySelector('link[rel="apple-touch-icon"]'),
      manifestLink: document.querySelector('link[rel="manifest"]').getAttribute('href')
    };
  });

  await page.screenshot({ path: '/tmp/opencode/local-gameplay.png' });

  console.log(JSON.stringify({ canvasInfo, nonBlank, state1, pwa, errors, logCount: logs.length }, null, 2));
  await browser.close();
})();

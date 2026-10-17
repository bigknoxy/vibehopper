// Cropped player close-ups to inspect sprite rendering
const puppeteer = require('puppeteer');
const CHROME = process.env.CHROME_BIN;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', executablePath: CHROME,
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.goto(process.env.GAME_URL || 'http://localhost:8080/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#btnStart');
  await page.click('#btnStart');
  await sleep(500);

  // airborne jump — peak
  await page.evaluate(() => window.__vibehop.hop());
  await sleep(320);
  let st = await page.evaluate(() => window.__vibehop.state);
  let box = { x: Math.max(0, st.player.x - 90), y: Math.max(0, st.player.y - 90), width: 180, height: 180 };
  await page.screenshot({ path: '/tmp/opencode/crop-air.png', clip: box });
  const air = { player: st.player, pips: st.pips };

  // grounded pose
  await sleep(1100);
  st = await page.evaluate(() => window.__vibehop.state);
  box = { x: Math.max(0, st.player.x - 90), y: Math.max(0, st.player.y - 90), width: 180, height: 180 };
  await page.screenshot({ path: '/tmp/opencode/crop-ground.png', clip: box });
  const ground = { player: st.player, pips: st.pips };

  // invulnerable amber state: force collisions
  await page.evaluate(() => {
    window.__spam = setInterval(() => { try { window.__vibehop.spawn.obstacle(); } catch (e) { } }, 140);
  });
  await sleep(2200);
  await page.evaluate(() => clearInterval(window.__spam));
  st = await page.evaluate(() => window.__vibehop.state);
  box = { x: Math.max(0, st.player.x - 90), y: Math.max(0, st.player.y - 90), width: 180, height: 180 };
  await page.screenshot({ path: '/tmp/opencode/crop-inv.png', clip: box });
  const inv = { player: st.player, pips: st.pips, inv: st.inv, mode: st.mode };
  await page.screenshot({ path: '/tmp/opencode/full-inv.png' });

  console.log(JSON.stringify({ air, ground, inv }, null, 2));
  await browser.close();
})();

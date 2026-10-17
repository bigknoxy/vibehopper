// Compose the branded social card (docs/og.png, 1200x630) from a real gameplay frame:
// phone mock on the left, wordmark + tagline + URL on the right, scrim so text always reads.
// Run: NODE_PATH=... CHROME_BIN=... node compose-og.js
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
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#btnStart');
  await sleep(800);
  await page.click('#btnStart');
  await sleep(300);
  const t0 = Date.now();
  while (Date.now() - t0 < 13000) { await page.keyboard.press('Space'); await sleep(650); }
  const shot = await page.screenshot({ encoding: 'base64' });

  const composed = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const W = 1200, H = 630, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');

    // background: the frame itself, blurred by scaling it up huge and dimming it
    x.fillStyle = '#0d0e1e'; x.fillRect(0, 0, W, H);
    x.globalAlpha = 0.5;
    x.drawImage(img, 0, 0, img.width, img.height, 0, -H * 0.35, H * 1.15, H * 2.0);
    x.globalAlpha = 1;
    // left-to-right scrim so the right half is always readable
    const sc = x.createLinearGradient(0, 0, W, 0);
    sc.addColorStop(0, 'rgba(13,14,30,0.55)');
    sc.addColorStop(0.42, 'rgba(13,14,30,0.88)');
    sc.addColorStop(1, 'rgba(13,14,30,0.97)');
    x.fillStyle = sc; x.fillRect(0, 0, W, H);
    // bottom vignette
    const vg = x.createLinearGradient(0, H * 0.55, 0, H);
    vg.addColorStop(0, 'rgba(5,6,14,0)');
    vg.addColorStop(1, 'rgba(5,6,14,0.75)');
    x.fillStyle = vg; x.fillRect(0, H * 0.55, W, H * 0.45);

    // phone mock, rounded, mint rim + glow
    const px = 70, py = 34, pw = 312, ph = 562, r = 26;
    const rr = (cx, cy, w, h, rad) => {
      x.beginPath();
      x.moveTo(cx + rad, cy);
      x.arcTo(cx + w, cy, cx + w, cy + h, rad);
      x.arcTo(cx + w, cy + h, cx, cy + h, rad);
      x.arcTo(cx, cy + h, cx, cy, rad);
      x.arcTo(cx, cy, cx + w, cy, rad);
      x.closePath();
    };
    x.save();
    x.shadowColor = 'rgba(78,240,208,0.35)'; x.shadowBlur = 40;
    rr(px, py, pw, ph, r); x.fillStyle = '#0d0e1e'; x.fill();
    x.restore();
    x.save();
    rr(px, py, pw, ph, r); x.clip();
    // crop the portrait frame to the mock's aspect (fill it edge to edge)
    const targetAR = pw / ph, srcAR = img.width / img.height;
    let sw = img.width, sh = img.height, sx = 0, sy = 0;
    if (srcAR > targetAR) { sw = img.height * targetAR; sx = (img.width - sw) / 2; }
    else { sh = img.width / targetAR; sy = (img.height - sh) * 0.42; }
    x.drawImage(img, sx, sy, sw, sh, px, py, pw, ph);
    x.restore();
    rr(px + 0.5, py + 0.5, pw - 1, ph - 1, r);
    x.strokeStyle = 'rgba(78,240,208,0.55)'; x.lineWidth = 1.6; x.stroke();

    // wordmark with the in-game gradient
    const gx = x.createLinearGradient(430, 0, 1130, 0);
    gx.addColorStop(0, '#4ef0d0'); gx.addColorStop(0.55, '#eafff8'); gx.addColorStop(1, '#ff5376');
    x.fillStyle = gx;
    x.font = '900 104px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
    x.textBaseline = 'alphabetic';
    x.fillText('VibeHop', 424, 300);

    x.fillStyle = '#9aa4d2';
    x.font = '700 27px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
    let cx = 428;
    for (const ch of 'TAP. HOP. VIBE.') { x.fillText(ch, cx, 356); cx += x.measureText(ch).width + 7; }

    x.fillStyle = '#4ef0d0';
    x.font = '800 24px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
    x.fillText('bigknoxy.github.io/vibehopper', 428, 452);

    x.fillStyle = '#ffd166';
    x.font = '700 22px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
    x.fillText('zero-dependency PWA · installable · plays offline', 428, 492);

    return c.toDataURL('image/png');
  }, shot);

  const buf = Buffer.from(composed.split(',')[1], 'base64');
  const file = path.join(OUT, 'og.png');
  fs.writeFileSync(file, buf);
  console.log('saved', file, buf.length, 'bytes');
  await browser.close();
})();

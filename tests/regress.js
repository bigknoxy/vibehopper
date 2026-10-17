// Regression checks for the code-review fixes (phase 2D) — each one attacks a bug
// found in review and asserts the FIXED behaviour, so a future refactor can't silently
// reintroduce it. Run: NODE_PATH=… CHROME_BIN=… node regress.js
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_BIN;
const URL = process.env.GAME_URL || 'http://localhost:8080/';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', executablePath: CHROME,
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('#btnStart');
  await sleep(600);
  const S = () => page.evaluate(() => window.__vibehop.state);
  const results = {};

  // ------------------------------------------------- R1: a tap on install chrome never leaks a jump
  await page.evaluate(() => document.getElementById('iosTip').classList.remove('hidden'));
  await sleep(100);
  const tipPt = await page.evaluate(() => {
    const r = document.getElementById('iosTip').getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  await page.touchscreen.tap(tipPt.x, tipPt.y);
  await sleep(150);
  const heldAfterTipTap = (await S()).held;
  await page.click('#btnStart');
  await sleep(150);
  const afterStart = await S();
  results.R1_no_phantom_hop = {
    heldAfterTipTap, vyAfterStart: afterStart.player.vy,
    onGround: afterStart.player.onGround, heldAtStart: afterStart.held, hops: afterStart.hops,
    claim: 'tapping the iOS install tip then Start boots a grounded, still player',
    pass: heldAfterTipTap === false && afterStart.player.vy === 0 &&
      afterStart.player.onGround === true && afterStart.held === false && afterStart.hops === 0
  };

  // ------------------------------------------------- R2: the death burst keeps animating
  await sleep(500);
  await page.evaluate(() => window.__vibehop.forceGameOver());
  await sleep(200);
  const partsEarly = await page.evaluate(() => window.__vibehop.state);
  await sleep(2000);
  const partsLate = await page.evaluate(() => window.__vibehop.state);
  results.R2_death_fx_alive = {
    mode: partsLate.mode, partsAt200ms: partsEarly.counts.parts, partsAt2200ms: partsLate.counts.parts,
    claim: 'particles keep ageing after death (the burst is not frozen on screen)',
    pass: partsEarly.mode === 'over' && partsEarly.counts.parts > 0 && partsLate.counts.parts < partsEarly.counts.parts
  };

  // ------------------------------------------------- R3: install button never overlaps the HUD
  await page.evaluate(() => document.getElementById('btnInstall').classList.remove('hidden'));
  await sleep(150);
  const geo = await page.evaluate(() => {
    const b = document.getElementById('btnInstall').getBoundingClientRect();
    return { installBottom: Math.round(b.bottom), hud: window.__vibehop.state.hud };
  });
  results.R3_hud_clear_of_install = {
    ...geo, claim: 'the pip row is pushed below the install pill when the pill is visible',
    pass: geo.hud.installVisible === true && geo.installBottom <= geo.hud.top
  };

  // ------------------------------------------------- R4: restart resets motion state
  await page.click('#btnAgain');
  await sleep(400);
  await page.evaluate(() => window.__vibehop.probe.dash());
  await sleep(120);
  const dashing = await S();
  await page.evaluate(() => window.__vibehop.forceGameOver());
  await sleep(300);
  await page.click('#btnAgain');
  await sleep(200);
  const fresh = await S();
  results.R4_restart_resets_player = {
    dashing: dashing.player.dashActive, xAfterDash: dashing.player.x, targetX: fresh.view.playerX,
    dashActive: fresh.player.dashActive, dashTrail: fresh.counts.dashTrail, x: fresh.player.x,
    claim: 'restart snaps the player home with no dash state carried over',
    pass: dashing.player.dashActive > 0 &&
      Math.abs(fresh.player.x - fresh.view.playerX) < 2 &&
      fresh.player.dashActive === 0 && fresh.counts.dashTrail === 0
  };

  // ------------------------------------------------- R5: multi-pointer hold + blur release
  const mp = await page.evaluate(() => {
    const s = window.__vibehop, mk = (id, type) =>
      new PointerEvent(type, { pointerId: id, bubbles: true, clientX: 150, clientY: 500 });
    window.dispatchEvent(mk(11, 'pointerdown'));
    window.dispatchEvent(mk(12, 'pointerdown'));
    const bothDown = s.state.held;
    window.dispatchEvent(mk(12, 'pointerup'));
    const afterSecondUp = s.state.held;   // finger 11 still down → must stay held
    window.dispatchEvent(mk(11, 'pointerup'));
    const afterAllUp = s.state.held;
    window.dispatchEvent(mk(13, 'pointerdown'));   // simulate a swallowed pointerup
    const lostUp = s.state.held;
    window.dispatchEvent(new Event('blur'));
    const afterBlur = s.state.held;
    return { bothDown, afterSecondUp, afterAllUp, lostUp, afterBlur };
  });
  results.R5_multi_pointer_and_blur = {
    ...mp, claim: 'hold survives one of two fingers lifting; blur always releases',
    pass: mp.bothDown === true && mp.afterSecondUp === true &&
      mp.afterAllUp === false && mp.lostUp === true && mp.afterBlur === false
  };

  // ------------------------------------------------- R6: rotate while paused snaps to the new floor
  await page.click('#btnStart');
  await sleep(350);
  await page.click('#btnPause');
  await sleep(200);
  await page.setViewport({ width: 880, height: 420, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(400);
  const rot = await S();
  results.R6_rotate_paused_snaps = {
    y: rot.player.y, ground: rot.view.groundY, h: rot.player.h, mode: rot.mode,
    claim: 'rotating while paused leaves the player standing on the new floor line',
    pass: Math.abs(rot.player.y - (rot.view.groundY - rot.player.h)) < 1.5
  };

  // ------------------------------------------------- R7/R8: dead code and audio call sites (static)
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const mustGo = ['JUMP_CUT', 'pillCd', 'rotV', 'holdJump', 'G.slowmo', 'G.perfect', '.pip.off'];
  const stillThere = mustGo.filter(s => src.includes(s));
  const mustExist = ['const HOLD_G=', 'const RELEASE_G=', 'G.hops++', "drum(t,0.95)", 'drum(t,0.35,true)'];
  const missing = mustExist.filter(s => !src.includes(s));
  results.R7_dead_code_gone = {
    stillThere, claim: 'review-flagged dead identifiers are gone',
    pass: stillThere.length === 0
  };
  results.R8_audio_call_sites = {
    missing, claim: 'soft kick is actually requested soft; hold counter incremented',
    pass: missing.length === 0
  };

  console.log(JSON.stringify({ feature: 'regressions', results, errors }, null, 2));
  const allPass = Object.values(results).every(r => r.pass);
  console.log('\n' + (allPass ? '✅ REGRESSIONS: ALL PASS' : '❌ REGRESSIONS: BROKEN'));
  await browser.close();
  process.exit(allPass ? 0 : 1);
})();

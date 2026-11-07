// Run: node test.js   (needs playwright, Chromium)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const URL = 'file://' + path.resolve(__dirname, 'key-quest.html');
const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1 } else console.log('ok  ', m) };

// type whatever is highlighted until the results screen shows
async function playOut(f, kb = f) {
  for (let i = 0; i < 4000 && (await f.evaluate(() => KQ.screen)) !== 'results'; i++) {
    const k = await f.evaluate(() => document.querySelector('#kb .key.next')?.dataset.k);
    if (k) await kb.keyboard.press(k === ' ' ? 'Space' : k); else await f.waitForTimeout(20);
  }
}
const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2] };
const contrast = h => 1.05 / (lum(h) + .05);

(async () => {
  const b = await chromium.launch(), page = await b.newPage({ viewport: { width: 1366, height: 680 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL);
  assert((await page.evaluate(() => KQ.checkWords())).length === 0, 'every lesson word uses only unlocked keys');
  const cols = await page.evaluate(() => ['pinky', 'ring', 'middle', 'pointer', 'thumb'].map(n => getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim()));
  assert(cols.every(c => contrast(c) >= 4.5), 'finger colours pass 4.5:1 with white: ' + cols.map(c => contrast(c).toFixed(1)));

  await page.fill('#nm', 'Ada'); await page.press('#nm', 'Enter');
  assert(await page.evaluate(() => KQ.screen) === 'home', 'Enter adds a player');
  await page.click('[data-k=zoom]');

  await page.click('[data-m=learn]'); await page.click('[data-n="1"]');
  await page.keyboard.press('q'); // wrong key never ends the game
  assert(await page.evaluate(() => KQ.screen) === 'play', 'wrong key keeps playing');
  await playOut(page);
  await page.keyboard.press('Space');
  assert(await page.evaluate(() => KQ.screen) === 'results', 'Space ignored for the first 1.3 s on results');
  await page.waitForTimeout(1400); await page.keyboard.press('Space');
  assert(await page.evaluate(() => KQ.screen) === 'play', 'Space works after 1.3 s');
  await page.screenshot({ path: path.join(os.tmpdir(), 'kq-play.png') });
  const fit = await page.evaluate(() => ({ w: document.documentElement.scrollWidth <= innerWidth, h: document.querySelector('#kb').getBoundingClientRect().bottom <= innerHeight }));
  assert(fit.w && fit.h, 'play screen fits 1366x680');
  await playOut(page);

  for (const m of ['rain', 'dash', 'race']) {
    await page.click('[data-act=home]'); await page.click(`[data-m=${m}]`); await page.click('[data-n="1"]'); await playOut(page);
    assert(await page.evaluate(() => KQ.screen) === 'results', m + ' reaches results');
  }
  await page.reload(); await page.click('[data-act=pick]');
  const p = await page.evaluate(() => KQ.S.players[0]);
  assert(p.lessons[1].stars > 0 && p.best.rain && p.best.dash && p.best.race && p.sessions.length >= 4 && Object.keys(p.keys).length, 'results stored per player and survive reload');
  assert(errs.length === 0, 'no page errors ' + errs.join(';'));

  // inside sandboxed iframes: with and without storage
  const wrap = path.join(os.tmpdir(), 'kq-wrap.html');
  for (const [sb, store] of [['allow-scripts allow-same-origin', true], ['allow-scripts', false]]) {
    fs.writeFileSync(wrap, `<iframe sandbox="${sb}" src="${URL}" style="width:1300px;height:640px"></iframe>`);
    const pg = await b.newPage(); await pg.goto('file://' + wrap);
    const f = pg.frames()[1]; await f.fill('#nm', 'Bo'); await f.press('#nm', 'Enter');
    await f.click('[data-m=learn]'); await f.click('[data-n="1"]'); await playOut(f, pg);
    assert(await f.evaluate(() => KQ.screen) === 'results', `iframe (${sb}) plays`);
    if (!store) { await f.click('[data-act=home]'); assert(await f.evaluate(() => !document.querySelector('#note').hidden), 'notice shown when storage is blocked') }
    await pg.close();
  }
  await b.close();
})();

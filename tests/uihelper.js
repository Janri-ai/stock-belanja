// Pembantu tes UI: halaman Playwright yang meniru google.script.run dan meneruskannya ke kode server (Node vm).
const fs = require('fs');
const P = require('./paths.js');
const html = fs.readFileSync(P.HTML, 'utf8');
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function newPage(browser, srv, viewport, session) {
  const page = await (await browser.newContext({ viewport })).newPage();
  page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.route('https://test.local/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  await page.route('https://drive.google.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG1 }));
  await page.exposeFunction('__rpc', async (fn, args) => {
    try { return { ok: true, v: JSON.parse(JSON.stringify(srv.call(fn, ...args) ?? null)) }; }
    catch (e) { return { ok: false, m: e.message }; }
  });
  await page.addInitScript(s => {
    if (s) localStorage.setItem('sbd_session', s);
    const mk = (okf, bad) => new Proxy({}, { get: (_, p) => {
      if (p === 'withSuccessHandler') return f => mk(f, bad);
      if (p === 'withFailureHandler') return f => mk(okf, f);
      return (...a) => window.__rpc(p, a).then(r => r.ok ? okf && okf(r.v) : bad && bad({ message: r.m }));
    } });
    window.google = { script: { run: mk(null, null) } };
  }, session || '');
  await page.goto('https://test.local/');
  return page;
}
async function login(page, u, p) {
  await page.fill('#lUser', u); await page.fill('#lPass', p); await page.click('#btnLogin');
}
async function changePw(page, oldp, newp) {
  await page.waitForSelector('#dlgPw[open]');
  await page.fill('#pOld', oldp); await page.fill('#pNew', newp); await page.fill('#pNew2', newp);
  await page.click('#btnPwSave');
  await page.waitForSelector('#dlgPw', { state: 'hidden' });
}
async function logout(page) {
  await page.click('#btnAccount'); await page.click('#btnLogout');
  await page.waitForSelector('#viewLogin:not([hidden])');
}
/** Server tiruan dengan tanggal tetap 15 Okt 2026 10.00 WIB. */
function fixedServer() {
  const make = require('./gasmock.js');
  const srv = make(fs.readFileSync(P.CODE, 'utf8'));
  srv.run('nowDate_ = function () { return new Date("2026-10-15T03:00:00Z"); }');
  srv.run('setup()');
  return srv;
}
module.exports = { newPage, login, changePw, logout, fixedServer };

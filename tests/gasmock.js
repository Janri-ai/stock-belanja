const vm = require('vm'), crypto = require('crypto');
function makeSheet() {
  const s = { rows: [], hidden: false };
  const get = (r, c) => (s.rows[r - 1] || [])[c - 1];
  s.getLastRow = () => s.rows.length;
  s.getMaxRows = () => 1000; s.getMaxColumns = () => 26;
  s.getRange = (r, c, nr = 1, nc = 1) => ({
    setNumberFormat() { return this; }, setFontWeight() { return this; },
    setValues(v) { v.forEach((rv, i) => { s.rows[r - 1 + i] = s.rows[r - 1 + i] || []; rv.forEach((x, j) => s.rows[r - 1 + i][c - 1 + j] = String(x)); }); return this; },
    setValue(v) { s.rows[r - 1] = s.rows[r - 1] || []; s.rows[r - 1][c - 1] = String(v); return this; },
    getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(get(r + i, c + j) ?? ''); out.push(row); } return out; }
  });
  s.clear = () => { s.rows.length = 0; }; s.showColumns = () => {}; s.hideColumns = () => {}; s.setFrozenRows = () => {};
  return s;
}
module.exports = function make(code) {
  const props = {}, cacheData = {}, files = {}, sheets = {};
  const signed = buf => [...buf].map(b => b > 127 ? b - 256 : b);
  const ss = { getId: () => 'SS', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = makeSheet()) };
  const ctx = {
    console, Logger: { log() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => props[k] = v, deleteProperty: k => delete props[k] }) },
    CacheService: { getScriptCache: () => ({ get: k => cacheData[k] ?? null, put: (k, v) => cacheData[k] = String(v), remove: k => delete cacheData[k] }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 1 }, Permission: { VIEW: 1 },
      createFolder: () => ({ getId: () => 'FOLDER' }),
      getFolderById: () => ({ createFile: blob => { const id = 'file' + crypto.randomUUID().replace(/-/g, '').slice(0, 16); files[id] = { blob, trashed: false }; return { getId: () => id, setSharing() {}, setTrashed: t => files[id].trashed = t }; } }),
      getFileById: id => ({ setTrashed: t => files[id].trashed = t })
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      base64Decode: s => signed(Buffer.from(s, 'base64')),
      newBlob: (x, mime, name) => { const bytes = typeof x === 'string' ? signed(Buffer.from(x, 'utf8')) : x; return { bytes, mime, name, getBytes() { return this.bytes; } }; },
      computeDigest: (alg, bytes) => signed(crypto.createHash('sha256').update(Buffer.from(bytes.map(b => b & 0xFF))).digest()),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      formatDate: (d, tz, pat) => {
        const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
        const p = {}; f.formatToParts(d).forEach(x => p[x.type] = x.value);
        return pat.replace(/'T'/g, '\u0001').replace(/yyyy/g, p.year).replace(/MM/g, p.month).replace(/dd/g, p.day)
                  .replace(/HH/g, p.hour).replace(/mm/g, p.minute).replace(/ss/g, p.second).replace(/\u0001/g, 'T');
      }
    },
    Session: { getScriptTimeZone: () => 'Asia/Makassar' },
    HtmlService: {}
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { ctx, props, files, sheets, cacheData, run: s => vm.runInContext(s, ctx),
           call(fn, ...args) { ctx.__a = args; return vm.runInContext(fn + '(...__a)', ctx); } };
};

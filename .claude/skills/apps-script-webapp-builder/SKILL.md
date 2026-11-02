---
name: apps-script-webapp-builder
description: Build, test and deliver a small internal web app on Google Apps Script with Sheets and Drive (login, roles, attachments, reminders), with step-by-step install help for non-technical users.
---

# Apps Script web app builder

Use when someone wants a small internal web app (reports, forms, trackers, approvals) that runs for free on a personal Gmail account with Google Apps Script + Sheets + Drive. Reply in the user's language. Many users are non-technical: give one short numbered step at a time, name the exact buttons, and ask for a screenshot after risky steps.

## 1. Clarify before building
Ask only about forks that change the design (who sees what, who creates accounts, how alerts are delivered, days/hours, visual style). Pick sensible defaults for the rest and state them. Recommend the safer option first.

## 2. Architecture
- `Code.gs` (server) + `Index.html` (client, one file, vanilla JS, no CDN). The HTML file must be named exactly `Index`.
- Public functions `api*(session, ...)`; helpers end with `_` so the browser cannot call them.
- Client wraps `google.script.run` in a Promise helper; a second helper adds the session token and returns to login on `SESI_HABIS`.
- Data in Sheet tabs with a header row; attachments in a Drive folder. `setup()` is idempotent, creates tabs/folder/first admin, and migrates columns additively without deleting data.

## 3. Security defaults
- Personal Gmail cannot identify visitors, so build own accounts: salted iterated SHA-256 hashes, sessions in `CacheService`, lockout, generic login error, forced password change for temporary passwords, admin-created accounts.
- Roles enforced on the server in every function; same message for "not found" and "not allowed".
- Text-format cells (`@`), input validation, `LockService`, soft delete, per-user write throttle.
- Files: magic-byte check, size/count limits, client-side photo compression, trash orphans.
- Client: never put user data in `innerHTML`/inline handlers; use `textContent`; encode URLs.
- Never send hashes, tokens or phone numbers to non-admins.
- Every code change needs Deploy → Manage deployments → pencil → New version.

## 4. Platform limits and workarounds
- The "created by a Google Apps Script user" banner cannot be removed in code. Use a GitHub Pages wrapper iframe + `ALLOWALL`; on iOS use `width:1px; min-width:100%`; warn about Safari storage blocking and test on an iPhone.
- Time: compute date/hour/weekday in an explicit zone with `Utilities.formatDate`; derive weekday from the date string; wrap `new Date()` in `nowDate_()` for tests.
- WhatsApp: no free safe automatic sending; default to `wa.me` click-to-chat links; normalise Indonesian numbers to `628...`.
- Time triggers are not minute-exact; free Gmail email quota is small.

## 5. Test before delivering
- Backend in Node `vm` with mocks for Properties/Cache/Lock/Spreadsheet/Drive/Utilities/Session; cover auth, roles, validation, files, migrations, time edge cases, data leakage.
- UI with Playwright; implement `google.script.run` with a Proxy bridged by `page.exposeFunction`; fake the clock by overriding `nowDate_`; use `page.clock` for timers.
- Repeat UI tests 20+ times; investigate every intermittent failure. Look at screenshots at desktop and 390 px.
- State plainly what could not be verified (real Google, iPhone, WhatsApp).

## 6. Deliver
Send the changed files, give numbered install steps (Ctrl+A paste, Ctrl+S, run `setup` if the schema changed, new deployment version, hard refresh), list limitations honestly, and offer the next improvement without building it unasked.

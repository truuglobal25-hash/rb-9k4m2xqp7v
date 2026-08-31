# Polish build — changes made 31 Aug 2026 (Claude, cloud session)

Backups taken before editing:
- polish/index.html.bak-claudecloud-20260831-182917
- polish/manifest.json.bak-claudecloud-20260831-182917
- _headers.bak-claudecloud-20260831-182917

IMPORTANT: `build_polish.py` was not found in routebook-pwa, routebook or route.
If polish/index.html is regenerated from a source tree, these three edits must be
ported into that source or they will be silently wiped. Each is marked in the file
with a `FIX(...)` comment — grep for `FIX(dataver)` and `FIX(offline-first-run)`.

---

## 1. FIX(dataver) — polish/index.html, in `_one(t)`

**Was:** whenever a territory payload was already cached in IndexedDB, the app
still fired `fetch('../app/d-<t>.txt', {cache:'no-store'})` on every launch,
downloaded the whole payload, string-compared it, and almost always threw it
away. All three territories = d-north 1,397 KB + d-central 608 KB +
d-south 719 KB ≈ **2.7 MB re-downloaded on every single app open**.

**Now:** the cached payload is stamped with the build's existing `DATAVER`
constant (`dv_<t>` in the same IndexedDB kv store). If the stamp matches the
running build, no network request is made at all.

- Repeat open on the same build: **0 bytes** (was ~2.7 MB).
- New deploy (DATAVER changes): one revalidation, then 0 again.
- Existing users have a payload but no stamp, so they do exactly one
  revalidation on first load after this ships, then 0.

## 2. FIX(offline-first-run) — polish/index.html, boot catch block

**Was:** a first open with no signal fell into `catch` and rendered
"Could not load data" + the raw error. No retry, no explanation, dead end.

**Now:** distinguishes offline from a real error, explains that the first load
needs a signal and that it works offline afterwards, shows a 44px "Try again"
button, and auto-reloads once the browser reports it is back online.

## 3. PWA icons — polish/manifest.json + head

**Was:** manifest listed a single icon `icon.svg`. That file does not exist in
polish/ — the server was returning the SPA fallback with a 200, which is why it
looked like a valid response. The four real icons generated at 18:20 today
(icon-192, icon-512, icon-maskable-512, apple-touch-icon) were referenced by
nothing, so Add-to-Home-Screen got a broken icon.

**Now:** manifest points at icon-192 (any), icon-512 (any) and
icon-maskable-512 (maskable). Dimensions verified from the PNG headers.
`<link rel="apple-touch-icon">` and `<link rel="icon">` added to head.

## 4. _headers — /polish/ cache rules

`_headers` had `Cache-Control: no-cache` for the service worker, index and
manifest under /v2/, /v3/, /v26/ and /app/ — but nothing for /polish/. Added
the three matching rules so a stale service worker cannot stick.

---

## Verified
- Inline script parses clean under `node --check` (274,242 chars, one block).
- All three edits were exact single-match replacements (script aborts otherwise).
- Diff contains no change to any counting or totals logic —
  North 11,797 / Central 4,603 / South 5,878 / All 22,278 untouched.

## NOT verified — still needs a real test
The local preview server on :8123 was down and this session has no network route
to north-route.pages.dev, so none of this was exercised in a browser.

Still to prove:
1. Repeat open transfers ~0 bytes (DevTools Network, second load).
2. First-run-offline shows the retry card, and recovers when signal returns.
3. Add to Home Screen shows a real icon and opens with no browser chrome.
4. Airplane-mode reload after one good load still renders the records.

Nothing here is deployed. The live site still has the old build, including the
tab-bar slice fix from earlier today.

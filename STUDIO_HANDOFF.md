# Route Book — handoff for the top-0.1% redesign pass

Written 31 Aug 2026. Read this first; it saves a whole discovery cycle.

## Where things stand

Four builds are live and independent. Production is untouched.

| Path | Build | State |
|---|---|---|
| `/app/` | — | **PRODUCTION. Do not touch.** Still has the date-gated safety bug (below). |
| `/polish/` | `po-…` | Earlier candidate. Superseded. |
| `/premium/` | `pr-…` | Card-stack design. Rejected by the owner as "a basic website design". |
| `/studio/` | `st-8af9fabefb` | Current candidate. Editorial rows, no cards. Geometry and typography verified. |

Build with `python build_studio.py` from `~/wowish jpeg/`. Writes to `~/routebook-pwa/studio/`.

Deploy: `npx wrangler pages deploy . --project-name=north-route --branch=main --commit-dirty=true`
with `CLOUDFLARE_API_TOKEN=$(cat ~/.config/cloudflare/pages-token)` and
`CLOUDFLARE_ACCOUNT_ID=5174ca5abe8fd14a56f1e568dec91e5f`.

## The build chain (this matters)

`build_studio.py` concatenates CSS in this order:

    design3.css -> design_polish.css -> design_premium.css -> design_studio.css

and JS in this order:

    <base SRC> -> design3_overrides.js -> design_audit_overrides.js
               -> design_polish_overrides.js -> design_studio_overrides.js

**Two traps that cost real time:**

1. Appending a CSS block near the *top* of `design_studio.css` loses to rules further
   down the same file. Two defects came from exactly this: a switcher pushed to
   x=-4 (outside the viewport), and an eyebrow stuck at 10.5px through two rebuilds.
   Append at the END, or edit the original rule in place.
2. In the JS chain the **last** function declaration wins. That is how `v3Card`,
   `duo`, `mgBadge` and `mgBlocked` are overridden. Overriding `mgBlocked` also
   changes `routable()`, because `routable` reads the same binding at call time.

## Verified invariants — do not regress

Run `~/.venvs/geo/bin/python ~/route/audit/test_totals.py` before every deploy.
Must print `ALL INVARIANTS PASS`.

- North 11,797 · Central 4,603 · South 5,878 · All 22,278
- Every proof row must read **exact**, never MISMATCH
- Data blob SHA-256 prefixes: north `22ba47020a5e`, central `37cc6d4d50fc`, south `2bdaa613fb62`

## Safety logic — the most important thing in this app

`mgBlocked()` was originally gated on `mgLive()` (today >= 1 Sep 2026). That meant
239 management-restricted shops still offered Directions while the row simultaneously
read "Ready to visit". **A restriction is a safety rule, not a calendar event.**

In `/studio/` the gate is removed and precedence is enforced:

    Management Restricted -> Proceed with Caution -> Research Required -> Normal

Routing language is suppressed on ANY managed record. Restricted shops get no
Directions and no inline action. Verified 0 contradictions across 1,650 rendered rows.

**`/app/` production still has the original date-gated bug.** Worth fixing there
regardless of which candidate wins.

## Testing gaps that bit me — do not repeat

- I audited only `?t=north` for a long time. The two-column statistic grid only
  renders on **area profile** screens and under **All Trinidad**. Test `?t=all` and
  drill into an area.
- `getBoundingClientRect()` on a text element gives its **box**, not its text. An
  eyebrow whose text looked clear still had a box sitting under the back button, and
  that box was the territory-switcher click target — so taps near the back arrow
  opened the wrong sheet. **Check click targets, not just visuals.**
- `textContent` always concatenates adjacent nodes. `22,278exact` was a real
  rendering defect (inline nodes, `display:block`, no gap) that I read past in my own
  logs for a long time because it looked like a data string. Check the render.
- Automated sweeps passed clean on defects that were obvious in a screenshot: a dead
  left gutter on every row, Filter boxed while Sort was not, categories cut mid-word.
  **Screenshots find what DOM assertions miss.**

## Layout system currently in place (`/studio/`)

- One `--gutter` token (18px, 14px under 360px). One content rail everywhere.
- `box-sizing: border-box` globally; **zero negative margins**; `min-width:0` on every
  child so nothing inherits a min-content floor.
- `.grid2` uses `repeat(2, minmax(0,1fr))` — plain `1fr` has a min-content floor and
  overflows. Single column under 360px.
- Full-bleed dark surfaces touch the screen edge; their content uses the shared rail.
- Type floor 11.5px; information text 12.5px+. Tracked uppercase only on short eyebrow
  labels, never on sentences.

## Skills worth reading before the redesign

`taste-skill` is the highest-value one, and it is explicitly scoped OUT of dense
product UI — read it for anti-default discipline, not stack advice. Its §4.4 ("cards
only when elevation communicates real hierarchy") is what killed the card stack. Its
§4.2 flags this app's exact palette (`#F5F2EC` / `#FFFDF9` / warm near-black / burnt
orange) as the most over-used AI-default family. The owner asked to keep that
identity, so it stays — but it is the single biggest lever on distinctiveness if he
ever revisits it.

Also useful: `ecc:design-system`, `ecc:make-interfaces-feel-better`, `motion-design`
(use the **Corporate** archetype clamped to 120-220ms; Premium's 350-600ms is far too
slow for a one-handed outdoor tool).

`editorial` and `premium` in the skills list are typeui.sh boilerplate — generic
palettes, Gelasio serif. Take their process discipline, not their tokens.

## Performance baseline to hold

home ~21ms · directory ~15ms · 22,278-record list ~3ms · sub-list ~2ms (medians of 7).
Offline works: SW-served shell, records from IndexedDB, 0 network requests on a warm
open. Do not add libraries for visual effects.

## Owner's standing constraints

Same functions. No new options, buttons, filters, navigation, categories, dashboards
or pop-ups. Production stays untouched until he approves a rendered candidate on his
own phone. Records deleted: zero. Lightspeed writes: zero.

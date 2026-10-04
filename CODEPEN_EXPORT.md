# Exporting The Deceivers to CodePen

The prototype is plain HTML/CSS/vanilla JS with no build step, so it maps
directly onto CodePen's three panels. CodePen doesn't serve a `/assets`
folder or multiple `/js` files the way a local checkout does, so the trick
is consolidating everything into the three panels below.

## HTML panel

Paste the **entire contents of `index.html`** *except* the outer
`<!DOCTYPE html>`, `<html>`, `<head>`, and `<body>` tags — CodePen supplies
those itself. Concretely, paste everything from:

```
<div class="app" id="app">
```

down through:

```
</div>
```

(the closing tag of `<div class="app" id="app">`). This includes the
`<svg class="sprite-defs">` block with all the `<symbol>` definitions (icons
and card art), the `.app-grain` div, the header, all 13
`<section class="screen">` containers, the modal markup, and the toast —
the sprite sheet is inline SVG, so nothing outside the HTML panel is needed
to see icons or card art.

Do **not** paste the `<link rel="stylesheet" href="css/style.css">` or the
six `<script src="js/...">` tags — CodePen's own panels replace those.

## Raster assets (new — upload these first)

Unlike the icons/cards, three small images are **not** inline SVG and need
to be uploaded to CodePen's Asset panel before the HTML/CSS panels will
render correctly:

- `assets/brand/deceivers-title-poster.jpg` (Title screen hero art)
- `assets/brand/mancave-gameshed-badge.jpg` (app-wide watermark)
- `assets/brand/grain.png` (film-grain texture tile)

Upload all three via CodePen's Asset panel (Pen Settings → Assets, or drag
them into the editor), then copy each one's CodePen-hosted URL and replace
all three `assets/brand/...` references with them in `css/style.css`
(`url('../assets/brand/deceivers-title-poster.jpg')` on `#screen-title`,
`url('../assets/brand/mancave-gameshed-badge.jpg')` on `.app::before`, and
`url('../assets/brand/grain.png')` — this last one now appears in about
16 places, not just `.app-grain`: the grainy-gold headline text and the
grain blended into the header, every button, panel, row, the target-card
grid, and the modal all reference the same tile, so a find-and-replace
across the whole CSS panel is easier than hunting each one down). All
three are CSS `background-image`s now — nothing in the HTML or JS panels
references them directly. Without this step the Title screen, watermark,
and grain texture will silently fail to load (missing background) while
everything else keeps working, since none of those three are required for
gameplay.

## Font (new — add this in CodePen's settings, not a panel)

`index.html`'s `<head>` loads Oswald from Google Fonts via `<link>` tags —
CodePen's HTML panel doesn't paste a `<head>`, so add the font a different
way: Pen Settings → HTML → "Stuff for `<head>`", paste:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&display=swap">
```

(CodePen's Settings → Fonts picker works too, if you'd rather search for
Oswald there instead of pasting the link tags.) Skipping this step isn't
fatal — `--font-display` falls back to `'Arial Narrow', 'Helvetica Neue',
sans-serif` — but headings won't match the key art's condensed look.

## CSS panel

Paste the entire contents of `css/style.css` as-is, after swapping in the
three CodePen asset URLs described above. It has no imports of its own —
every icon/card asset it needs is the inline SVG sprite already sitting in
the HTML panel; only the three `url(...)` background-image references and
the `var(--font-display)` font (added via Pen Settings, above) point
outside the panel.

## JS panel

Paste the contents of these six files **in this exact order**, one after
another in the single JS panel (a blank line between each is fine):

1. `js/data.js`
2. `js/state.js`
3. `js/engine.js`
4. `js/sound.js`
5. `js/ui.js`
6. `js/main.js`

Order matters: each file defines plain global functions/constants that the
next file calls directly (no modules, no bundler, no `import`/`export`).
`main.js` calls `render()` at the very end of the file, which boots the app,
so nothing else needs to run manually.

In CodePen's JS settings, no external libraries or "Babel" preprocessing are
required — this is vanilla ES2017-ish JS (template literals, arrow
functions, destructuring, `Array.prototype.flat`-free) that runs unmodified
in current browsers.

## Verifying the export

After pasting all three panels:

1. The Title screen should render immediately with the full-bleed poster
   art behind "NEW GAME" / "HOW TO PLAY" buttons. If that background is
   blank/missing, the asset-URL swap above wasn't done.
2. Open the browser console — there should be no errors (a 404 for
   `/favicon.ico` from CodePen's own preview frame is normal and unrelated).
3. Play through Setup → Reveal → a full round to confirm the SVG sprite
   (icons and card art) rendered — if icons are missing, double check the
   `<svg class="sprite-defs">` block was pasted completely and no
   `<symbol>` tags were truncated by the paste.
4. Set CodePen's preview viewport to ~390px wide (or use browser dev tools'
   device toolbar at 390×844) to preview it the way it's meant to be played
   — the layout is mobile-first and centers itself on wider screens.

## localStorage note

CodePen preview frames run on a sandboxed origin (`*.cdpn.io`), so
`localStorage` (used for Continue/save) works the same as any other origin
— saves persist across reloads of that same Pen, but won't carry over if
you fork the Pen to a new URL (a fresh Pen is a fresh origin).

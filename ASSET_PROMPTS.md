# Art Prompts — Graffiti/Street-Art Reskin

Ready-to-paste prompts for ChatGPT (image generation) to produce the 16
raster assets still in the old muted-gold style after the CSS/SVG reskin.
These are the images the reskin *couldn't* touch — baked JPEGs/PNGs, not
CSS tokens.

**v2 — what changed from the first pass**: the first batch
("Cleaner Tones") came back well-drawn but drifted off-brand — no
Mancaveman figure, no Mancave Industries stamp, no graffiti-stencil/drip/
torn-paper texture, and `final-circle.jpg` showed more than the 4 figures
it should (that moment always fires at exactly 4 living players). The
**4 icons matched the brief and don't need regenerating** — only Part 1
(title poster) and Part 2 (11 interstitials) below need a new pass. One
thing from the first batch is worth *keeping*: each image leaning into
its own accent color rather than forcing yellow everywhere (murder red,
draw's cooler tones, etc.) read well and is now built into the brief
below as a deliberate feature, not a deviation.

**How to use this**: open a new ChatGPT conversation, attach 2–3 of the
banners you already have (the "Send A Tip" and "Listen To Our Deceitful
Playlist" ones are good references — same artist/style, already approved)
as reference images alongside the first prompt, then generate the rest of
the prompts in the *same* conversation thread so later images stay
consistent with earlier ones. Generating all 16 as totally separate,
fresh chats tends to drift in style — which is most of what went wrong
last time.

Once you have images back, send them to me (or drop them in
`assets/brand/` / `assets/brand/interstitials/` yourself) and I'll
resize/compress and wire each one in.

---

## Style guide (repeat/keep in mind across every image)

> Bold street-art/graffiti stencil style on a flat black background.
> **Accent color varies by mood/moment — this is deliberate, not every
> image should be the same color.** Vivid spray-paint yellow (#FFD900)
> is the *default* for neutral/ceremonial moments; vivid red (#DA1115)
> for danger/violence/victory-for-the-dark-side moments; a cooler accent
> (teal, blue, or green in the same vivid spray-paint saturation, not
> muted or pastel) is allowed for quieter/mysterious moments. Whatever
> the accent, keep it vivid and saturated — not dusty, not desaturated,
> not a painterly/illustrated gradient. Secondary color stays white or
> cream torn-paper/stencil lettering throughout, every image, regardless
> of accent.
>
> **Non-negotiable across every single image, no exceptions**: a
> recurring mascot — a bald, bearded, serious/stern-looking man
> ("Mancaveman") in a black t-shirt with a small circular "MANCAVE
> INDUSTRIES" grenade-logo patch on the chest, sometimes with a
> spray-painted crown above his head — appears somewhere in frame (can
> be small/silhouetted/partial if the composition calls for it, but he
> needs to be there). A weathered circular "MANCAVE INDUSTRIES" stamp/
> grenade logo appears somewhere in the frame too, usually a corner,
> rendered in grey/charcoal so it reads as a stamp rather than competing
> with the accent color. Visible spray splatter, paint drips running down
> from lettering, rough torn/ripped paper edges framing the whole image —
> this stencil/drip/torn-paper *texture* is the throughline that has to
> survive no matter which accent color a given image uses. No smooth
> gradients, no clean vector look, no painterly/illustrated rendering,
> nothing that reads as a polished book-cover — everything should look
> hand-stencilled and a little chaotic, matching the style of the
> attached reference banners exactly.

---

## Part 1 — Title poster (1 image)

**File**: `deceivers-title-poster.jpg` · **Size**: 520×1124px (portrait,
~0.46:1) · Full-bleed background behind the Title screen's "New Game" /
"How To Play" buttons, so keep the *lower third* relatively dark/calm —
those buttons sit on top of it.

> Portrait graffiti poster, 520x1124px. [style guide above]. Accent
> color: yellow (the default/ceremonial choice for the title itself).
> Big bold stencil-spray lettering reading "THE DECEIVERS" as the
> dominant element, drips running off the letters. Mancaveman figure
> (crossed arms, crowned) positioned to one side. Smaller text beneath
> the main title reading "CEREMONY OF TRUST AND BETRAYAL" in a plainer
> stencil font. Mancave Industries stamp in a corner. The bottom third
> of the image should be darker and less busy — no large text or faces
> there — since UI buttons will overlay that area.

---

## Part 2 — 11 interstitial posters

**Files**: `assets/brand/interstitials/<name>.jpg` · **Size**: 480×852px
(portrait, exactly 9:16) each · brief fullscreen cards shown for ~1.7s
between game phases. Each one needs its named text baked boldly into the
image (large enough to read on a phone at arm's length) plus one small
visual motif matching the moment. Keep each one simple — one strong
image, not a busy scene — since these flash by quickly. Accent color is
called out per image below; everything else in the style guide (Mancaveman,
stamp, drip/stencil/torn-paper texture) applies to all 11 without
exception.

1. **`reveal.jpg`** — shown right before each player privately checks
   their own role card.
   > Portrait graffiti poster, 480x852px. [style guide]. Accent color:
   > yellow. Bold stencil text "THE REVEAL". Visual motif: a single
   > playing card held up, half-turned as if being peeked at in secret,
   > maybe a single eye motif nearby. Mysterious, private mood rather
   > than aggressive.

2. **`draw.jpg`** — shown as every round's card-draw begins.
   > Portrait graffiti poster, 480x852px. [style guide]. Accent color:
   > yellow, or a cool blue/teal if that suits the composition better —
   > your call, keep it vivid either way. Bold stencil text "DRAW PHASE".
   > Visual motif: a hand mid-motion drawing a card from a fanned deck,
   > motion lines/spray splatter suggesting speed.

3. **`night-falls.jpg`** — shown as the Night screen first appears.
   > Portrait graffiti poster, 480x852px. [style guide]. Accent color:
   > cool blue or teal, vivid spray-paint saturation, more black overall
   > than the other images — this one should feel darkest/moodiest of
   > the set. Bold stencil text "NIGHT FALLS". Visual motif: a crescent
   > moon stencil, maybe the Mancaveman figure reduced to a silhouette
   > only, ominous.

4. **`murder.jpg`** — shown as the Murder phase begins (Deceivers choose
   a victim).
   > Portrait graffiti poster, 480x852px. [style guide]. Accent color:
   > red, lettering dripping red. Bold stencil text "MURDER". Visual
   > motif: a dagger stencil, red paint splatter, a small skull icon —
   > matches the red "danger" accent already used for a skull icon in
   > the existing banner art.

5. **`banishment.jpg`** — shown as an ordinary Banishment Vote's Open
   Discussion begins.
   > Portrait graffiti poster, 480x852px. [style guide]. Accent color:
   > yellow. Bold stencil text "BANISHMENT". Visual motif: several
   > silhouetted figures pointing fingers at one central figure,
   > accusation/finger-pointing energy, a speech-bubble "..." icon like
   > the one in the main DECEIVERS banner.

6. **`final-circle.jpg`** — shown once living players first drop to 4
   and the Final Circle begins. **Exactly four figures, no more, no
   fewer** — this moment only ever fires at exactly 4 living players, so
   showing 5 or 6 would be factually wrong (the first batch got this
   wrong, showing more than four — double-check the final image before
   sending it back). Text is two lines.
   > Portrait graffiti poster, 480x852px. [style guide]. Accent color:
   > yellow. Bold stencil text, two lines: "FINAL CIRCLE" (larger) then
   > "FOUR REMAIN" (smaller, beneath). Visual motif: EXACTLY FOUR
   > silhouetted figures standing in a loose circle facing inward — count
   > them before finalizing, it must be four and only four — a compass/
   > star emblem in the center of the circle between them.

7. **`end-game.jpg`** — shown when the Final Circle concludes by
   unanimous vote to end.
   > Portrait graffiti poster, 480x852px. [style guide]. Accent color:
   > yellow or white-dominant. Bold stencil text "END GAME". Visual
   > motif: a torn-open mask or unveiling gesture — something suggesting
   > every identity is about to be revealed at once.

8. **`banish-again.jpg`** — shown when at least one Final Circle player
   chooses to keep voting instead of ending.
   > Portrait graffiti poster, 480x852px. [style guide]. Accent color:
   > yellow. Bold stencil text "BANISH AGAIN". Visual motif: a raised
   > voting hand or fist, a masked/hooded silhouette (the vote here stays
   > anonymous — nobody learns who was banished until the very end),
   > tense energy.

9. **`final-two.jpg`** — shown when living players drop to exactly 2
   (forces an automatic end, no further voting). Exactly two figures.
   Two lines of text.
   > Portrait graffiti poster, 480x852px. [style guide]. Accent color:
   > yellow. Bold stencil text, two lines: "FINAL TWO" (larger) then
   > "NO MORE VOTING" (smaller, beneath). Visual motif: exactly two
   > silhouetted figures facing each other head-on, a dividing line or
   > crack down the middle of the composition between them.

10. **`loyal-win.jpg`** — the Loyal side's victory screen.
    > Portrait graffiti poster, 480x852px. [style guide]. Accent color:
    > yellow, brighter/more triumphant than the others — more white, a
    > sense of light breaking through the black. Bold stencil text "THE
    > LOYAL PREVAIL" or "LOYAL WIN". Visual motif: a shield stencil,
    > raised fists, victorious mood.

11. **`deceiver-win.jpg`** — the Deceivers' victory screen.
    > Portrait graffiti poster, 480x852px. [style guide]. Accent color:
    > red, darker/more menacing than the others. Bold stencil text "THE
    > DECEIVERS WIN". Visual motif: Mancaveman (or a hooded figure
    > version of him) standing triumphant, red accent splatter, a sense
    > of the black having won out over the light.

---

## Part 3 — 4 small icons (already done, reference only)

**Files**: `assets/brand/icons/<name>.png` · 200×200px, transparent PNG.
These already matched the brief in the first pack — simple bold yellow
stencil silhouettes, no texture, no drips — and are being wired in as-is.
No need to regenerate; listed here only so the full asset set is visible
in one place.

1. `hooded-figure.png` — hooded/cloaked figure silhouette (Deceiver role).
2. `shield.png` — heraldic shield silhouette (protection).
3. `dagger.png` — dagger/knife silhouette, blade up (vote-weight card).
4. `compass-medallion.png` — compass-star/sunburst medallion (ceremonial
   "gather everyone" moments).

---

## After you have the images back

Tell me (or just drop the files in) and I'll:
- Resize/compress each to match the existing pipeline (interstitials and
  the title poster as JPEG quality 84) — same convention already used for
  every asset in this repo.
- Swap them into `assets/brand/` / `assets/brand/interstitials/` in place
  of the old files (same filenames, so nothing in the code needs to
  change).
- Bump the cache-bust version, screenshot a handful of screens to check
  it all reads correctly, and ship it.

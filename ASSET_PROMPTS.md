# Art Prompts — Graffiti/Street-Art Reskin

Ready-to-paste prompts for ChatGPT (image generation) to produce the 16
raster assets still in the old muted-gold style after the CSS/SVG reskin.
These are the images the reskin *couldn't* touch — baked JPEGs/PNGs, not
CSS tokens.

**How to use this**: open a new ChatGPT conversation, attach 2–3 of the
banners you already have (the "Send A Tip" and "Listen To Our Deceitful
Playlist" ones are good references — same artist/style, already approved)
as reference images alongside the first prompt, then generate the rest of
the prompts in the *same* conversation thread so later images stay
consistent with earlier ones. Generating all 16 as totally separate,
freshchats tends to drift in style.

Once you have images back, send them to me (or drop them in
`assets/brand/` / `assets/brand/interstitials/` / `assets/brand/icons/`
yourself) and I'll resize/compress and wire each one in.

---

## Style guide (repeat/keep in mind across every image)

> Bold street-art/graffiti stencil style on a flat black background.
> Primary color: vivid spray-paint yellow (#FFD900). Secondary: white or
> cream torn-paper/stencil lettering. Accent: vivid red (#DA1115) used
> sparingly for danger/blood/alert details — arrows, splatter, X marks.
> Recurring mascot: a bald, bearded, serious/stern-looking man
> ("Mancaveman") in a black t-shirt with a small circular "MANCAVE
> INDUSTRIES" grenade-logo patch on the chest, sometimes with a
> spray-painted crown above his head. A weathered circular "MANCAVE
> INDUSTRIES" stamp/grenade logo appears somewhere in the frame, usually
> a corner, rendered in grey/charcoal so it reads as a stamp rather than
> competing with the yellow. Visible spray splatter, paint drips running
> down from lettering, rough torn/ripped paper edges framing the whole
> image. No smooth gradients, no clean vector look, nothing that reads
> as corporate or polished — everything should look hand-stencilled and
> a little chaotic.

---

## Part 1 — Title poster (1 image)

**File**: `deceivers-title-poster.jpg` · **Size**: 520×1124px (portrait,
~0.46:1) · Full-bleed background behind the Title screen's "New Game" /
"How To Play" buttons, so keep the *lower third* relatively dark/calm —
those buttons sit on top of it.

> Portrait graffiti poster, 520x1124px. [style guide above]. Big bold
> stencil-spray lettering reading "THE DECEIVERS" as the dominant
> element, drips running off the letters. Mancaveman figure (crossed
> arms, crowned) positioned to one side. Smaller text beneath the main
> title reading "CEREMONY OF TRUST AND BETRAYAL" in a plainer stencil
> font. Mancave Industries stamp in a corner. The bottom third of the
> image should be darker and less busy — no large text or faces there —
> since UI buttons will overlay that area.

---

## Part 2 — 11 interstitial posters

**Files**: `assets/brand/interstitials/<name>.jpg` · **Size**: 480×852px
(portrait, exactly 9:16) each · brief fullscreen cards shown for ~1.7s
between game phases. Each one needs its named text baked boldly into the
image (large enough to read on a phone at arm's length) plus one small
visual motif matching the moment. Keep each one simple — one strong
image, not a busy scene — since these flash by quickly.

1. **`reveal.jpg`** — shown right before each player privately checks
   their own role card.
   > Portrait graffiti poster, 480x852px. [style guide]. Bold stencil
   > text "THE REVEAL". Visual motif: a single playing card held up,
   > half-turned as if being peeked at in secret, maybe a single eye
   > motif nearby. Mysterious, private mood rather than aggressive.

2. **`draw.jpg`** — shown as every round's card-draw begins.
   > Portrait graffiti poster, 480x852px. [style guide]. Bold stencil
   > text "DRAW PHASE". Visual motif: a hand mid-motion drawing a card
   > from a fanned deck, motion lines/spray splatter suggesting speed.

3. **`night-falls.jpg`** — shown as the Night screen first appears.
   > Portrait graffiti poster, 480x852px. [style guide], but darker and
   > moodier than the others — more black, less yellow. Bold stencil
   > text "NIGHT FALLS". Visual motif: a crescent moon stencil, maybe
   > the Mancaveman figure's silhouette only (no detail), ominous.

4. **`murder.jpg`** — shown as the Murder phase begins (Deceivers choose
   a victim).
   > Portrait graffiti poster, 480x852px. [style guide]. Bold stencil
   > text "MURDER", lettering dripping red instead of yellow for this
   > one. Visual motif: a dagger stencil, red paint splatter, a small
   > skull icon — matches the red "danger" accent already used for a
   > skull icon in the existing banner art.

5. **`banishment.jpg`** — shown as an ordinary Banishment Vote's Open
   Discussion begins.
   > Portrait graffiti poster, 480x852px. [style guide]. Bold stencil
   > text "BANISHMENT". Visual motif: several silhouetted figures
   > pointing fingers at one central figure, accusation/finger-pointing
   > energy, a speech-bubble "..." icon like the one in the main
   > DECEIVERS banner.

6. **`final-circle.jpg`** — shown once living players first drop to 4
   and the Final Circle begins. This one's text is two lines and is
   always numerically accurate (the Final Circle always begins at
   exactly 4 living players, never more or fewer) — keep both lines.
   > Portrait graffiti poster, 480x852px. [style guide]. Bold stencil
   > text, two lines: "FINAL CIRCLE" (larger) then "FOUR REMAIN"
   > (smaller, beneath). Visual motif: four silhouetted figures standing
   > in a loose circle facing inward, a compass/star emblem in the
   > center of the circle between them.

7. **`end-game.jpg`** — shown when the Final Circle concludes by
   unanimous vote to end.
   > Portrait graffiti poster, 480x852px. [style guide]. Bold stencil
   > text "END GAME". Visual motif: a torn-open mask or unveiling
   > gesture — something suggesting every identity is about to be
   > revealed at once.

8. **`banish-again.jpg`** — shown when at least one Final Circle player
   chooses to keep voting instead of ending.
   > Portrait graffiti poster, 480x852px. [style guide]. Bold stencil
   > text "BANISH AGAIN". Visual motif: a raised voting hand or fist,
   > a masked/hooded silhouette (the vote here stays anonymous — nobody
   > learns who was banished until the very end), tense energy.

9. **`final-two.jpg`** — shown when living players drop to exactly 2
   (forces an automatic end, no further voting). Two lines again.
   > Portrait graffiti poster, 480x852px. [style guide]. Bold stencil
   > text, two lines: "FINAL TWO" (larger) then "NO MORE VOTING"
   > (smaller, beneath). Visual motif: two silhouetted figures facing
   > each other head-on, a dividing line or crack down the middle of the
   > composition between them.

10. **`loyal-win.jpg`** — the Loyal side's victory screen.
    > Portrait graffiti poster, 480x852px. [style guide], but brighter/
    > more triumphant than the others — more white, a sense of light
    > breaking through the black. Bold stencil text "THE LOYAL PREVAIL"
    > or "LOYAL WIN". Visual motif: a shield stencil, raised fists,
    > victorious mood.

11. **`deceiver-win.jpg`** — the Deceivers' victory screen.
    > Portrait graffiti poster, 480x852px. [style guide], darker/more
    > menacing than the others. Bold stencil text "THE DECEIVERS WIN".
    > Visual motif: a hooded/cloaked figure standing triumphant,
    > red accent splatter, a sense of the black having won out over the
    > light.

---

## Part 3 — 4 small icons

**Files**: `assets/brand/icons/<name>.png` · **Size**: 200×200px,
**transparent background (PNG with alpha), no border/frame** · these get
displayed small (as small as 16–20px in places), so they need to be much
simpler/bolder than the posters above — a single clean stencil mark, not
a detailed graffiti scene. Avoid drips, splatter, or background texture
here; those details turn to mud at icon size.

> Simple bold stencil icon, 200x200px, transparent background, single
> color (vivid yellow #FFD900) silhouette/line art only, no background,
> no texture, no drips — clean enough to read clearly at 20px.

1. **`hooded-figure.png`** — a simple hooded/cloaked figure silhouette,
   shoulders-up or full figure, representing the Deceiver role.
2. **`shield.png`** — a simple heraldic shield outline/silhouette,
   representing protection.
3. **`dagger.png`** — a simple dagger/knife silhouette, blade pointing
   up, representing the vote-weight card.
4. **`compass-medallion.png`** — a simple compass-star or sunburst
   medallion emblem, representing ceremonial "gather everyone" moments.

---

## After you have the images back

Tell me (or just drop the files in) and I'll:
- Resize/compress each to match the existing pipeline (interstitials and
  the title poster as JPEG quality 84; icons as optimized transparent
  PNG) — same convention already used for every asset in this repo.
- Swap them into `assets/brand/` / `assets/brand/interstitials/` /
  `assets/brand/icons/` in place of the old files (same filenames, so
  nothing in the code needs to change).
- Bump the cache-bust version, screenshot a handful of screens to check
  it all reads correctly, and ship it.

/* ==========================================================================
   THE DECEIVERS — Rendering
   Builds DOM for each screen from the current state. Never mutates game
   state directly — main.js calls engine functions, then calls a render
   function here. Every render function is pure w.r.t. its inputs.
   ========================================================================== */

const UI = {};

/* ---------- Small helpers ---------- */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function initials(name) {
  const trimmed = String(name).trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

/* The new raster icon family (replacing these 4 specific inline-SVG
   symbols throughout the app — see the asset-processing note in
   PROJECT_PLAN.md's Interstitials section) is wired in centrally here
   rather than at each of iconUse's ~15 call sites, including the ones
   that go through passPrompt's shared template: every existing call that
   happens to reference one of these 4 icon ids automatically renders the
   new artwork with zero changes needed at the call site itself, and
   every other icon id keeps using the inline SVG sprite exactly as
   before. ICONS.compass is the one of these 4 not tied to a specific
   Fortune card — it's the ceremonial "Gather Everyone"/ready-bell icon. */
const RASTER_ICONS = {
  [ICONS.hoodedFigure]: 'assets/brand/icons/hooded-figure.png',
  [ICONS.shield]: 'assets/brand/icons/shield.png',
  [ICONS.dagger]: 'assets/brand/icons/dagger.png',
  [ICONS.compass]: 'assets/brand/icons/compass-medallion.png',
};

function iconUse(id, cls) {
  const raster = RASTER_ICONS[id];
  if (raster) {
    return `<img class="${cls || 'icon'}" src="${raster}" alt="" draggable="false">`;
  }
  return `<svg class="${cls || 'icon'}" aria-hidden="true"><use href="#${id}"></use></svg>`;
}

function cardStatic(symbolId, extraClass) {
  return `<div class="card ${extraClass || ''}"><svg viewBox="0 0 200 280" style="width:100%;height:100%;display:block;border-radius:14px;"><use href="#${symbolId}"></use></svg></div>`;
}

function cardFlip(backSymbol, frontSymbol, extraClass, cardId) {
  return `<div class="card ${extraClass || ''}" ${cardId ? `id="${cardId}"` : ''}>
    <div class="card-inner">
      <div class="card-face card-back-face"><svg viewBox="0 0 200 280"><use href="#${backSymbol}"></use></svg></div>
      <div class="card-face card-front-face"><svg viewBox="0 0 200 280"><use href="#${frontSymbol}"></use></svg></div>
    </div>
  </div>`;
}

function screen(name) {
  return document.getElementById(`screen-${name}`);
}

function triggerFlip(cardId) {
  requestAnimationFrame(() => {
    setTimeout(() => {
      const el = document.getElementById(cardId);
      if (el) el.classList.add('flipped');
    }, 60);
  });
}

function meaningBlock(text) {
  return `<div class="pass-overlay-eyebrow" style="margin-top:2px;">What This Means</div>
    <p class="reveal-body" style="font-size:13px;">${text}</p>`;
}

function passPrompt({ icon, name, instruction, action, btnLabel, btnClass }) {
  return `
    <div class="reveal-stage fade-in">
      ${iconUse(icon, 'icon icon-lg')}
      <div class="pass-overlay-eyebrow">Pass the phone to</div>
      <div class="pass-overlay-name">${escapeHtml(name)}</div>
      <p class="pass-overlay-instruction">${instruction}</p>
      <button class="btn ${btnClass || 'btn-primary'}" data-action="${action}">${btnLabel}</button>
    </div>`;
}

/* ---------- Header ---------- */

UI.updateHeader = function updateHeader(state) {
  const roundLabel = document.getElementById('roundLabel');
  const phaseLabel = document.getElementById('phaseLabel');
  if (state.phase === PHASES.TITLE || state.phase === PHASES.SETUP) {
    roundLabel.textContent = 'The Deceivers';
    phaseLabel.textContent = '';
  } else if (state.phase === PHASES.RESULTS) {
    roundLabel.textContent = 'The Circle Closes';
    phaseLabel.textContent = '';
  } else {
    roundLabel.textContent = `Round ${state.round}`;
    phaseLabel.textContent = PHASE_LABELS[state.phase] || '';
  }
};

/* ---------- 1. Title ---------- */

UI.renderTitle = function renderTitle(hasSaved) {
  screen('title').innerHTML = `
    <div class="title-hero fade-in" role="img" aria-label="The Deceivers — Ceremony Of Trust And Betrayal. A Mancave Industries / Game Shed production.">
      <div class="title-actions">
        ${hasSaved ? '<button class="btn btn-primary btn-block" data-action="continue-game">Continue Game</button>' : ''}
        <button class="btn ${hasSaved ? 'btn-ghost' : 'btn-primary'} btn-block" data-action="new-game">New Game</button>
        <button class="btn btn-ghost btn-block" data-action="open-help">How To Play</button>
      </div>
    </div>`;
};

/* ---------- 2. Setup ---------- */

UI.renderSetup = function renderSetup(names, seriesLength, isComputer, deceiverKnowledge) {
  const allValid = names.every((n) => n.trim().length > 0);
  const deceivers = deceiverCountForPlayers(names.length);
  const computerCount = isComputer.filter(Boolean).length;
  screen('setup').innerHTML = `
    <div class="screen-title-row">Gather the Circle</div>
    <div class="screen-subtitle">Enter each player's name. One shared phone, ${CONFIG.minPlayers}–${CONFIG.maxPlayers} players. Mark a seat Computer to have it play itself with simple random logic.</div>
    <div class="setup-list">
      ${names.map((n, i) => `
        <div class="setup-player-block">
          <div class="setup-row">
            <span class="seat-index">${i + 1}</span>
            <input class="name-input" type="text" data-index="${i}" maxlength="18" placeholder="Player ${i + 1} name" value="${escapeHtml(n)}" autocomplete="off">
            ${names.length > CONFIG.minPlayers ? `<button class="remove-player-btn" data-action="remove-player" data-index="${i}" aria-label="Remove player">&times;</button>` : ''}
          </div>
          <div class="seat-mode-row">
            <button type="button" class="seat-mode-btn ${!isComputer[i] ? 'active' : ''}" data-action="set-seat-mode" data-index="${i}" data-mode="human">${iconUse(ICONS.hoodedFigure, 'icon-sm')} Human</button>
            <button type="button" class="seat-mode-btn ${isComputer[i] ? 'active' : ''}" data-action="set-seat-mode" data-index="${i}" data-mode="computer">${iconUse(ICONS.settings, 'icon-sm')} Computer</button>
          </div>
        </div>`).join('')}
    </div>
    ${computerCount ? `<p class="setup-hint">${computerCount} computer seat${computerCount > 1 ? 's' : ''} — the phone skips straight past ${computerCount > 1 ? 'them' : 'it'} on ${computerCount > 1 ? 'their' : 'its'} turn.</p>` : ''}
    ${names.length < CONFIG.maxPlayers ? `<button class="add-player-btn" data-action="add-player">${iconUse(ICONS.hoodedFigure, 'icon-sm')} Add Player</button>` : ''}
    <p class="setup-hint">${names.length} players — ${deceivers} Deceiver${deceivers > 1 ? 's' : ''} will be chosen in secret.</p>
    <div class="panel" style="margin-top:6px;">
      <div class="panel-title">How Many Games?</div>
      <div style="display:flex; align-items:center; justify-content:center; gap:20px;">
        <button class="icon-btn" data-action="dec-series-length" aria-label="Fewer games" style="border:1.5px solid var(--gold-700); font-size:22px; color:var(--gold-400); line-height:1;">−</button>
        <div style="text-align:center;">
          <div class="prize-pot-value" style="font-size:26px;">${seriesLength}</div>
          <div class="prize-pot-label">${seriesLength > 1 ? 'games in the series' : 'game'}</div>
        </div>
        <button class="icon-btn" data-action="inc-series-length" aria-label="More games" style="border:1.5px solid var(--gold-700); font-size:22px; color:var(--gold-400); line-height:1;">+</button>
      </div>
      ${seriesLength > 1 ? '<p class="small-note" style="margin-top:8px;">Points carry across every game — the Prize Pot is paid out to the winning side each game.</p>' : ''}
    </div>
    <div class="panel" style="margin-top:10px;">
      <div class="panel-title">Deceiver Knowledge</div>
      <div class="seat-mode-row" style="padding-left:0;">
        <button type="button" class="seat-mode-btn ${deceiverKnowledge !== 'hidden' ? 'active' : ''}" data-action="set-deceiver-knowledge" data-mode="known">Known</button>
        <button type="button" class="seat-mode-btn ${deceiverKnowledge === 'hidden' ? 'active' : ''}" data-action="set-deceiver-knowledge" data-mode="hidden">Hidden</button>
      </div>
      <p class="small-note" style="text-align:left; margin-top:8px;">${deceiverKnowledge === 'hidden'
        ? "Deceivers begin without knowing who the others are — only a successful recruitment pact introduces two Deceivers to each other."
        : 'Deceivers privately see their fellow Deceivers (if more than one) during the role reveal.'}</p>
    </div>
    <div class="spacer"></div>
    <button class="btn btn-primary btn-block" data-action="start-game" ${allValid ? '' : 'disabled'}>Seal The Roles &amp; Begin</button>`;
};

/* ---------- Computer seat auto-turn ----------
   One shared screen for every queue-based phase (Reveal/Draw/Murder/Vote)
   when the current seat is a computer. Content depends only on the player's
   name — never on their secret role or on what the bot decided — so it
   looks identical for the acting Deceiver's computer turn as for any other
   computer seat's turn, matching the human decoy-screen pattern. */
UI.renderComputerTurn = function renderComputerTurn(state, player) {
  screen(state.phase).innerHTML = `
    <div class="reveal-stage fade-in">
      ${iconUse(ICONS.settings, 'icon icon-lg')}
      <div class="pass-overlay-eyebrow">Computer Seat</div>
      <div class="pass-overlay-name">${escapeHtml(player.name)}</div>
      <p class="reveal-body">Taking its turn — no phone needed.</p>
    </div>`;
};

/* ---------- 3. Private Role Reveal ---------- */

UI.renderReveal = function renderReveal(state, tapped) {
  const player = currentQueuePlayer(state);
  if (!player) return;
  const role = player.role === ROLES.DECEIVER.id ? ROLES.DECEIVER : ROLES.LOYAL;
  const knowFellows = state.settings.deceiverKnowledge !== 'hidden';
  const fellows = (role === ROLES.DECEIVER && knowFellows) ? fellowDeceivers(state, player.id) : [];
  const fellowText = fellows.length
    ? `<br><br>Your fellow Deceiver${fellows.length > 1 ? 's' : ''}: <strong>${fellows.map(escapeHtml).join(', ')}</strong>`
    : '';

  if (!tapped) {
    screen('reveal').innerHTML = passPrompt({
      icon: ICONS.hoodedFigure,
      name: player.name,
      instruction: `Hand the phone to <strong>${escapeHtml(player.name)}</strong> now and look away — no one else should see this screen. Once it's in their hands, they tap below.`,
      action: 'tap-reveal',
      btnLabel: 'Reveal My Role',
    });
    return;
  }

  screen('reveal').innerHTML = `
    <div class="reveal-stage">
      ${cardFlip(CARD_FRAMES.back, role.symbol, 'card-lg', 'revealCard')}
      <h2 class="reveal-headline">${role.label}</h2>
      ${meaningBlock(`${role.description}${fellowText}`)}
      <button class="btn btn-confirm btn-block" data-action="confirm-reveal">Hide My Role &amp; Pass The Phone</button>
    </div>`;
  triggerFlip('revealCard');
};

/* ---------- 4. Main hub ---------- */

UI.renderMain = function renderMain(state) {
  const living = livingPlayers(state);
  const seriesNote = state.seriesLength > 1 ? `Game ${state.seriesGame} of ${state.seriesLength} — ` : '';
  screen('main').innerHTML = `
    <div class="screen-title-row">${state.finalCircleActive ? 'The Final Circle' : `Round ${state.round}`}</div>
    <div class="screen-subtitle">${seriesNote}${living.length} remain in the circle.</div>
    <div class="prize-pot-panel">
      ${iconUse(ICONS.coin, 'icon icon-lg')}
      <div><div class="prize-pot-value">${state.prizePot}</div><div class="prize-pot-label">Prize Pot</div></div>
      ${iconUse(ICONS.coin, 'icon icon-lg')}
    </div>
    <div class="player-list">
      ${state.players.map((p) => `
        <div class="player-row ${p.alive ? '' : 'eliminated'}">
          <div class="player-avatar">${initials(p.name)}</div>
          <div class="player-name">${escapeHtml(p.name)}${p.isComputer ? ' <span class="small-note">(Computer)</span>' : ''}</div>
          <div class="player-meta">${p.alive ? (p.hand.length ? `${p.hand.length} card${p.hand.length > 1 ? 's' : ''}` : '') : 'Out'}</div>
          ${!p.alive ? iconUse(ICONS.skull, 'player-badge') : ''}
        </div>`).join('')}
    </div>
    <div class="spacer"></div>
    ${state.finalCircleActive ? `
      <div class="panel">
        <div class="panel-title">The Final Circle</div>
        <p class="small-note" style="text-align:left;">Few enough remain that every round from here is private: each of you secretly chooses End Game or Banish Again. It takes just one Banish Again to force another vote, and no one's allegiance is revealed again until only two remain.</p>
      </div>` : ''}
    <button class="btn btn-primary btn-block" data-action="${state.finalCircleActive ? 'begin-final-circle' : 'begin-draw'}" style="margin-top:14px;">${state.finalCircleActive ? 'Enter The Final Circle' : 'Begin Draw Phase'}</button>`;
};

/* ---------- 6.5. Final Circle: End Game / Banish Again (secret per-player decision) ---------- */

UI.renderFinalCircleDecision = function renderFinalCircleDecision(state, tapped) {
  const player = currentQueuePlayer(state);
  if (!player) return;

  if (!tapped) {
    screen('finalCircleDecision').innerHTML = passPrompt({
      icon: ICONS.compass,
      name: player.name,
      instruction: `Hand the phone to <strong>${escapeHtml(player.name)}</strong> now and look away — this choice is private. Once ready, they tap below.`,
      action: 'tap-final-circle-decision',
      btnLabel: "I'm Ready To Decide",
      btnClass: 'btn-danger',
    });
    return;
  }

  const living = livingPlayers(state).length;
  screen('finalCircleDecision').innerHTML = `
    <div class="screen-title-row">The Final Circle</div>
    <div class="screen-subtitle">${living} remain. ${escapeHtml(player.name)}, decide in silence.</div>
    <p class="reveal-body">Choose <strong>End Game</strong> to stop here and reveal every role now, or <strong>Banish Again</strong> to force one more vote. It only takes one Banish Again among the circle to force a vote — no one will ever know who chose what.</p>
    <div class="spacer"></div>
    <button class="btn btn-confirm btn-block" data-action="choose-end-game" style="margin-bottom:10px;">End Game</button>
    <button class="btn btn-danger btn-block" data-action="choose-banish-again">Banish Again</button>
    <p class="small-note" style="margin-top:14px;">After deciding, hide your choice and pass the phone to the next player.</p>`;
};

/* ---------- 5. Card Draw ---------- */

UI.renderDraw = function renderDraw(state, tapped) {
  const player = currentQueuePlayer(state);
  if (!player) return;

  if (!tapped) {
    screen('draw').innerHTML = passPrompt({
      icon: ICONS.hourglass,
      name: player.name,
      instruction: `Hand the phone to <strong>${escapeHtml(player.name)}</strong> now, then they tap below to draw their card for this round.`,
      action: 'tap-draw',
      btnLabel: 'Draw A Card',
    });
    return;
  }

  const result = state.lastDrawResult;
  const def = result.def;
  screen('draw').innerHTML = `
    <div class="reveal-stage">
      ${cardFlip(CARD_FRAMES.back, def.symbol, 'card-lg', 'drawCard')}
      <p class="reveal-body">${result.wentToPot
        ? `<strong>${escapeHtml(player.name)}</strong> drew ${def.name} — <strong>${def.value} gold</strong> added to the Prize Pot!`
        : `<strong>${escapeHtml(player.name)}</strong> drew ${def.name} and keeps it.`}</p>
      ${result.wentToPot ? '' : meaningBlock(def.description)}
      <button class="btn btn-confirm btn-block" data-action="confirm-draw">Continue To My Hand</button>
    </div>`;
  triggerFlip('drawCard');
};

/* ---------- 6. Hand Selection ---------- */

UI.renderHand = function renderHand(state) {
  const player = currentQueuePlayer(state);
  if (!player) return;

  screen('hand').innerHTML = `
    <div class="screen-title-row">${escapeHtml(player.name)}'s Hand</div>
    <div class="screen-subtitle">Your held cards — what each one means:</div>
    <div class="hand-scroll">
      ${player.hand.length === 0 ? '<div class="hand-empty">No cards held.</div>' : player.hand.map((cardId) => {
        const def = cardDefById(cardId);
        return `<div class="hand-card-wrap">
          ${cardStatic(def.symbol)}
          <span class="hand-card-name">${def.name}</span>
          <span class="hand-card-desc">${def.description}</span>
        </div>`;
      }).join('')}
    </div>
    <div class="spacer"></div>
    <button class="btn btn-primary btn-block" data-action="continue-from-hand">Done — Pass The Phone</button>`;
};

/* ---------- 7. Night ---------- */

UI.renderNight = function renderNight(state) {
  const def = cardDefById(state.currentFateCard);
  screen('night').innerHTML = `
    <div class="reveal-stage fade-in">
      ${iconUse(ICONS.skull, 'icon icon-lg flicker')}
      <div class="pass-overlay-eyebrow">Tonight's Fate</div>
      <h2 class="reveal-headline">Murder</h2>
      <p class="reveal-body">${def.description} The phone will now pass to every living player, one at a time. Almost everyone will see an empty screen with nothing to do — that's normal and expected, not a glitch; it's what keeps the Deceiver hidden. Stay silent and don't react either way, whether you had a task or not.</p>
      <button class="btn btn-danger btn-block" data-action="proceed-to-murder">Begin The Night</button>
    </div>`;
};

/* ---------- Open Discussion (before every Banishment Vote) ---------- */

UI.renderDiscuss = function renderDiscuss(state, announced, secondsLeft) {
  const isFinal = state.finalBanishmentActive;

  // Closing beat once the clock runs out: the crescendo/voice line (if
  // sound is on) plays under this, then main.js moves on once it's done.
  // No button here on purpose — it's a timed ceremony beat, not something
  // to tap through, so the line never gets cut off mid-sentence.
  if (announced) {
    screen('discuss').innerHTML = `
      <div class="reveal-stage fade-in">
        ${iconUse(ICONS.skull, 'icon icon-lg flicker')}
        <h2 class="reveal-headline">The Time For Talk Is Over</h2>
        <p class="reveal-body">Voting begins now.</p>
      </div>`;
    return;
  }

  const mins = Math.floor(Math.max(0, secondsLeft) / 60);
  const secs = Math.max(0, secondsLeft) % 60;
  const clock = `${mins}:${String(secs).padStart(2, '0')}`;

  screen('discuss').innerHTML = `
    <div class="reveal-stage fade-in">
      ${iconUse(ICONS.vote, 'icon icon-lg')}
      <div class="pass-overlay-eyebrow">${isFinal ? 'The Final Circle' : "Tonight's Fate"}</div>
      <h2 class="reveal-headline">${isFinal ? 'The Final Circle Vote' : 'Banishment Vote'}</h2>
      <p class="reveal-body">Put the phone down in the middle of the table. This is the part where you all talk — accuse, defend, point fingers, ask questions, out loud, as a group. Nothing on this screen is private.${isFinal ? " No one's allegiance will be revealed once this vote is cast — only when the Final Circle itself ends." : ''}</p>
      <div class="prize-pot-panel" style="margin-top:6px;">
        <div><div class="prize-pot-value">${clock}</div><div class="prize-pot-label">Time Left To Discuss</div></div>
      </div>
      <p class="small-note">Voting begins automatically when the clock runs out.</p>
      <button class="btn btn-ghost btn-sm" data-action="begin-vote-now" style="margin-top:4px;">Everyone's Ready — Skip Ahead</button>
      <a class="btn btn-ghost btn-sm" href="${CONFIG.spotifyPlaylistUrl}" target="_blank" rel="noopener noreferrer" style="margin-top:8px; text-decoration:none;">${iconUse(ICONS.sound, 'icon-sm')} Open Our Playlist In Spotify</a>
    </div>`;
};

/* ---------- 8. Murder Selection (every player takes a turn) ---------- */

UI.renderMurder = function renderMurder(state, tapped, selectedId, useChoice) {
  const player = currentQueuePlayer(state);
  if (!player) return;

  if (!tapped) {
    screen('murder').innerHTML = passPrompt({
      icon: ICONS.candle,
      name: player.name,
      instruction: `Hand the phone to <strong>${escapeHtml(player.name)}</strong> now. No talking. Once ready, they tap below.`,
      action: 'tap-murder-turn',
      btnLabel: 'My Turn',
      btnClass: 'btn-danger',
    });
    return;
  }

  if (!isActingDeceiverTurn(state)) {
    screen('murder').innerHTML = `
      <div class="reveal-stage">
        ${iconUse(ICONS.candle, 'icon icon-lg flicker')}
        <h2 class="reveal-headline">Nothing To Do</h2>
        <p class="reveal-body">There's no task for you this turn. Hide the screen and pass the phone to the next player.</p>
        <button class="btn btn-confirm btn-block" data-action="confirm-murder-turn">Continue</button>
      </div>`;
    return;
  }

  const targets = eligibleMurderTargets(state);
  const canUseChoice = actingDeceiverHoldsChoiceCard(state);
  screen('murder').innerHTML = `
    <div class="screen-title-row">Choose A Victim</div>
    <div class="screen-subtitle">Deceivers, select tonight's target in silence.</div>
    <div class="target-grid">
      ${targets.map((p) => `
        <button class="target-card ${selectedId === p.id ? 'selected' : ''}" data-action="select-murder-target" data-id="${p.id}">
          <div class="player-avatar">${initials(p.name)}</div>
          <span>${escapeHtml(p.name)}</span>
        </button>`).join('')}
    </div>
    ${canUseChoice ? `
      <label class="rule-row" style="margin-top:16px;">
        <input type="checkbox" id="dcToggle" ${useChoice ? 'checked' : ''}>
        <span>Play Deceiver's Choice — cancel a Shield in play</span>
      </label>` : ''}
    <p class="small-note" style="margin-top:14px;">Once confirmed, hide the screen and pass the phone to the next player like everyone else.</p>
    <div class="spacer"></div>
    <button class="btn btn-danger btn-block" data-action="confirm-murder-turn" ${selectedId ? '' : 'disabled'}>Confirm Target</button>`;

  if (canUseChoice) {
    document.getElementById('dcToggle').addEventListener('change', (e) => {
      main_onToggleDeceiversChoice(e.target.checked);
    });
  }
};

/* ---------- 8.5. Recruit or Die (a private two-player exchange, never a
   public event — see engine.js's "Recruit or Die" section) ---------- */

UI.renderRecruit = function renderRecruit(state, tapped, selectedId) {
  const player = currentQueuePlayer(state);
  if (!player) return;

  if (!tapped) {
    screen('recruit').innerHTML = passPrompt({
      icon: ICONS.hoodedFigure,
      name: player.name,
      instruction: `Hand the phone to <strong>${escapeHtml(player.name)}</strong> now. No talking. Once ready, they tap below.`,
      action: 'tap-recruit',
      btnLabel: 'My Turn',
      btnClass: 'btn-danger',
    });
    return;
  }

  const targets = eligibleRecruitTargets(state);
  screen('recruit').innerHTML = `
    <div class="screen-title-row">Recruit Or Die</div>
    <div class="screen-subtitle">Choose one Loyal player to secretly approach.</div>
    <div class="target-grid">
      ${targets.map((p) => `
        <button class="target-card ${selectedId === p.id ? 'selected' : ''}" data-action="select-recruit-target" data-id="${p.id}">
          <div class="player-avatar">${initials(p.name)}</div>
          <span>${escapeHtml(p.name)}</span>
        </button>`).join('')}
    </div>
    <p class="small-note" style="margin-top:14px;">If they refuse, they will not survive the night. Once confirmed, hide the screen and pass the phone directly to them — no one else.</p>
    <div class="spacer"></div>
    <button class="btn btn-danger btn-block" data-action="confirm-recruit-target" ${selectedId ? '' : 'disabled'}>Confirm Choice</button>`;
};

UI.renderRecruitResponse = function renderRecruitResponse(state, tapped) {
  const player = currentQueuePlayer(state);
  if (!player) return;

  if (!tapped) {
    screen('recruitResponse').innerHTML = passPrompt({
      icon: ICONS.hoodedFigure,
      name: player.name,
      instruction: `Hand the phone to <strong>${escapeHtml(player.name)}</strong> now and look away — no one else should see this screen. Once it's in their hands, they tap below.`,
      action: 'tap-recruit-response',
      btnLabel: 'My Turn',
    });
    return;
  }

  screen('recruitResponse').innerHTML = `
    <div class="reveal-stage">
      ${iconUse(ICONS.hoodedFigure, 'icon icon-lg')}
      <h2 class="reveal-headline">A Deceiver Has Approached You</h2>
      <p class="reveal-body">In secret, one of the Deceivers offers you a place among them. Choose now — no one else will ever know this moment happened.</p>
      <div class="spacer"></div>
      <button class="btn btn-confirm btn-block" data-action="recruit-join" style="margin-bottom:10px;">Join Us</button>
      <button class="btn btn-danger btn-block" data-action="recruit-refuse">Refuse</button>
      <p class="small-note" style="margin-top:14px;">Refusing has a cost. Hide the screen and pass the phone back once you've chosen.</p>
    </div>`;
};

/* ---------- 9. Banishment Vote / Final Banishment ---------- */

UI.renderVote = function renderVote(state, tapped, selectedId, useDagger) {
  const isFinal = state.finalBanishmentActive;
  const voter = currentQueuePlayer(state);
  if (!voter) return;
  const container = isFinal ? screen('finalBanishment') : screen('vote');

  if (!tapped) {
    container.innerHTML = passPrompt({
      icon: ICONS.vote,
      name: voter.name,
      instruction: `Hand the phone to <strong>${escapeHtml(voter.name)}</strong> now and look away — votes are private. ${isFinal ? "No one's allegiance will be revealed when this vote is cast; once ready, they tap below." : 'Once ready, they tap below to vote.'}`,
      action: 'tap-vote',
      btnLabel: "I'm Ready To Vote",
      btnClass: isFinal ? 'btn-danger' : 'btn-primary',
    });
    return;
  }

  const targets = eligibleVoteTargets(state, voter.id);
  const hasDagger = voter.hand.includes('dagger');
  container.innerHTML = `
    <div class="screen-title-row">${isFinal ? 'The Final Circle Vote' : 'Banishment Vote'}</div>
    <div class="screen-subtitle">${escapeHtml(voter.name)}, choose who to banish.</div>
    <div class="target-grid">
      ${targets.map((p) => `
        <button class="target-card ${selectedId === p.id ? 'selected' : ''}" data-action="select-vote-target" data-id="${p.id}">
          <div class="player-avatar">${initials(p.name)}</div>
          <span>${escapeHtml(p.name)}</span>
        </button>`).join('')}
    </div>
    ${hasDagger ? `
      <label class="rule-row" style="margin-top:16px;">
        <input type="checkbox" id="daggerToggle" ${useDagger ? 'checked' : ''}>
        <span>Play Dagger — +1 vote weight</span>
      </label>` : ''}
    <p class="small-note" style="margin-top:14px;">After casting, hide your choice and pass the phone to the next voter.</p>
    <div class="spacer"></div>
    <button class="btn ${isFinal ? 'btn-danger' : 'btn-confirm'} btn-block" data-action="confirm-vote" ${selectedId ? '' : 'disabled'}>Cast Vote</button>`;

  if (hasDagger) {
    document.getElementById('daggerToggle').addEventListener('change', (e) => {
      main_onToggleDagger(e.target.checked);
    });
  }
};

/* ---------- 10. Elimination Reveal ---------- */

UI.renderElimination = function renderElimination(state, revealed) {
  const context = state.eliminationContext;

  // Stage 1: an unmissable, unambiguous "everyone needs to see this" beat —
  // distinct from every private per-player turn that came before it — before
  // the actual outcome is shown.
  if (!revealed) {
    const eventLabel = context === 'quiet' ? 'the night' : context === 'night' ? 'the night' : 'the vote';
    screen('elimination').innerHTML = `
      <div class="reveal-stage fade-in">
        ${iconUse(ICONS.compass, 'icon icon-lg')}
        <div class="pass-overlay-eyebrow">Gather Everyone</div>
        <h2 class="reveal-headline">The Circle Must See This</h2>
        <p class="reveal-body">Bring the phone to the middle of the table. Everyone should be watching — no side conversations, no looking away — before ${eventLabel}'s outcome is shown.</p>
        <button class="btn btn-confirm btn-block" data-action="reveal-elimination">Reveal What Happened</button>
      </div>`;
    return;
  }

  let body = '';

  if (context === 'quiet') {
    body = `
      <div class="reveal-stage">
        ${iconUse(ICONS.candle, 'icon icon-lg flicker')}
        <h2 class="reveal-headline">A Quiet Night</h2>
        <p class="reveal-body">No blade was drawn. The circle wakes unharmed.</p>
        <button class="btn btn-confirm btn-block" data-action="continue-elimination">Continue</button>
      </div>`;
  } else if (context === 'night') {
    const r = state.nightResult;
    if (r.protected) {
      body = `
        <div class="reveal-stage">
          ${iconUse(ICONS.shield, 'icon icon-lg')}
          <h2 class="reveal-headline">${escapeHtml(r.name)} Was Targeted</h2>
          <p class="reveal-body">A Shield protected them. They survive the night.</p>
          <button class="btn btn-confirm btn-block" data-action="continue-elimination">Continue</button>
        </div>`;
    } else {
      const victim = findPlayer(state, r.targetId);
      const role = victim.role === ROLES.DECEIVER.id ? ROLES.DECEIVER : ROLES.LOYAL;
      body = `
        <div class="reveal-stage">
          ${iconUse(ICONS.skull, 'icon icon-lg')}
          <h2 class="reveal-headline">${escapeHtml(r.name)} Was Murdered</h2>
          ${cardFlip(CARD_FRAMES.back, role.symbol, '', 'elimCard')}
          <p class="reveal-body">They were... <strong>${role.label}</strong>.</p>
          <button class="btn btn-confirm btn-block" data-action="continue-elimination">Continue</button>
        </div>`;
    }
  } else if (context === 'final') {
    // Final Circle banishment: same ceremony, but allegiance stays hidden
    // — see engine.js's "Final Circle" section. No cardFlip, no role line.
    const v = state.voteResult;
    if (v.tie || !v.banishedId) {
      body = `
        <div class="reveal-stage">
          ${iconUse(ICONS.vote, 'icon icon-lg')}
          <h2 class="reveal-headline">The Vote Is Tied</h2>
          <p class="reveal-body">No one is banished this round.</p>
          <button class="btn btn-confirm btn-block" data-action="continue-elimination">Continue</button>
        </div>`;
    } else {
      const banished = findPlayer(state, v.banishedId);
      body = `
        <div class="reveal-stage">
          ${iconUse(ICONS.vote, 'icon icon-lg')}
          <h2 class="reveal-headline">${escapeHtml(banished.name)} Is Banished</h2>
          <p class="reveal-body">Their allegiance stays hidden — for now.</p>
          <button class="btn btn-confirm btn-block" data-action="continue-elimination">Continue</button>
        </div>`;
    }
  } else {
    const v = state.voteResult;
    if (v.tie || !v.banishedId) {
      body = `
        <div class="reveal-stage">
          ${iconUse(ICONS.vote, 'icon icon-lg')}
          <h2 class="reveal-headline">The Vote Is Tied</h2>
          <p class="reveal-body">No one is banished this round.</p>
          <button class="btn btn-confirm btn-block" data-action="continue-elimination">Continue</button>
        </div>`;
    } else {
      const banished = findPlayer(state, v.banishedId);
      const role = banished.role === ROLES.DECEIVER.id ? ROLES.DECEIVER : ROLES.LOYAL;
      body = `
        <div class="reveal-stage">
          ${iconUse(ICONS.vote, 'icon icon-lg')}
          <h2 class="reveal-headline">${escapeHtml(banished.name)} Is Banished</h2>
          ${cardFlip(CARD_FRAMES.back, role.symbol, '', 'elimCard')}
          <p class="reveal-body">They were... <strong>${role.label}</strong>.</p>
          <button class="btn btn-confirm btn-block" data-action="continue-elimination">Continue</button>
        </div>`;
    }
  }

  screen('elimination').innerHTML = body;
  triggerFlip('elimCard');
};

/* ---------- 12. Results ---------- */

UI.renderResults = function renderResults(state) {
  const winnerRole = state.winner === ROLES.DECEIVER.id ? ROLES.DECEIVER : ROLES.LOYAL;
  const payout = state.gamePayout || { pot: 0, share: 0, recipients: [] };
  const isLastGame = state.seriesGame >= state.seriesLength;
  const seriesActive = state.seriesLength > 1;

  const payoutLine = payout.recipients.length
    ? `<strong>${payout.recipients.map(escapeHtml).join(', ')}</strong> ${payout.recipients.length > 1 ? 'each get' : 'gets'} <strong>${payout.share} gold</strong>${winnerRole === ROLES.LOYAL ? ' — their share of the pot.' : ' — the whole pot, Deceivers take all.'}`
    : 'No one survived to claim the pot.';

  const leaderboard = Object.entries(state.seriesScores).sort((a, b) => b[1] - a[1]);

  screen('results').innerHTML = `
    <div class="winner-banner scale-in">
      <h2>${winnerRole === ROLES.DECEIVER ? 'The Deceivers Win' : 'The Loyal Prevail'}</h2>
      <p class="small-note">${winnerRole === ROLES.DECEIVER
        ? (state.finalCircleActive
          ? 'A Deceiver was hiding among the survivors all along. The circle is theirs.'
          : 'The Deceivers now equal or outnumber the Loyal. The circle is theirs.')
        : 'Every Deceiver has been cast out. The circle is safe.'}</p>
    </div>
    <div class="prize-pot-panel">
      ${iconUse(ICONS.coin, 'icon icon-lg')}
      <div><div class="prize-pot-value">${payout.pot}</div><div class="prize-pot-label">This Game's Prize Pot</div></div>
      ${iconUse(ICONS.coin, 'icon icon-lg')}
    </div>
    <p class="small-note" style="margin-top:10px;">${payoutLine}</p>
    <div class="panel-title" style="margin-top:16px;">Every Role Revealed</div>
    <div class="role-reveal-list">
      ${state.players.map((p) => `
        <div class="role-reveal-row ${p.role}">
          <div class="player-avatar">${initials(p.name)}</div>
          <div style="flex:1;">
            <div>${escapeHtml(p.name)} ${p.isComputer ? '<span class="small-note">(Computer)</span>' : ''} ${!p.alive ? '<span class="small-note">(eliminated)</span>' : ''}</div>
            <div class="player-meta">${p.role === ROLES.DECEIVER.id ? ROLES.DECEIVER.label : ROLES.LOYAL.label}</div>
          </div>
        </div>`).join('')}
    </div>
    ${seriesActive ? `
      <div class="panel-title" style="margin-top:16px;">Series Standings — Game ${state.seriesGame} of ${state.seriesLength}</div>
      <div class="role-reveal-list">
        ${leaderboard.map(([name, score], i) => `
          <div class="role-reveal-row" style="border-left-color:${i === 0 ? 'var(--gold-400)' : 'var(--gold-700)'};">
            <div class="player-avatar">${initials(name)}</div>
            <div style="flex:1;">${escapeHtml(name)}</div>
            <strong style="color:var(--gold-300);">${score}</strong>
          </div>`).join('')}
      </div>` : ''}
    <div class="spacer"></div>
    ${isLastGame
      ? `${seriesActive ? '<p class="small-note" style="margin-bottom:10px;">The series is complete.</p>' : ''}<button class="btn btn-primary btn-block" data-action="play-again">${seriesActive ? 'New Series' : 'Play Again'}</button>`
      : `<button class="btn btn-primary btn-block" data-action="next-game-in-series">Next Game (${state.seriesGame + 1} of ${state.seriesLength})</button>`}`;
};

/* ---------- Modal (Help / Settings) ---------- */

UI.showModal = function showModal(title, bodyHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.remove('hidden');
};

UI.hideModal = function hideModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
};

/* ---------- Interstitials (brief fullscreen transition cards) ----------
   Shown between major phases — see main.js's interstitialPending for the
   full list of trigger points. Deliberately NOT used for Recruit or Die
   (a strictly private, two-player event with no public announcement of
   any kind) or for a Quiet Night (no asset exists for it; an uneventful
   night is meant to read as uneventful, not get its own title card). */
const INTERSTITIAL_IMAGES = {
  reveal: 'assets/brand/interstitials/reveal.jpg',
  draw: 'assets/brand/interstitials/draw.jpg',
  'night-falls': 'assets/brand/interstitials/night-falls.jpg',
  murder: 'assets/brand/interstitials/murder.jpg',
  banishment: 'assets/brand/interstitials/banishment.jpg',
  'final-circle': 'assets/brand/interstitials/final-circle.jpg',
  'end-game': 'assets/brand/interstitials/end-game.jpg',
  'banish-again': 'assets/brand/interstitials/banish-again.jpg',
  'final-two': 'assets/brand/interstitials/final-two.jpg',
  'loyal-win': 'assets/brand/interstitials/loyal-win.jpg',
  'deceiver-win': 'assets/brand/interstitials/deceiver-win.jpg',
};
const INTERSTITIAL_DURATION_MS = 1700;
let interstitialDismissTimer = null;

/* Shows the named interstitial, then calls onComplete either once the
   timer elapses or the moment it's tapped (whichever comes first) — a
   brief cinematic beat, never something the game waits long on. If the
   key is unrecognized, resolves immediately with no visual at all rather
   than risk ever getting stuck on a blank overlay. */
UI.showInterstitial = function showInterstitial(key, onComplete) {
  const src = INTERSTITIAL_IMAGES[key];
  const overlay = document.getElementById('interstitialOverlay');
  const img = document.getElementById('interstitialImg');
  if (!src || !overlay || !img) {
    if (onComplete) onComplete();
    return;
  }
  img.src = src;
  overlay.classList.remove('hidden');

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(interstitialDismissTimer);
    overlay.removeEventListener('click', finish);
    overlay.classList.add('hidden');
    if (onComplete) onComplete();
  };
  overlay.addEventListener('click', finish, { once: true });
  interstitialDismissTimer = setTimeout(finish, INTERSTITIAL_DURATION_MS);
};

UI.helpContent = function helpContent() {
  return `
    <p><strong>One phone, a group of friends — some of you are secretly Deceivers.</strong> Everyone else is Loyal. Loyal wins by rooting out every Deceiver; Deceivers win by staying hidden until they equal or outnumber whoever's left.</p>
    <p>${CONFIG.minPlayers}–${CONFIG.maxPlayers} players, one shared phone passed hand to hand, no app to install. A game runs about 15–25 minutes, start to finish.</p>
    <p>Each round, everyone draws a card, then something happens — a quiet night, a secret murder, or a vote to banish someone — and the whole table gathers to watch the outcome together. Play continues round after round until one side wins.</p>
    <p>The Loyal win when every Deceiver is gone. The Deceivers win once they equal or outnumber the Loyal. Whoever wins splits that game's Prize Pot among themselves — if the Loyal win, the surviving Loyal split it; if the Deceivers win, the surviving Deceivers take the whole thing. Anyone already eliminated gets nothing.</p>
    <div class="panel-title" style="margin-top:4px;">What the cards do</div>
    <div class="rule-row">${iconUse(ICONS.coin, 'icon')}<span>Gold cards fill the shared Prize Pot.</span></div>
    <div class="rule-row">${iconUse(ICONS.shield, 'icon')}<span>A held Shield protects you automatically if targeted — no action needed — then it's spent.</span></div>
    <div class="rule-row">${iconUse(ICONS.dagger, 'icon')}<span>Dagger adds +1 weight to your Banishment vote.</span></div>
    <div class="rule-row">${iconUse(ICONS.hoodedFigure, 'icon')}<span>Deceiver's Choice cancels a Shield at Night.</span></div>
    <div class="rule-row">${iconUse(ICONS.skull, 'icon')}<span>On a Murder round, the Deceivers pick a victim in secret.</span></div>
    <div class="rule-row">${iconUse(ICONS.vote, 'icon')}<span>Every living player votes to banish a suspect.</span></div>
    <p>Play a series of several games back to back and points carry across every game — set how many on the setup screen.</p>
    <p>Pass the phone honestly and don't peek — the ceremony depends on trust.</p>`;
};

UI.settingsContent = function settingsContent(state) {
  return `
    <div class="rule-row">
      <label style="display:flex;align-items:center;gap:10px;width:100%;">
        <input type="checkbox" id="soundToggle" ${state.settings.sound ? 'checked' : ''}>
        <span>Sound effects</span>
      </label>
    </div>
    <div class="rule-row">
      <label style="display:flex;align-items:center;gap:10px;width:100%;">
        <input type="checkbox" id="musicToggle" ${state.settings.music ? 'checked' : ''}>
        <span>Background music during discussion</span>
      </label>
    </div>
    <a class="btn btn-ghost btn-sm btn-block" href="${CONFIG.spotifyPlaylistUrl}" target="_blank" rel="noopener noreferrer" style="margin-top:10px; text-decoration:none;">${iconUse(ICONS.sound, 'icon-sm')} Open Our Playlist In Spotify</a>
    <button class="btn btn-danger btn-block" data-action="reset-game" style="margin-top:14px;">Reset Game</button>`;
};

/* ---------- Toast ---------- */

UI.showToast = function showToast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  void el.offsetWidth;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  setTimeout(() => el.classList.add('hidden'), 2200);
};

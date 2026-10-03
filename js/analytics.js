/* ==========================================================================
   THE DECEIVERS — Analytics
   A single, anonymous, fire-and-forget hit counter: two counts only, "a
   game started" and "a game finished" (reached Results). No cookies, no
   IDs, no personal data, nothing about who played or what happened in the
   game — just two running totals, visible to anyone at the URLs below.

   Uses the free, no-signup CountAPI hit endpoint (https://countapi.xyz).
   This is the app's first-ever outbound network call; everything else is
   fully offline. If the request fails (offline, API down, blocked by a
   browser/network) it's silently swallowed — stats are a nice-to-have,
   never a dependency for playing the game.
   ========================================================================== */

const Analytics = (() => {
  const NAMESPACE = 'mancave-deceivers';
  const ENDPOINT = 'https://api.countapi.xyz/hit';

  function ping(key) {
    try {
      if (typeof fetch !== 'function') return;
      fetch(`${ENDPOINT}/${NAMESPACE}/${key}`, { method: 'GET', mode: 'cors' }).catch(() => {});
    } catch (e) {
      /* ignore — never let a stats ping affect gameplay */
    }
  }

  return {
    gameStarted: () => ping('game-started'),
    gameFinished: () => ping('game-finished'),
  };
})();

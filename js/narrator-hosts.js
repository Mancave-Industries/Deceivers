/* Static narrator assets: no provider credentials, SDK or live API calls. */
const NarratorHosts = (() => {
  const hosts = [{"id": "david", "label": "David", "avatar": "assets/brand/narrators/david-setup.webp", "opening": "assets/audio/hosts/david/opening/opening_002.mp3"}, {"id": "victor", "label": "Victor", "avatar": "assets/brand/narrators/victor-setup.webp", "opening": "assets/audio/hosts/victor/opening/opening_002.mp3"}, {"id": "aaron", "label": "Aaron", "avatar": "assets/brand/narrators/aaron-setup.webp", "opening": "assets/audio/hosts/aaron/opening/opening_002.mp3"}, {"id": "beth", "label": "Beth", "avatar": "assets/brand/narrators/beth-setup.webp", "opening": "assets/audio/hosts/beth/opening/opening_002.mp3"}, {"id": "lily", "label": "Lily", "avatar": "assets/brand/narrators/lily-setup.webp", "opening": "assets/audio/hosts/lily/opening/opening_002.mp3"}, {"id": "charlotte", "label": "Charlotte", "avatar": "assets/brand/narrators/charlotte-setup.webp", "opening": "assets/audio/hosts/charlotte/opening/opening_002.mp3"}];
  let preview = null;
  let revision = 0;
  function find(id) { return hosts.find(h => h.id === id); }
  function stopPreview() {
    revision++;
    if (preview) { preview.pause(); preview.removeAttribute('src'); preview.load(); preview = null; }
  }
  function previewHost(id, report) {
    stopPreview();
    const host = find(id);
    if (!host) return;
    const epoch = revision;
    const current = preview = new Audio(host.opening);
    report('Playing ' + host.label + '…');
    const finish = text => { if (epoch === revision) { stopPreview(); report(text); } };
    current.onended = () => finish('Preview finished.');
    current.onerror = () => finish('Preview unavailable. Try again.');
    const attempt = current.play();
    if (attempt && attempt.catch) attempt.catch(() => finish('Tap Hear to try the preview again.'));
  }
  function openingKey(id) { return find(id) ? 'host:' + id + ':opening_002' : null; }
  function clipUrl(key) {
    const match = /^host:([a-z]+):opening_002$/.exec(key);
    const host = match && find(match[1]);
    return host ? host.opening : null;
  }
  window.addEventListener('pagehide', stopPreview);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPreview(); });
  return { hosts, find, stopPreview, previewHost, openingKey, clipUrl };
})();

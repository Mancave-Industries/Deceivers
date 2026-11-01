# The Deceivers — six-host audio production

> **Latest script review:** see [SCRIPT_REVIEW.md](SCRIPT_REVIEW.md). The original 276-line catalogue remains preserved. The reviewed candidate has 289 lines: 174 mapped to current public pools, 115 held. It proposes 1,036 further recordings at an estimated 45,696 credits, reusing all eight existing takes. This supersedes earlier full-catalogue/small-batch recording recommendations below; no recording is authorised by this review.


**Feature branch:** `feature/six-host-voice-assets-20261101`
**Status:** Eight existing MP3s committed and read back byte for byte from GitHub at commit 277986e6022dd4e29b799b8ea786d0b9a503c166. Listening review is pending. PR #14 remains a draft. No new speech, merge or deployment. The draft now includes a setup chooser and public opening greeting integration.

## Catalogue and imported audio

The original 276 scripts, 16 categories, six identities and 1,656 planned paths are preserved. Eight actual MP3s are included:

| Host | Clip | Path |
| --- | --- | --- |
| David | opening_002 | assets/audio/hosts/david/opening/opening_002.mp3 |
| Victor | opening_002 | assets/audio/hosts/victor/opening/opening_002.mp3 |
| Aaron | opening_002 | assets/audio/hosts/aaron/opening/opening_002.mp3 |
| Beth | opening_002 | assets/audio/hosts/beth/opening/opening_002.mp3 |
| Lily | opening_002 | assets/audio/hosts/lily/opening/opening_002.mp3 |
| Charlotte | opening_002 | assets/audio/hosts/charlotte/opening/opening_002.mp3 |
| David | gather_006 | assets/audio/hosts/david/gather/gather_006.mp3 |
| David | murder_reveal_018 | assets/audio/hosts/david/murder_reveal/murder_reveal_018.mp3 |

`imported_assets.json` records canonical path, SHA-256, Git blob ID, size, codec, duration, sample rate, channel count, exact provider voice and script, Flow/session/generation IDs, and provider-linked History ID. It distinguishes technical verification from listening approval. No re-encoding or loudness change was made.

## Repeatable workflow

Run with Python 3.10+ and ffmpeg/ffprobe. No Python packages are required.

```bash
python voice-production/asset_checks.py
python -m unittest discover -s voice-production -p 'test_*.py'
python voice-production/plan_batch.py
python voice-production/import_existing.py
```

The last command is a dry run. Already imported recordings are decoded and checked against their receipts, then skipped without network access or credentials. Changed, corrupt, missing or unreceipted existing files block the import; they are never overwritten or regenerated. Downloads use a temporary file, undergo full decoding, and receive a durable receipt after each successful import.

For missing audio, the importer uses exact History IDs first; fallback search explicitly includes `source=Flows`. Authentication failures and incomplete searches are failures, never proof that audio is absent. It only issues GET requests to existing-audio endpoints.

If the API is unavailable, call the connected `creative_get_flow_run_status` once for each recorded Flow/session. Extract the matching completed generation and voice metadata into a **private JSON outside the repository**. An export entry contains `host_id`, `clip_id`, `flow_id`, `session_id`, `generation_id`, `history_item_id`, `status`, `voice_id`, `prompt`, `model_id`, and the temporary `download_url`.

```bash
python voice-production/import_existing.py --flow-exports-json /private/path/flow_exports.json
python voice-production/import_existing.py --flow-exports-json /private/path/flow_exports.json --execute
```

Signed URLs expire; refresh metadata rather than generating another take. Never commit export JSON, key values or signed URLs. The importer checks the exact Flow/session/generation, voice and normalised script before download. It never forwards API credentials to export storage.

After a binary commit, read each MP3 back from GitHub as base64 at the exact commit, compare it with the validated file, and record the commit/blob in the receipt. Only then set `import_status=github_binary_verified`. A catalogue entry, URL or successful generation alone is not an uploaded MP3.

## Next controlled production step

`next_batch.json` proposes **six files, one take per host**, all reading:

> Pass the phone along. Nothing to see here.

Total script length: 252 characters. The proposal records the six voice IDs, exact paths, a payload hash and the observed Creative Flow model `eleven_v4`. This is the model returned by the existing Flow, not a claim about REST model availability. Six estimate-only calls prepared the proposed Flow nodes; the provider quoted **252 credits / 2.52 US cents total**. `batch_quote.json` holds the exact quote and node references. Nothing was generated or charged. No generation command or paid workflow is implemented or scheduled.

Before spending: review the existing auditions, check History for these exact voice/script pairs, obtain a current quote and spend cap, and get separate user approval for the hashed batch. Use `generations_count=1`; do not accept a tool's four-take default. Record source IDs immediately and never automatically retry an uncertain or charged request. Import and verify the completed batch with the same checks.

The integrity workflow checks MP3s, receipts and duplicate-prevention regressions without ElevenLabs credentials or generation calls. After a batch is completed, replace the proposal with the next separately reviewed batch; the planner deliberately rejects its own targets once they are recorded as generated/imported.

## Secret investigation

Observed on 1 November 2026:

- This execution environment has no `ELEVENLABS_API_KEY`; it is not the user's Codespace.
- The GitHub connector cannot inspect Codespaces secrets, selected repositories or Codespace lifecycle.
- The browser opens GitHub's sign-in page, so actual secret scope and Codespace state remain **unverified**.
- All eight Flow results expose provider History links. These IDs are recorded, but direct History API enumeration was not possible here. The binaries were recovered through authenticated connector exports instead.

For an account-level Codespaces secret, Deceivers must be selected as an allowed repository. GitHub documents that an already running Codespace must be **stopped and restarted** after a secret is created; reopening a terminal alone does not apply the change. Check presence with a boolean only, then make a read-only History request. Do not print the key, export the key into a repository file, or ask for it in chat. Codespaces secrets are not automatically GitHub Actions secrets; this integrity workflow needs neither.

References: [GitHub Codespaces secrets](https://docs.github.com/en/codespaces/managing-your-codespaces/managing-your-account-specific-secrets-for-github-codespaces), [stopping and starting a Codespace](https://docs.github.com/en/codespaces/developing-in-a-codespace/stopping-and-starting-a-codespace), [ElevenLabs History including Flows](https://elevenlabs.io/docs/api-reference/history/list), [existing History audio](https://elevenlabs.io/docs/api-reference/history/get-audio).

## Future offline host selection and secrecy contract

The draft setup chooser displays all six named portraits, offers explicit voice previews, and saves the selected host. Only `intro1`, the public greeting before private roles, uses the selected host. Original lines 02–03 still explain the rules, and the original narrator supplies every other event. Missing opening audio falls back to the legacy greeting. The original 39-line manifest and assets remain intact. Full voice-pack replacement and additional event mapping remain future work.

Preview playback stops before starting a game, on leaving setup, when another preview starts, and when the page is hidden. Portraits are 512px WebP files, about 60–66 KB each. Five targeted regression tests cover host greetings, rules retention, missing-file fallback, handoff/night request equivalence and preview overlap. Desktop Chromium preview confirmed the six portraits, selection and successful audio preview; Safari verification remains outstanding.

- Persist a public host ID selected in Settings; use only static catalogue paths during play. No ElevenLabs keys, SDK or API calls belong in the game.
- Preserve the legacy narrator as a complete fallback. Eight audition files cannot replace 39 functional lines; do not offer incomplete packs as complete.
- Resolve files by host and public event only. Asset choice, request order, count, playback and delays during public handoffs must be identical across hidden roles and private actions.
- The current generic `handoff` pool is collected by `collectHandoffNarration()` for every queued player. Replace it only as a whole public pool; no role-specific branch, extra click, secret-action cue or network prefetch.
- `gather_006` is for the public gather screen. `murder_reveal_018` is only eligible after the public murder outcome is established. Do not use murder lines for quiet or protected nights.
- Role-specific banishment lines require a completed public role reveal. Victory narration requires the actual public winner. `secret_action` and recruitment-specific categories are blocked pending an explicit secrecy review.
- Before integration approval, run matched-role observable-equivalence tests across Murder, Recruit-or-Die and Final Circle queues, plus iOS Safari autoplay, preload, interrupted playback, missing-file and offline/fallback checks.

PR #4 is an unrelated inactive proposal and remains untouched.

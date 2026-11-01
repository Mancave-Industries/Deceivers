# Deceivers voice production status — 1 November 2026

Eight existing MP3s are committed on `feature/six-host-voice-assets-20261101` in [277986e](https://github.com/Mancave-Industries/Deceivers/commit/277986e6022dd4e29b799b8ea786d0b9a503c166). Each was downloaded from a completed ElevenLabs Flow, fully decoded with ffmpeg, checked with ffprobe, then fetched back from GitHub at that exact commit as base64 and compared byte for byte. All eight match.

| Host | Catalogue clip | Bytes | Duration (s) | SHA-256 |
| --- | --- | ---: | ---: | --- |
| aaron | opening_002 | 151333 | 8.359 | `85350a7ad5383d3d03a0c48ff4bc83dfe0343f3d140dcdfb4d95f1584092c0d5` |
| beth | opening_002 | 138377 | 7.549 | `3599f8c6194efebbd10dea39d20a3f9c459950ad83f379c18d558a63f7894b95` |
| charlotte | opening_002 | 145064 | 7.967 | `537dde87a131bd96e351917311ede602888d911754c5e3a1cbf7d382d08f77ff` |
| david | gather_006 | 84878 | 4.206 | `f7124cd5664a2d569b496147be8b505b04d004d6e1cee3683d68ffc5c952c29c` |
| david | murder_reveal_018 | 78191 | 3.788 | `e5bf7de34ce7086f668795b08ba36f08c5369213a6efb0eba390923739e39e96` |
| david | opening_002 | 139631 | 7.628 | `79cf5d096785be25be4707b1772721bb0fdf0211f5239366a4bd62e0f091d530` |
| lily | opening_002 | 147572 | 8.124 | `375c00b653ce2afa14940ce4f18c4ad02e5aff5d7e943770ff1bf4e160743d2f` |
| victor | opening_002 | 143810 | 7.889 | `0105b6e19b54189c88e0d8dc08ac4d3c989feba73a0f773889e30a67d34e78a8` |

Total: **1,028,856 bytes**. Every file is MP3, 44.1 kHz, mono. Paths are listed in the README; full technical and provider provenance is in `imported_assets.json`. Human listening/creative approval remains pending. Original MP3 bytes are preserved.

## Committed production support

- Exact Flow, session, generation and provider-linked History IDs for all eight clips, including the recovered David gathering generation ID.
- Receipt validation, full MP3 decoding, script/voice identity checks and SHA-256/Git blob checks.
- GET-only importer with History IDs and private Flow-export fallback, dry-run default, no overwrite, per-file receipts and no TTS synthesis.
- Re-import checks verify the actual files and make no network requests for already imported audio.
- Automated GitHub integrity workflow and 11 production-safety regression tests.
- A hashed six-file handoff batch proposal plus six estimate-only prepared Flow nodes. Provider quote: **252 credits / 2.52 US cents total**; nothing generated or charged.

## Remaining work

1. Listen to and approve or reject the eight imported takes. Technical verification does not imply creative approval.
2. The next proposed batch is `anonymous_handoff_001` once for each of David, Victor, Aaron, Beth, Lily and Charlotte: **“Pass the phone along. Nothing to see here.”** Check History for existing matches, refresh the quote if necessary, then obtain separate paid-batch approval with a spend cap before running any prepared node.
3. Register each future completed take in the generated-recording ledger, then import and verify it using the same pipeline. Never auto-retry a generation if its outcome is uncertain.
4. **1,648 of 1,656 planned MP3 files remain unproduced/unimported in this catalogue.** No full-library generation is scheduled or approved.
5. Develop and validate a separate offline host picker and explicit public-event mapping. Preserve the current 39-line narrator until packs are complete enough for a tested fallback strategy.
6. Run role-equivalence and Safari playback tests before integration approval. Only the public opening greeting is integrated in this draft; no Safari testing or full voice-pack replacement is claimed.

## Codespaces secret investigation

Actual secret repository scope and the old Codespace's environment remain **unverified**: the connector has no Codespaces secret/lifecycle capability and the browser is signed out of GitHub. This local execution environment is not the Codespace and has no ElevenLabs key. No secret value was retrieved or exposed.

GitHub's documented requirements are selected-repository access for account-level secrets and stopping/restarting an existing Codespace after adding a secret. A terminal reopen alone is insufficient. This is a documented recovery path, not confirmation that a restart has occurred. No Codespace was created or restarted here.

All eight Flow responses provide individual History links, so the History IDs are recoverable. Direct History API enumeration/authentication was not performed; the successful import used existing Flow exports through the connector.

## Validation and boundaries

The asset checks and 11 production-safety tests pass locally; the existing engine rule suite also passes all 10 tests. GitHub Actions is the authoritative source for current CI status. The original 39-line narration manifest/audio, source scripts and voice identities are unchanged. A subsequent draft revision adds a setup chooser with six portraits, explicit previews, a saved host setting, and replacement of the public opening greeting only; all remaining narration uses the original voice. Five additional narrator-picker tests pass. Safari and the existing full narration CI must pass before rollout.

PR #14 remains draft/open. No merge, deployment, paid audio generation or live ElevenLabs API integration occurred. PR #4 remains untouched.

# The Deceivers — six-host voice asset import (review branch)

**Branch:** `feature/six-host-voice-assets-20261101`  
**Status:** PREPARATION ONLY. No new audio assets have been committed to GitHub. No gameplay, existing narrator, deployment, or live site is modified.

## What's here

- `source_library.json`: user-supplied original 276 narration lines, 16 categories, unchanged.
- `voices.json`: six stable player-facing names and actual ElevenLabs voice IDs:
  David (Stephen Davis), Victor (Steve), Aaron, Beth, Lily, Charlotte.
- `manifest.json`: 276 clip IDs, 1,656 planned voice files, expected paths and visibility review guards.
- `known_recordings.json`: EIGHT previously generated ElevenLabs assets (six opening auditions, David's sarcastic gathering line, David's sinister reveal line); they are NOT imported or quality-approved.
- `import_existing.py`: read-only search and import of previously generated ElevenLabs history files, using exact script and voice ID matches. **It never calls TTS generation.**

## Step one: import the existing eight MP3 files, at no new synthesis cost

In a checked-out working copy of this branch:

```bash
export ELEVENLABS_API_KEY="..."   # keep PRIVATE; do not commit or paste in issues
python3 voice-production/import_existing.py            # DRY RUN; prints matching history entries
python3 voice-production/import_existing.py --execute  # downloads at most 8 matching EXISTING files
```

Then inspect the actual audio and filenames. The files should be in:

```
assets/audio/hosts/david/opening/opening_002.mp3
assets/audio/hosts/victor/opening/opening_002.mp3
assets/audio/hosts/aaron/opening/opening_002.mp3
assets/audio/hosts/beth/opening/opening_002.mp3
assets/audio/hosts/lily/opening/opening_002.mp3
assets/audio/hosts/charlotte/opening/opening_002.mp3
assets/audio/hosts/david/gather/gather_006.mp3
assets/audio/hosts/david/murder_reveal/murder_reveal_018.mp3
```

Review files before pushing:

```bash
git add assets/audio/hosts/ voice-production/imported_assets.json
git commit -m "Import reviewed ElevenLabs audition MP3s"
git push origin feature/six-host-voice-assets-20261101
```

The importer writes `imported_assets.json` with SHA-256, source history ID and review status for traceability. It skips any MP3 already on disk. It never regenerates missing files.

**Important:** The connected ElevenLabs Creative tool uses Flow generations; a Creative Flow generation ID is **not** an ElevenLabs History item ID. If `import_existing.py` reports `MISSING`, do not assume the MP3 exists in history or pay to create a replacement. Open the individual Flow, export the completed audio through ElevenLabs, and save under the exact target filename. The first six Flow references are recorded in `known_recordings.json`.

## Integration contract

A clip filename is `<event_key>_<3-digit-index>.mp3`. Keep the same clip ID across all six voices. Example:
`assets/audio/hosts/beth/gather/gather_006.mp3`.

**Do not add this library to live gameplay yet.** The existing game plays 39 historic narration lines with multiple takes through `js/narration.js` and `js/sound.js`. These remain unchanged. The 16 new event keys require explicit mapping to the actual engine. A source category is not itself proof an event is safely observable.

No private action may have a distinct sound, timing or network download pattern across roles. Role-specific banishment lines wait until the role is publicly revealed. A murder line that names a Loyal requires the role to be public. Winning lines only after an actual public victory. No narration can block gameplay or leak private data when Safari preloads.

## Next steps for Claude

1. Review current `js/main.js`, `js/sound.js`, `js/narration.js`, `js/engine.js`, `js/state.js`.
2. Import any available MP3s under their canonical filenames without changing the live voice system.
3. Record each verified binary in `imported_assets.json` with file hash; mark user-reviewed audio explicitly.
4. Develop a separate voice-picker PR, preserving current audio until the new paths, flags and security tests are ready.
5. Do not merge, deploy, spend additional ElevenLabs credits, or start generating all 1,656 files without fresh permission.

## Source and charging

ElevenLabs documents `GET /v1/history` and `GET /v1/history/{history_item_id}/audio` for retrieving previous speech. These endpoints retrieve existing audio; this importer never submits new text-to-speech requests.

The feature branch contains **metadata and code only until audio binaries are committed and verified**.

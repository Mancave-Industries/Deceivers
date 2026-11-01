#!/usr/bin/env python3
"""Import ALREADY-GENERATED ElevenLabs clips by matching history text + voice.

No TTS generation occurs, no generation credits are consumed. Dry-run by default.
Run from repository root with ELEVENLABS_API_KEY in the environment.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
HERE = Path(__file__).resolve().parent
API = "https://api.elevenlabs.io/v1"


def read(name):
    return json.loads((HERE / name).read_text(encoding="utf-8"))


def normalise(text):
    text = re.sub(r"\[[^\]]+\]", " ", text or "")
    return " ".join(text.replace("’", "'").replace("…", "...").split()).strip()


def request(path, key, params=None):
    url = API + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    return urllib.request.Request(url, headers={"xi-api-key": key, "Accept": "application/json"})


def history_for_voice(key, voice_id, max_pages=5):
    cursor = None
    out = []
    for _ in range(max_pages):
        params = {"voice_id": voice_id, "page_size": 250, "sort_direction": "desc"}
        if cursor:
            params["start_after_history_item_id"] = cursor
        with urllib.request.urlopen(request("/history", key, params), timeout=40) as response:
            page = json.load(response)
        out.extend(page.get("history", []))
        if not page.get("has_more") or not page.get("last_history_item_id"):
            break
        cursor = page["last_history_item_id"]
    return out


def is_mp3(path):
    with open(path, "rb") as f:
        data = f.read(3)
    return data == b"ID3" or (len(data) >= 2 and data[0] == 255 and (data[1] & 224) == 224)


def download_history_audio(key, history_id, destination):
    """Download an EXISTING history item. Never call TTS endpoints here."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(suffix=".mp3", dir=destination.parent)
    os.close(fd)
    tmp = Path(tmp_name)
    try:
        url = API + "/history/" + urllib.parse.quote(history_id, safe="") + "/audio"
        req = urllib.request.Request(url, headers={"xi-api-key": key, "Accept": "audio/mpeg"})
        with urllib.request.urlopen(req, timeout=60) as response, tmp.open("wb") as f:
            while True:
                block = response.read(65536)
                if not block:
                    break
                f.write(block)
        if tmp.stat().st_size < 100 or not is_mp3(tmp):
            raise ValueError("Downloaded item is empty or not MP3")
        tmp.replace(destination)
    finally:
        tmp.unlink(missing_ok=True)


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", help="Actually download existing MP3s (no synthesis)")
    parser.add_argument("--host", choices=[h["id"] for h in read("voices.json")["hosts"]])
    parser.add_argument("--max-files", type=int, default=8, help="Safety cap on number of imports")
    args = parser.parse_args()
    if args.max_files < 1 or args.max_files > 25:
        parser.error("--max-files must be between 1 and 25")
    key = os.getenv("ELEVENLABS_API_KEY")
    if not key:
        parser.error("Set ELEVENLABS_API_KEY in your environment; never commit an API key")

    source = read("source_library.json")["categories"]
    voices = {v["id"]: v for v in read("voices.json")["hosts"]}
    known = read("known_recordings.json")["recordings"]
    picked = [r for r in known if (not args.host or r["host_id"] == args.host)][:args.max_files]
    cache = {}
    receipts_path = HERE / "imported_assets.json"
    receipts = json.loads(receipts_path.read_text()) if receipts_path.exists() else {"assets": []}
    indexed = {(r["host_id"], r["clip_id"]): r for r in receipts["assets"]}
    results = []

    for item in picked:
        host, clip = item["host_id"], item["clip_id"]
        event, number = clip.rsplit("_", 1)
        expected = source[event][int(number) - 1]
        voice = voices[host]["voice_id"]
        filename = ROOT / "assets" / "audio" / "hosts" / host / event / (clip + ".mp3")
        if filename.exists():
            print(f"EXISTS {host}/{clip} — preserving existing recording")
            continue
        if voice not in cache:
            cache[voice] = history_for_voice(key, voice)
        matches = [x for x in cache[voice]
                   if x.get("voice_id") == voice
                   and normalise(x.get("text")) == normalise(expected)
                   and x.get("history_item_id")]
        if not matches:
            print(f"MISSING {host}/{clip} — no matching history item; no regeneration")
            results.append({"host_id": host, "clip_id": clip, "status": "missing"})
            continue
        match = max(matches, key=lambda x: x.get("date_unix") or 0)
        history_id = match["history_item_id"]
        if not args.execute:
            print(f"DRY RUN {host}/{clip} — history ID {history_id}; would import {filename.relative_to(ROOT)}")
            continue
        download_history_audio(key, history_id, filename)
        digest = hashlib.sha256(filename.read_bytes()).hexdigest()
        record = {
            "host_id": host, "clip_id": clip,
            "path": filename.relative_to(ROOT).as_posix(), "sha256": digest,
            "size_bytes": filename.stat().st_size,
            "history_item_id": history_id,
            "review_status": "pending",
        }
        indexed[(host, clip)] = record
        print(f"IMPORTED {record['path']} ({record['size_bytes']} bytes)")
    if args.execute:
        receipts["assets"] = sorted(indexed.values(), key=lambda x: (x["host_id"], x["clip_id"]))
        receipts_path.write_text(json.dumps(receipts, indent=2) + "\n", encoding="utf-8")
        print(f"Recorded {len(receipts['assets'])} assets in {receipts_path.relative_to(ROOT)}")
    else:
        print("No audio was downloaded or generated. Pass --execute to import existing audio.")


if __name__ == "__main__":
    run()

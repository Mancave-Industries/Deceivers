#!/usr/bin/env python3
"""Import already generated audio. GET-only transport; dry-run by default."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import tempfile
import urllib.error
import urllib.parse
import urllib.request

from asset_checks import ROOT, HERE, read, write, catalogue, asset_path, normalise, digest, inspect_mp3, verify_record

API = "https://api.elevenlabs.io/v1"


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlsplit(req.full_url).netloc != urllib.parse.urlsplit(newurl).netloc:
            raise ValueError("Cross-origin download redirect refused")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def get(url, key=None):
    parsed = urllib.parse.urlsplit(url)
    history = parsed.hostname == "api.elevenlabs.io" and (parsed.path == "/v1/history" or parsed.path.startswith("/v1/history/"))
    export = parsed.hostname == "storage.googleapis.com" and parsed.path.endswith("/content.mp3")
    if parsed.scheme != "https" or not (history or export) or (key and not history):
        raise ValueError("Only existing History or Flow MP3 downloads are allowed")
    headers = {"Accept": "*/*"}
    if key:
        headers["xi-api-key"] = key
    request = urllib.request.Request(url, headers=headers, method="GET")
    return urllib.request.build_opener(SafeRedirect()).open(request, timeout=40)


def metadata_matches(item, voice, text):
    return item.get("voice_id") == voice and normalise(item.get("text", item.get("prompt"))) == normalise(text)


def find_history(known, voice, text, key):
    history_id = known.get("history_item_id")
    if history_id:
        try:
            with get(API + "/history/" + urllib.parse.quote(history_id, safe=""), key) as response:
                item = json.load(response)
            if not metadata_matches(item, voice, text):
                raise ValueError("Recorded History ID has a different script or voice")
            return item
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
    cursor = None
    for _ in range(20):
        params = {"voice_id": voice, "source": "Flows", "page_size": 250}
        if cursor:
            params["start_after_history_item_id"] = cursor
        with get(API + "/history?" + urllib.parse.urlencode(params), key) as response:
            page = json.load(response)
        matches = [x for x in page.get("history", []) if metadata_matches(x, voice, text) and x.get("history_item_id")]
        if len(matches) > 1:
            raise ValueError("Multiple takes match; select an exact History ID")
        if matches:
            return matches[0]
        if not page.get("has_more"):
            return None
        next_cursor = page.get("last_history_item_id")
        if not next_cursor or next_cursor == cursor:
            raise ValueError("History pagination incomplete")
        cursor = next_cursor
    raise ValueError("History search cap reached; result is incomplete, not missing")


def flow_source(known, export, voice, text):
    for field in ("flow_id", "session_id", "generation_id", "history_item_id"):
        if not known.get(field) or export.get(field) != known[field]:
            raise ValueError(f"Flow export provenance mismatch: {field}")
    if export.get("status") != "completed" or not metadata_matches(export, voice, text):
        raise ValueError("Flow export is incomplete or script/voice differs")
    url = export["download_url"]
    suffix = f'/content_generation/{known["session_id"]}/{known["generation_id"]}/content.mp3'
    if not urllib.parse.urlsplit(url).path.endswith(suffix):
        raise ValueError("Flow URL does not identify the expected recording")
    source = {k: known[k] for k in ("flow_id", "session_id", "generation_id", "history_item_id")}
    source.update(method="creative_flow_export", history_presence="provider_link_observed_api_not_queried")
    return url, source, export.get("model_id"), export.get("prompt")


def download(url, destination, key=None):
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(suffix=".mp3", dir=destination.parent)
    os.close(fd)
    temporary = Path(name)
    try:
        with get(url, key) as response, temporary.open("wb") as output:
            total = 0
            while block := response.read(65536):
                total += len(block)
                if total > 20_000_000:
                    raise ValueError("Existing clip exceeds 20 MB safety cap")
                output.write(block)
        details = inspect_mp3(temporary)
        if destination.exists():
            raise ValueError("Refusing to overwrite an existing recording")
        temporary.replace(destination)
        return details
    finally:
        temporary.unlink(missing_ok=True)


def run():
    hosts, clips = catalogue()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--host", choices=list(hosts))
    parser.add_argument("--max-files", type=int, default=8)
    parser.add_argument("--flow-exports-json", type=Path, help="Private connector metadata OUTSIDE the checkout; never commit signed URLs")
    args = parser.parse_args()
    if not 1 <= args.max_files <= 8:
        parser.error("--max-files must be between 1 and 8")
    exports = {}
    if args.flow_exports_json:
        if args.flow_exports_json.resolve().is_relative_to(ROOT.resolve()):
            parser.error("Store signed export metadata outside the repository")
        entries = json.loads(args.flow_exports_json.read_text())
        exports = {(e["host_id"], e["clip_id"]): e for e in entries}
        if len(exports) != len(entries):
            parser.error("Duplicate export targets")
    key = os.getenv("ELEVENLABS_API_KEY")
    receipts = read("imported_assets.json") if (HERE / "imported_assets.json").exists() else {"schema_version": 1, "assets": []}
    indexed = {(r["host_id"], r["clip_id"]): r for r in receipts["assets"]}
    if len(indexed) != len(receipts["assets"]):
        raise ValueError("Duplicate receipt targets")
    picked = [r for r in read("known_recordings.json")["recordings"] if not args.host or r["host_id"] == args.host]
    missing = 0
    attempted = 0
    for known in picked:
        host, clip = target = (known["host_id"], known["clip_id"])
        path = asset_path(host, clip)
        destination = ROOT / path
        if destination.exists() or target in indexed:
            if not destination.exists() or target not in indexed:
                raise ValueError("Existing audio/receipt pair incomplete; recover without generation")
            verify_record(indexed[target])
            print(f"VERIFIED EXISTING {host}/{clip}; no download or generation")
            continue
        if attempted >= args.max_files:
            print("IMPORT CAP REACHED; remaining existing recordings left untouched")
            break
        attempted += 1
        voice, text = hosts[host]["voice_id"], clips[clip]["text"]
        if target in exports:
            url, source, model, prompt = flow_source(known, exports[target], voice, text)
            download_key = None
        else:
            if not key:
                raise ValueError("ELEVENLABS_API_KEY unavailable; use authenticated Flow export metadata or restart an authorised Codespace")
            item = find_history(known, voice, text, key)
            if not item:
                print(f"MISSING {host}/{clip}; recover recorded Flow export; never regenerate")
                missing += 1
                continue
            source = {"method": "history_api", "history_item_id": item["history_item_id"], "history_presence": "api_verified"}
            source.update({k: known[k] for k in ("flow_id", "session_id", "generation_id") if known.get(k)})
            url = API + "/history/" + urllib.parse.quote(item["history_item_id"], safe="") + "/audio"
            model, prompt, download_key = item.get("model_id"), item["text"], key
        if not args.execute:
            print(f"DRY RUN {path}; existing source {source['method']}")
            continue
        details = download(url, destination, download_key)
        record = dict(host_id=host, clip_id=clip, path=path, voice_id=voice,
            script_sha256=digest(text), provider_prompt_sha256=digest(prompt), model_id=model,
            source=source, import_status="local_binary_verified", review_status="listening_pending",
            imported_at=datetime.now(timezone.utc).isoformat(), **details)
        indexed[target] = record
        receipts["assets"] = sorted(indexed.values(), key=lambda r: (r["host_id"], r["clip_id"]))
        write("imported_assets.json", receipts)
        print(f"IMPORTED {path} ({details['size_bytes']} bytes); full MP3 decode passed")
    if missing:
        raise SystemExit(2)
    print("No speech was generated. Existing audio only.")


if __name__ == "__main__":
    try:
        run()
    except urllib.error.HTTPError as error:
        raise SystemExit(f"Existing-audio request failed: HTTP {error.code}; credentials and signed URL withheld")
    except urllib.error.URLError:
        raise SystemExit("Existing-audio network request failed; credentials and signed URL withheld")
    except (ValueError, KeyError, OSError) as error:
        raise SystemExit(f"Import blocked: {type(error).__name__}; check catalogue, provenance, environment and binary/receipt pairs")

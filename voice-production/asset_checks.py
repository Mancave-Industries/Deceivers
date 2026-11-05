"""Local catalogue and MP3 checks. No network or generation endpoints."""
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / "voice-production"


def read(name):
    return json.loads((HERE / name).read_text(encoding="utf-8"))


def write(name, value):
    path = HERE / name
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def normalise(text):
    text = re.sub(r"\[[^\]]+\]", " ", text or "")
    return " ".join(text.replace("’", "'").replace("…", "...").split())


def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def catalogue():
    manifest = read("manifest.json")
    source = read("source_library.json")["categories"]
    voice_rows = read("voices.json")["hosts"] + read("replacement_voices.json")["hosts"]
    hosts = {h["id"]: h for h in voice_rows}
    clips = {c["id"]: c for c in manifest["clips"]}
    if len(clips) != len(manifest["clips"]) or len(hosts) != len(voice_rows) or len(hosts) != 10:
        raise ValueError("Duplicate clip IDs or incorrect complete voice registry")
    if len(clips) != sum(map(len, source.values())) or len(clips) != manifest["clip_count"]:
        raise ValueError("Manifest/source count mismatch")
    for clip in clips.values():
        expected = source[clip["event"]][clip["index"] - 1]
        if clip["text"] != expected or clip["id"] != f'{clip["event"]}_{clip["index"]:03d}':
            raise ValueError("Manifest/source script mismatch")
        template = f'assets/audio/hosts/{{host}}/{clip["event"]}/{clip["id"]}.mp3'
        if clip["paths_by_host_template"] != template:
            raise ValueError("Non-canonical asset path")
    return hosts, clips


def asset_path(host, clip):
    hosts, clips = catalogue()
    if host not in hosts or clip not in clips:
        raise ValueError("Unknown host or clip")
    return clips[clip]["paths_by_host_template"].format(host=host)


def inspect_mp3(path):
    payload = path.read_bytes()
    if len(payload) < 100 or not (payload.startswith(b"ID3") or
            payload[0] == 255 and payload[1] & 224 == 224):
        raise ValueError("Missing MP3 header")
    probe = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration:stream=codec_name,sample_rate,channels", "-of", "json", str(path)
    ], check=True, capture_output=True, text=True, timeout=30)
    data = json.loads(probe.stdout)
    streams = data.get("streams", [])
    duration = float(data.get("format", {}).get("duration", 0))
    if len(streams) != 1 or streams[0].get("codec_name") != "mp3" or not math.isfinite(duration) or duration <= 0:
        raise ValueError("Invalid MP3 audio stream or duration")
    subprocess.run([
        "ffmpeg", "-v", "error", "-xerror", "-i", str(path), "-f", "null", "-"
    ], check=True, capture_output=True, timeout=60)
    return {
        "sha256": hashlib.sha256(payload).hexdigest(),
        "git_blob_sha": hashlib.sha1(f"blob {len(payload)}\0".encode() + payload).hexdigest(),
        "size_bytes": len(payload), "duration_seconds": duration,
        "codec": "mp3", "sample_rate_hz": int(streams[0]["sample_rate"]),
        "channels": int(streams[0]["channels"]), "full_decode_passed": True,
    }


def verify_record(record):
    host, clip = record["host_id"], record["clip_id"]
    expected_path = asset_path(host, clip)
    if record["path"] != expected_path:
        raise ValueError("Receipt path does not match catalogue")
    hosts, clips = catalogue()
    if record["voice_id"] != hosts[host]["voice_id"] or record["script_sha256"] != digest(clips[clip]["text"]):
        raise ValueError("Receipt voice or script mismatch")
    source = record.get("source", {})
    if source.get("method") not in ("creative_flow_export", "history_api") or not source.get("history_item_id"):
        raise ValueError("Missing provider source reference")
    if source["method"] == "creative_flow_export" and not all(source.get(k) for k in ("flow_id", "session_id", "generation_id")):
        raise ValueError("Incomplete Flow provenance")
    known = [k for k in read("known_recordings.json")["recordings"] if (k["host_id"], k["clip_id"]) == (host, clip)]
    if len(known) != 1:
        raise ValueError("Missing or duplicate generated-recording ledger entry")
    for field in ("flow_id", "session_id", "generation_id", "history_item_id"):
        if known[0].get(field) and source.get(field) != known[0][field]:
            raise ValueError("Receipt provenance differs from generated-recording ledger")
    actual = inspect_mp3(ROOT / expected_path)
    for field in ("sha256", "git_blob_sha", "size_bytes", "codec", "sample_rate_hz", "channels"):
        if record.get(field) != actual[field]:
            raise ValueError(f"Asset/receipt mismatch: {field}")
    if record.get("import_status") == "github_binary_verified":
        proof = record.get("github_verification", {})
        if (proof.get("blob_sha") != actual["git_blob_sha"] or
                proof.get("byte_for_byte_match") is not True or
                proof.get("readback_encoding") != "base64" or
                not re.fullmatch(r"[0-9a-f]{40}", proof.get("commit_sha", ""))):
            raise ValueError("Uploaded status requires GitHub binary readback evidence")
    return actual


def verify_all():
    catalogue()
    records = read("imported_assets.json")["assets"]
    seen, paths = set(), set()
    for record in records:
        key = (record["host_id"], record["clip_id"])
        if key in seen:
            raise ValueError("Duplicate asset receipt")
        seen.add(key)
        verify_record(record)
        paths.add(record["path"])
    disk = {p.relative_to(ROOT).as_posix() for p in (ROOT / "assets/audio/hosts").rglob("*.mp3")}
    ledgers = (
        ('production_assets.json', 'approved_api_plan.json'),
        ('replacement_production_assets.json', 'replacement_api_plan.json'),
    )
    for ledger_name, plan_name in ledgers:
        production_path = HERE / ledger_name
        production = json.loads(production_path.read_text())['assets'] if production_path.exists() else []
        approved = {(c['host_id'], c['clip_id']): c for c in read(plan_name)['clips']}
        for record in production:
            key = (record['host_id'], record['clip_id'])
            if key in seen or key not in approved:
                raise ValueError('Duplicate or unapproved production recording')
            seen.add(key)
            if any(record.get(field) != approved[key][field] for field in approved[key]):
                raise ValueError('Production script, voice or path mismatch')
            if record['status'] == 'reserved_no_automatic_retry':
                continue
            if record['status'] not in ('local_binary_verified', 'github_binary_verified'):
                raise ValueError('Unknown production recording status')
            actual = inspect_mp3(ROOT / record['path'])
            if any(record.get(field) != actual[field] for field in ('sha256', 'git_blob_sha', 'size_bytes')):
                raise ValueError('Production binary checksum mismatch')
            source = record.get('source', {})
            if source.get('method') != 'direct_tts_api' or not (source.get('history_item_id') or source.get('request_id')):
                raise ValueError('Production provider source reference missing')
            if record['status'] == 'github_binary_verified':
                proof = record.get('github_verification', {})
                if (proof.get('blob_sha') != actual['git_blob_sha'] or not proof.get('byte_for_byte_match')
                        or proof.get('readback_encoding') != 'base64'
                        or not re.fullmatch(r'[0-9a-f]{40}', proof.get('commit_sha', ''))):
                    raise ValueError('Production uploaded status lacks binary readback proof')
            paths.add(record['path'])
    if disk != paths:
        raise ValueError("MP3 files and receipts differ")
    for known in read("known_recordings.json")["recordings"]:
        if known.get("import_status") == "github_binary_verified" and (known["host_id"], known["clip_id"]) not in seen:
            raise ValueError("Recording marked uploaded without a verified binary")
    print(f"Verified {len(paths)} MP3s: canonical paths, SHA-256, Git blobs, complete decode and source receipts.")
    return records


if __name__ == "__main__":
    verify_all()

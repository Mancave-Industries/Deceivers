"""Read-only ElevenLabs preflight. Never generates speech or prints credentials."""
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

BASE = "https://api.elevenlabs.io/v1"


def get(path, key):
    request = urllib.request.Request(BASE + path, headers={"xi-api-key": key})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Do not log response bodies, headers, or exception representations.
        raise RuntimeError(f"ElevenLabs {path}: HTTP {error.code}; check key permissions/account access") from None
    except (OSError, ValueError):
        raise RuntimeError(f"ElevenLabs {path}: network or JSON response failure") from None


def check(key):
    if not key:
        raise RuntimeError("ELEVENLABS_API_KEY repository Actions secret is missing or empty")
    subscription = get("/user/subscription", key)
    used = subscription.get("character_count")
    limit = subscription.get("character_limit")
    remaining = limit - used if isinstance(limit, int) and isinstance(used, int) else None
    models = get("/models", key)
    tts = sorted(m["model_id"] for m in models if m.get("can_do_text_to_speech"))
    hosts = json.loads(Path(__file__).with_name("voices.json").read_text())["hosts"]
    access = {}
    for host in hosts:
        voice = get("/voices/" + host["voice_id"], key)
        access[host["id"]] = voice.get("voice_id") == host["voice_id"]
    result = {
        "read_only": True,
        "audio_generated": 0,
        "subscription_tier": subscription.get("tier"),
        "subscription_status": subscription.get("status"),
        "character_limit": limit,
        "character_count": used,
        "remaining_characters": remaining,
        "tts_model_ids": tts,
        "quoted_model_available": "eleven_v4" in tts,
        "voice_access": access,
        "note": "No spend authorized by this check. Resolve model availability and API pricing before generation.",
    }
    if not all(access.values()):
        raise RuntimeError("One or more catalogue voice IDs are inaccessible")
    return result


if __name__ == "__main__":
    try:
        report = check(os.environ.get("ELEVENLABS_API_KEY", ""))
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    output = json.dumps(report, indent=2)
    print(output)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
            summary.write("## ElevenLabs read-only access check\n\n```json\n" + output + "\n```\n")

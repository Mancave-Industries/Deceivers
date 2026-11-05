"""Read-only ElevenLabs preflight. Never generates speech or prints credentials."""
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request
import urllib.parse

BASE = "https://api.elevenlabs.io/v1"


def get(path, key):
    request = urllib.request.Request(BASE + path, headers={"xi-api-key": key})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Do not log response bodies, headers, or exception representations.
        reason = "unclassified authentication/access error"
        try:
            detail = json.loads(error.read()).get("detail", {})
            status = detail.get("status") if isinstance(detail, dict) else None
            allowed = {"invalid_api_key", "missing_permissions", "unauthorized", "quota_exceeded", "voice_not_found"}
            if status in allowed:
                reason = status
        except (ValueError, OSError, AttributeError):
            pass
        raise RuntimeError(f"ElevenLabs {path}: HTTP {error.code}; {reason}") from None
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
    voice_errors = {}
    library_matches = {}
    for host in hosts:
        try:
            voice = get("/voices/" + host["voice_id"], key)
            access[host["id"]] = voice.get("voice_id") == host["voice_id"]
        except RuntimeError as error:
            access[host["id"]] = False
            voice_errors[host["id"]] = str(error)
            query = urllib.parse.urlencode({"search": host["voice_id"], "page_size": 100,
                "include_custom_rates": "true", "include_live_moderated": "true"})
            try:
                shared = get("/shared-voices?" + query, key)
                library_matches[host["id"]] = [{field: v.get(field) for field in
                    ("voice_id", "public_owner_id", "name", "rate", "free_users_allowed")}
                    for v in shared.get("voices", []) if v.get("voice_id") == host["voice_id"]]
                matches = library_matches[host["id"]]
                if os.environ.get("ADD_MISSING_PUBLIC_VOICES") == "1" and len(matches) == 1:
                    match = matches[0]
                    if match.get("rate") != 1 or not match.get("public_owner_id"):
                        raise RuntimeError("Public voice requires separate rate or identity review")
                    url = BASE + "/voices/add/" + match["public_owner_id"] + "/" + host["voice_id"]
                    request = urllib.request.Request(url, method="POST",
                        headers={"xi-api-key": key, "Content-Type": "application/json"},
                        data=json.dumps({"new_name": host["label"], "bookmarked": True}).encode())
                    try:
                        with urllib.request.urlopen(request, timeout=30) as response:
                            added = json.load(response)
                        if added.get("voice_id") != host["voice_id"]:
                            raise RuntimeError("Added voice returned a different ID; review before recording")
                        verified = get("/voices/" + host["voice_id"], key)
                        access[host["id"]] = verified.get("voice_id") == host["voice_id"]
                        if access[host["id"]]:
                            voice_errors.pop(host["id"], None)
                    except urllib.error.HTTPError as error:
                        raise RuntimeError(f"Add public voice {host['id']}: HTTP {error.code}; voice write permission may be required") from None
            except RuntimeError as error:
                library_matches[host["id"]] = {"error": str(error)}
    result = {
        "read_only": os.environ.get("ADD_MISSING_PUBLIC_VOICES") != "1",
        "audio_generated": 0,
        "subscription_tier": subscription.get("tier"),
        "subscription_status": subscription.get("status"),
        "character_limit": limit,
        "character_count": used,
        "remaining_characters": remaining,
        "tts_model_ids": tts,
        "quoted_model_available": "eleven_v4" in tts,
        "voice_access": access,
        "voice_errors": voice_errors,
        "exact_public_library_matches": library_matches,
        "note": "No spend authorized by this check. Resolve model availability and API pricing before generation.",
    }
    return result


if __name__ == "__main__":
    try:
        report = check(os.environ.get("ELEVENLABS_API_KEY", "").strip())
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    output = json.dumps(report, indent=2)
    print(output)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
            summary.write("## ElevenLabs read-only access check\n\n```json\n" + output + "\n```\n")
    if not all(report["voice_access"].values()) or not report["quoted_model_available"]:
        sys.exit(1)

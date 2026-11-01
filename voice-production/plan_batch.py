#!/usr/bin/env python3
"""Prepare exactly six neutral handoff recordings for review. Never generates."""
import argparse
import json
from asset_checks import ROOT, HERE, read, catalogue, asset_path, digest, verify_all


def build():
    hosts, clips = catalogue()
    verify_all()
    protected = {(r["host_id"], r["clip_id"]) for r in read("known_recordings.json")["recordings"]}
    protected.update((r["host_id"], r["clip_id"]) for r in read("imported_assets.json")["assets"])
    clip = clips["anonymous_handoff_001"]
    quote = read("batch_quote.json")
    by_host = {q["host_id"]: q for q in quote["quotes"]}
    if set(by_host) != set(hosts) or quote["generated"] or quote["charged"]:
        raise ValueError("Missing or invalid estimate-only quote")
    records = []
    for host, voice in hosts.items():
        path = asset_path(host, clip["id"])
        if (host, clip["id"]) in protected or (ROOT / path).exists():
            raise ValueError("Batch overlaps generated/imported audio; do not regenerate")
        estimate = by_host[host]
        if (estimate["voice_id"], estimate["prompt"], estimate["model_id"], estimate["generations_count"], estimate["estimate_only"]) != (voice["voice_id"], clip["text"], "eleven_v4", 1, True):
            raise ValueError("Estimate differs from proposed voice, script, model or take count")
        records.append({"host_id": host, "voice_id": voice["voice_id"], "clip_id": clip["id"],
            "path": path, "text": clip["text"], "script_sha256": digest(clip["text"]),
            "visibility_guard": clip["visibility_guard"], "generations_count": 1,
            "prepared_flow_id": estimate["flow_id"], "prepared_node_id": estimate["node_id"]})
    plan = {
        "schema_version": 1, "batch_id": "handoff-six-hosts-001", "status": "awaiting_separate_paid_batch_approval",
        "generated": False, "file_count": len(records),
        "total_script_characters": sum(len(r["text"]) for r in records),
        "provider_surface": "connected_elevenlabs_creative_flow",
        "model_id": "eleven_v4", "model_reference": "Existing completed David opening Flow node IuVEEznJtWUlUpRwYC9q",
        "output_format": "mp3_44100_128", "direction": "Calm, dry, neutral public handoff. No additional words or role-specific variation.",
        "estimated_cost": {"credits": quote["total_credits"], "price_cents": quote["total_price_cents"], "currency": quote["currency"], "quoted_on": quote["quoted_on"], "receipt": "voice-production/batch_quote.json"},
        "approved_spend_cap": None,
        "approval_requirements": [
            "Review/listen to the eight imported takes and confirm narrator identities and delivery.",
            "Check provider History source=Flows for exact voice/script matches before generation; recover any existing takes.",
            "Get a current provider quote for this exact six-file batch and record a spend cap; do not infer price from character counts.",
            "Obtain separate user approval referencing batch_payload_sha256 and spend cap.",
            "Generate one take per host only; record Flow/session/generation IDs immediately. Never auto-retry a charged or uncertain request.",
            "Import, decode and checksum each completed take; verify GitHub binaries before marking uploaded.",
        ],
        "gameplay_integration": "disabled; event mapping and Safari secrecy tests remain required",
        "records": records,
    }
    plan["batch_payload_sha256"] = digest(json.dumps(plan, sort_keys=True, separators=(",", ":")))
    return plan


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Save proposal only; does not approve or generate")
    args = parser.parse_args()
    plan = build()
    if args.write:
        (HERE / "next_batch.json").write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
    elif read("next_batch.json") != plan:
        raise SystemExit("Batch proposal differs from catalogue or existing audio; rebuild and review")
    print(f"Batch proposal verified: {plan['file_count']} files, {plan['total_script_characters']} script characters. UNAPPROVED; no generation.")

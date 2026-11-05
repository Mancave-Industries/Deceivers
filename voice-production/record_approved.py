"""Approved one-take production; durable reservation before POST; never retries TTS."""
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request

from asset_checks import inspect_mp3
from check_paid_access import get

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / 'voice-production'
BRANCH = 'feature/six-host-voice-assets-20261101'
REPO = 'Mancave-Industries/Deceivers'
LEDGER = HERE / 'production_assets.json'
EXPECTED_HASH = '9ce1e9a18cca518c6627550be58129099587b335152dd3fb6d05c2f1e08d6882'


def now():
    return datetime.now(timezone.utc).isoformat()


def read(path):
    return json.loads(path.read_text())


def save(ledger):
    temporary = LEDGER.with_suffix('.tmp')
    temporary.write_text(json.dumps(ledger, indent=2) + '\n')
    temporary.replace(LEDGER)


def key(clip):
    return clip['host_id'] + '/' + clip['clip_id']


def validate_plan(plan):
    clips = plan['clips']
    fingerprint = hashlib.sha256(json.dumps(clips, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if fingerprint != EXPECTED_HASH or plan['plan_sha256'] != fingerprint:
        raise RuntimeError('Approved plan changed')
    if len(clips) != 1031 or sum(len(c['text']) for c in clips) != 45486:
        raise RuntimeError('Approved scope or budget mismatch')
    if plan['model_id'] != 'eleven_v4' or plan['max_credits'] != 45486:
        raise RuntimeError('Unapproved model or budget')
    hosts = {h['id']: h['voice_id'] for h in read(HERE / 'voices.json')['hosts']}
    reviewed = {c['id']: c for c in read(HERE / 'reviewed_production_script.json')['clips']}
    old = {key(c) for c in read(HERE / 'imported_assets.json')['assets']}
    seen = set()
    for c in clips:
        source = reviewed[c['clip_id']]
        if key(c) in seen or key(c) in old:
            raise RuntimeError('Duplicate or already imported clip in plan')
        seen.add(key(c))
        if (source['recording_status'] != 'public_pool_candidate' or source['text'] != c['text']
                or source['script_sha256'] != c['script_sha256']
                or hashlib.sha256(c['text'].encode()).hexdigest() != c['script_sha256']
                or hosts[c['host_id']] != c['voice_id']
                or source['paths_by_host_template'].format(host=c['host_id']) != c['path']):
            raise RuntimeError('Voice, text, eligibility or canonical path mismatch')
    return clips


def pending(clips, ledger):
    records = ledger['assets']
    if len({key(c) for c in records}) != len(records):
        raise RuntimeError('Duplicate production ledger entries')
    planned = {key(c): c for c in clips}
    for record in records:
        source = planned.get(key(record))
        if not source or any(record.get(f) != source[f] for f in source):
            raise RuntimeError('Production receipt differs from approved plan')
        if record['status'] != 'github_binary_verified':
            raise RuntimeError('Unresolved recording intent: ' + key(record) + '; reconcile provider history, never regenerate')
        actual = inspect_mp3(ROOT / record['path'])
        if any(record.get(f) != actual[f] for f in ('sha256', 'git_blob_sha', 'size_bytes')):
            raise RuntimeError('Production file checksum mismatch')
        if not record.get('github_verification', {}).get('byte_for_byte_match'):
            raise RuntimeError('Missing GitHub binary proof')
    completed = {key(r) for r in records}
    return [c for c in clips if key(c) not in completed]


def git(*args):
    result = subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Git operation failed: ' + args[0] + '; no further paid requests')
    return result.stdout.strip()


def checkpoint(message, paths):
    git('add', '--', *paths)
    git('commit', '--allow-empty', '-m', message)
    commit = git('rev-parse', 'HEAD')
    git('push', 'origin', 'HEAD:refs/heads/' + BRANCH)
    return commit


def verify_github(record, commit, token):
    url = 'https://api.github.com/repos/' + REPO + '/git/blobs/' + record['git_blob_sha']
    request = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        blob = json.load(response)
    payload = (ROOT / record['path']).read_bytes()
    if blob.get('sha') != record['git_blob_sha'] or base64.b64decode(blob['content']) != payload:
        raise RuntimeError('GitHub binary readback failed')
    # Confirm the exact commit contains this blob, not merely an unattached blob object.
    remote = git('ls-remote', 'origin', 'refs/heads/' + BRANCH).split()[0]
    if remote != commit:
        raise RuntimeError('Branch moved during verification; reconcile before resuming')
    if git('rev-parse', commit + ':' + record['path']) != record['git_blob_sha']:
        raise RuntimeError('Committed path/blob mismatch')
    return dict(commit_sha=commit, blob_sha=record['git_blob_sha'],
        readback_encoding='base64', byte_for_byte_match=True, verified_at=now())


def generate(clip, api_key):
    request = urllib.request.Request('https://api.elevenlabs.io/v1/text-to-speech/' + clip['voice_id']
        + '?output_format=mp3_44100_128', method='POST', headers={
            'xi-api-key': api_key, 'Content-Type': 'application/json'},
        data=json.dumps({'text': clip['text'], 'model_id': 'eleven_v4'}).encode())
    # Exactly one attempt. An HTTP/network error can have an uncertain charge outcome.
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = response.read()
        history_id = response.headers.get('history-item-id')
        request_id = response.headers.get('request-id') or response.headers.get('x-request-id')
        charged = response.headers.get('character-cost')
    path = ROOT / clip['path']
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise RuntimeError('Refusing to overwrite audio')
    path.write_bytes(payload)
    return dict(source={'method': 'direct_tts_api', 'history_item_id': history_id,
                        'request_id': request_id}, provider_character_cost=charged,
                model_id='eleven_v4', generated_at=now(), **inspect_mp3(path))


def run():
    plan = read(HERE / 'approved_api_plan.json')
    clips = validate_plan(plan)
    ledger = read(LEDGER)
    todo = pending(clips, ledger)
    if '--dry-run' in sys.argv:
        print(json.dumps({'remaining_clips': len(todo), 'estimated_credits': sum(len(c['text']) for c in todo)}))
        return
    if os.environ.get('GITHUB_REPOSITORY') != REPO or os.environ.get('GITHUB_REF') != 'refs/heads/' + BRANCH:
        raise RuntimeError('Production is restricted to the approved repository and draft branch')
    api_key = os.environ.get('ELEVENLABS_API_KEY', '').strip()
    token = os.environ.get('GITHUB_TOKEN', '')
    if not api_key or not token:
        raise RuntimeError('Required managed secret missing')
    sub = get('/user/subscription', api_key)
    if sub.get('status') != 'active' or sub.get('character_limit', 0) - sub.get('character_count', 0) < sum(len(c['text']) for c in todo):
        raise RuntimeError('Insufficient included balance or inactive subscription')
    if not any(m.get('model_id') == 'eleven_v4' and m.get('can_do_text_to_speech') for m in get('/models', api_key)):
        raise RuntimeError('Approved model unavailable')
    for voice in {c['voice_id'] for c in todo}:
        if get('/voices/' + voice, api_key).get('voice_id') != voice:
            raise RuntimeError('Approved voice unavailable')
    git('config', 'user.name', 'github-actions[bot]')
    git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    for offset in range(0, len(todo), 10):
        batch = todo[offset:offset + 10]
        records = [dict(c, status='reserved_no_automatic_retry', reserved_at=now()) for c in batch]
        if any((ROOT / c['path']).exists() for c in batch):
            raise RuntimeError('Unreceipted audio already exists; reconcile first')
        ledger['assets'].extend(records)
        save(ledger)
        checkpoint('Reserve approved narrator batch before generation', ['voice-production/production_assets.json'])
        try:
            for record in records:
                record.update(generate(record, api_key))
                record['status'] = 'local_binary_verified'
                record['review_status'] = 'listening_pending'
                save(ledger)
                print('Recorded ' + key(record), flush=True)
                if not record['source'].get('history_item_id') and not record['source'].get('request_id'):
                    raise RuntimeError('Provider omitted source reference; preserve take and stop')
                cost = record.get('provider_character_cost')
                if cost is not None and float(cost) > len(record['text']):
                    raise RuntimeError('Provider cost exceeds quote; preserve take and stop')
        finally:
            # Save every completed binary even if a later take fails.
            completed = [r for r in records if r['status'] == 'local_binary_verified']
            paths = ['voice-production/production_assets.json'] + [r['path'] for r in completed]
            save(ledger)
            commit = checkpoint('Save generated narrator MP3s and provenance', paths)
            for record in completed:
                record['github_verification'] = verify_github(record, commit, token)
                record['status'] = 'github_binary_verified'
            save(ledger)
            if completed:
                checkpoint('Record verified GitHub binary readback receipts', ['voice-production/production_assets.json'])
        print('Verified new MP3s: ' + str(sum(r['status'] == 'github_binary_verified' for r in ledger['assets'])), flush=True)
    print('Approved production run complete', flush=True)


if __name__ == '__main__':
    try:
        run()
    except Exception as error:
        # Never print HTTP bodies, headers, credentials or full exception representations.
        print('Stopped safely: ' + (str(error) if isinstance(error, RuntimeError) else type(error).__name__), file=sys.stderr)
        sys.exit(1)

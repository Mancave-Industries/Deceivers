"""Approved replacement production; durable reservation before POST; never retries TTS."""
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request

from asset_checks import inspect_mp3
from check_paid_access import get

ROOT = Path(__file__).resolve().parents[1]
HERE = ROOT / 'voice-production'
BRANCH = 'feature/six-host-voice-assets-20261101'
REPO = 'Mancave-Industries/Deceivers'
LEDGER = HERE / 'replacement_production_assets.json'
EXPECTED_HASH = '34cfa396ee69c3821723849a4599ef6353d25fd59cbf9893ba591e37a7a81ba1'
EXPECTED_CLIPS = 696
MAX_CREDITS = 30864


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
        raise RuntimeError('Approved replacement plan changed')
    if len(clips) != EXPECTED_CLIPS or sum(len(c['text']) for c in clips) != MAX_CREDITS:
        raise RuntimeError('Approved replacement scope or budget mismatch')
    if plan['model_id'] != 'eleven_v4' or plan['max_credits'] != MAX_CREDITS:
        raise RuntimeError('Unapproved replacement model or budget')
    hosts = {h['id']: h['voice_id'] for h in read(HERE / 'replacement_voices.json')['hosts']}
    if set(hosts) != {'timothy', 'cate', 'kay', 'penelope'}:
        raise RuntimeError('Replacement cast changed')
    reviewed = {c['id']: c for c in read(HERE / 'reviewed_production_script.json')['clips']}
    seen = set()
    for clip in clips:
        source = reviewed.get(clip['clip_id'])
        if source is None or key(clip) in seen:
            raise RuntimeError('Duplicate or unknown replacement clip')
        seen.add(key(clip))
        if (source['recording_status'] != 'public_pool_candidate'
                or source['text'] != clip['text']
                or source['script_sha256'] != clip['script_sha256']
                or hashlib.sha256(clip['text'].encode()).hexdigest() != clip['script_sha256']
                or hosts.get(clip['host_id']) != clip['voice_id']
                or source['paths_by_host_template'].format(host=clip['host_id']) != clip['path']):
            raise RuntimeError('Replacement voice, text, eligibility or path mismatch')
    return clips


def pending(clips, ledger):
    records = ledger['assets']
    if len({key(c) for c in records}) != len(records):
        raise RuntimeError('Duplicate replacement ledger entries')
    planned = {key(c): c for c in clips}
    for record in records:
        source = planned.get(key(record))
        if not source or any(record.get(field) != source[field] for field in source):
            raise RuntimeError('Replacement receipt differs from approved plan')
        if record['status'] != 'github_binary_verified':
            raise RuntimeError('Unresolved replacement recording intent: ' + key(record) + '; reconcile provider history, never regenerate')
        actual = inspect_mp3(ROOT / record['path'])
        if any(record.get(field) != actual[field] for field in ('sha256', 'git_blob_sha', 'size_bytes')):
            raise RuntimeError('Replacement file checksum mismatch')
        if not record.get('github_verification', {}).get('byte_for_byte_match'):
            raise RuntimeError('Missing replacement GitHub binary proof')
    completed = {key(record) for record in records}
    return [clip for clip in clips if key(clip) not in completed]


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
    request = urllib.request.Request(url, headers={
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
    })
    with urllib.request.urlopen(request, timeout=60) as response:
        blob = json.load(response)
    payload = (ROOT / record['path']).read_bytes()
    if blob.get('sha') != record['git_blob_sha'] or base64.b64decode(blob['content']) != payload:
        raise RuntimeError('Replacement GitHub binary readback failed')
    remote = git('ls-remote', 'origin', 'refs/heads/' + BRANCH).split()[0]
    if remote != commit:
        raise RuntimeError('Branch moved during replacement verification; reconcile before resuming')
    if git('rev-parse', commit + ':' + record['path']) != record['git_blob_sha']:
        raise RuntimeError('Replacement committed path/blob mismatch')
    return {
        'commit_sha': commit,
        'blob_sha': record['git_blob_sha'],
        'readback_encoding': 'base64',
        'byte_for_byte_match': True,
        'verified_at': now(),
    }


def generate(clip, api_key):
    request = urllib.request.Request(
        'https://api.elevenlabs.io/v1/text-to-speech/' + clip['voice_id'] + '?output_format=mp3_44100_128',
        method='POST',
        headers={'xi-api-key': api_key, 'Content-Type': 'application/json'},
        data=json.dumps({'text': clip['text'], 'model_id': 'eleven_v4'}).encode(),
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = response.read()
        history_id = response.headers.get('history-item-id')
        request_id = response.headers.get('request-id') or response.headers.get('x-request-id')
        charged = response.headers.get('character-cost')
    path = ROOT / clip['path']
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise RuntimeError('Refusing to overwrite replacement audio')
    path.write_bytes(payload)
    return {
        'source': {
            'method': 'direct_tts_api',
            'history_item_id': history_id,
            'request_id': request_id,
        },
        'provider_character_cost': charged,
        'model_id': 'eleven_v4',
        'generated_at': now(),
        **inspect_mp3(path),
    }


def run():
    plan = read(HERE / 'replacement_api_plan.json')
    clips = validate_plan(plan)
    ledger = read(LEDGER)
    todo = pending(clips, ledger)
    remaining_credits = sum(len(clip['text']) for clip in todo)
    if '--dry-run' in sys.argv:
        print(json.dumps({'remaining_clips': len(todo), 'estimated_credits': remaining_credits}))
        return
    direct_branch = os.environ.get('GITHUB_REF') == 'refs/heads/' + BRANCH
    pull_request_branch = (os.environ.get('GITHUB_EVENT_NAME') == 'pull_request'
                           and os.environ.get('GITHUB_HEAD_REF') == BRANCH)
    if os.environ.get('GITHUB_REPOSITORY') != REPO or not (direct_branch or pull_request_branch):
        raise RuntimeError('Replacement production is restricted to the approved repository and draft branch')
    api_key = os.environ.get('ELEVENLABS_API_KEY', '').strip()
    token = os.environ.get('GITHUB_TOKEN', '')
    if not api_key or not token:
        raise RuntimeError('Required managed secret missing')
    subscription = get('/user/subscription', api_key)
    available = subscription.get('character_limit', 0) - subscription.get('character_count', 0)
    if subscription.get('status') != 'active' or available < remaining_credits:
        raise RuntimeError('Insufficient included balance or inactive subscription')
    if not any(model.get('model_id') == 'eleven_v4' and model.get('can_do_text_to_speech')
               for model in get('/models', api_key)):
        raise RuntimeError('Approved model unavailable')
    for voice in {clip['voice_id'] for clip in todo}:
        if get('/voices/' + voice, api_key).get('voice_id') != voice:
            raise RuntimeError('Approved replacement voice unavailable')
    git('config', 'user.name', 'github-actions[bot]')
    git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    for offset in range(0, len(todo), 10):
        batch = todo[offset:offset + 10]
        records = [dict(clip, status='reserved_no_automatic_retry', reserved_at=now()) for clip in batch]
        if any((ROOT / clip['path']).exists() for clip in batch):
            raise RuntimeError('Unreceipted replacement audio exists; reconcile first')
        ledger['assets'].extend(records)
        save(ledger)
        checkpoint('Reserve approved replacement narrator batch before generation',
                   ['voice-production/replacement_production_assets.json'])
        try:
            for record in records:
                record.update(generate(record, api_key))
                record['status'] = 'local_binary_verified'
                record['review_status'] = 'listening_pending'
                save(ledger)
                print('Recorded replacement ' + key(record), flush=True)
                if not record['source'].get('history_item_id') and not record['source'].get('request_id'):
                    raise RuntimeError('Provider omitted replacement source reference; preserve take and stop')
                cost = record.get('provider_character_cost')
                if cost is not None and float(cost) > len(record['text']):
                    raise RuntimeError('Provider cost exceeds replacement quote; preserve take and stop')
        finally:
            completed = [record for record in records if record['status'] == 'local_binary_verified']
            paths = ['voice-production/replacement_production_assets.json'] + [record['path'] for record in completed]
            save(ledger)
            commit = checkpoint('Save generated replacement narrator MP3s and provenance', paths)
            for record in completed:
                record['github_verification'] = verify_github(record, commit, token)
                record['status'] = 'github_binary_verified'
            save(ledger)
            if completed:
                checkpoint('Record verified replacement GitHub binary receipts',
                           ['voice-production/replacement_production_assets.json'])
        verified = sum(record['status'] == 'github_binary_verified' for record in ledger['assets'])
        print('Verified replacement MP3s: ' + str(verified), flush=True)
    print('Approved replacement production run complete', flush=True)


if __name__ == '__main__':
    try:
        run()
    except Exception as error:
        message = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        print('Stopped safely: ' + message, file=sys.stderr)
        sys.exit(1)

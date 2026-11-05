"""Validate the review catalogue and declared policies, not runtime secrecy."""
import json
from pathlib import Path
p=Path(__file__).resolve().parent
read=lambda n:json.loads((p/n).read_text())
source=read('manifest.json');review=read('reviewed_production_script.json');changes=read('script_changes.json')['changes']
original={c['id']:c for c in source['clips']}; revised={c['id']:c for c in review['clips']}; edited={c['id']:c for c in changes}
assert len(revised)==len(review['clips']), 'Duplicate IDs'
assert set(original)<=set(revised), 'Lost original IDs'
for id,c in original.items():
 assert revised[id]['text']==edited.get(id,{}).get('after',c['text']),id
 if id in edited:assert edited[id]['before']==c['text'],id
for a in read('imported_assets.json')['assets']:
 assert revised[a['clip_id']]['script_sha256']==a['script_sha256'], 'Existing take invalidated'
pools=review['pools']; flat={id for pool in pools.values() for id in pool['clip_ids']}
for pool in pools.values():
 assert pool['clip_ids'] and pool['public_guard']
 assert all(id in revised for id in pool['clip_ids'])
for c in review['clips']:
 if c['event'] in ['secret_action','loyal_banished','deceiver_banished','suspicion','named_handoff_generic']:
  assert c['id'] not in flat, 'Held/private line leaked into a production pool'
for id in pools['murderFirst']['clip_ids']+pools['murderLater']['clip_ids']:
 text=revised[id]['text'].lower()
 assert not any(x in text for x in ['loyal','innocent','another','one more']),id
assert pools['intro2']['clip_ids']==['rules_intro_001']
assert pools['intro3']['clip_ids']==['rules_intro_002']
assert not review['audio_generation_authorised'] and not review['merge_or_deployment_authorised']
assert len(flat)==review['public_pool_candidate_lines']
print(f"Review consistency passed: {len(revised)} unique lines, {len(pools)} mapped pools, {len(flat)} public candidates. Eight existing scripts unchanged. Held/private lines excluded. Runtime secrecy validation remains required.")

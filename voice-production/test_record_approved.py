"""Guard behaviour, without contacting ElevenLabs or generating any audio."""
import copy
import unittest
from unittest.mock import patch
import record_approved as production


class ApprovedProductionTests(unittest.TestCase):
    def setUp(self):
        self.plan = production.read(production.HERE / 'approved_api_plan.json')

    def test_exact_scope_excludes_originals_and_held_lines(self):
        clips = production.validate_plan(self.plan)
        self.assertEqual(len(clips), 1031)
        self.assertEqual(sum(len(c['text']) for c in clips), 45486)
        self.assertEqual(len({production.key(c) for c in clips}), 1031)

    def test_text_or_voice_change_rejected_before_paid_call(self):
        for field in ('text', 'voice_id', 'path'):
            changed = copy.deepcopy(self.plan)
            changed['clips'][0][field] += 'changed'
            with self.assertRaises(RuntimeError):
                production.validate_plan(changed)

    def test_uncertain_intent_blocks_retry(self):
        c = self.plan['clips'][0]
        ledger = {'assets': [dict(c, status='reserved_no_automatic_retry')]}
        with self.assertRaisesRegex(RuntimeError, 'Unresolved recording intent'):
            production.pending(self.plan['clips'], ledger)

    def test_verified_clip_is_skipped_only_with_binary_and_proof(self):
        c = self.plan['clips'][0]
        r = dict(c, status='github_binary_verified', sha256='abc', git_blob_sha='def', size_bytes=123,
                 github_verification={'byte_for_byte_match': True})
        with patch.object(production, 'inspect_mp3', return_value={'sha256':'abc','git_blob_sha':'def','size_bytes':123}):
            todo = production.pending(self.plan['clips'], {'assets':[r]})
            self.assertEqual(len(todo), 1030)
            self.assertNotIn(c, todo)
            r['sha256'] = 'corrupted'
            with self.assertRaises(RuntimeError):
                production.pending(self.plan['clips'], {'assets':[r]})

    def test_network_failure_makes_only_one_paid_attempt(self):
        with patch.object(production.urllib.request, 'urlopen', side_effect=TimeoutError) as send:
            with self.assertRaises(TimeoutError):
                production.generate(self.plan['clips'][0], 'test-only-not-a-key')
            self.assertEqual(send.call_count, 1)


if __name__ == '__main__':
    unittest.main()

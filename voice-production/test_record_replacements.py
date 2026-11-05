"""Replacement recording safeguards, without paid or network requests."""
import copy
import unittest
from unittest.mock import patch
import record_replacements as production


class ReplacementProductionTests(unittest.TestCase):
    def setUp(self):
        self.plan = production.read(production.HERE / 'replacement_api_plan.json')

    def test_exact_approved_scope(self):
        clips = production.validate_plan(self.plan)
        self.assertEqual(len(clips), 696)
        self.assertEqual(sum(len(c['text']) for c in clips), 30864)
        self.assertEqual(len({production.key(c) for c in clips}), 696)
        self.assertEqual({c['host_id'] for c in clips}, {'timothy', 'cate', 'kay', 'penelope'})

    def test_text_voice_path_or_budget_change_is_rejected(self):
        for field in ('text', 'voice_id', 'path'):
            changed = copy.deepcopy(self.plan)
            changed['clips'][0][field] += 'changed'
            with self.assertRaises(RuntimeError):
                production.validate_plan(changed)
        changed = copy.deepcopy(self.plan)
        changed['max_credits'] += 1
        with self.assertRaises(RuntimeError):
            production.validate_plan(changed)

    def test_uncertain_intent_blocks_retry(self):
        clip = self.plan['clips'][0]
        ledger = {'assets': [dict(clip, status='reserved_no_automatic_retry')]}
        with self.assertRaisesRegex(RuntimeError, 'Unresolved replacement recording intent'):
            production.pending(self.plan['clips'], ledger)

    def test_verified_clip_is_skipped_only_with_binary_and_proof(self):
        clip = self.plan['clips'][0]
        record = dict(
            clip,
            status='github_binary_verified',
            sha256='abc',
            git_blob_sha='def',
            size_bytes=123,
            github_verification={'byte_for_byte_match': True},
        )
        actual = {'sha256': 'abc', 'git_blob_sha': 'def', 'size_bytes': 123}
        with patch.object(production, 'inspect_mp3', return_value=actual):
            todo = production.pending(self.plan['clips'], {'assets': [record]})
            self.assertEqual(len(todo), 695)
            record['sha256'] = 'corrupted'
            with self.assertRaises(RuntimeError):
                production.pending(self.plan['clips'], {'assets': [record]})

    def test_network_failure_makes_only_one_paid_attempt(self):
        with patch.object(production.urllib.request, 'urlopen', side_effect=TimeoutError) as send:
            with self.assertRaises(TimeoutError):
                production.generate(self.plan['clips'][0], 'test-only-not-a-key')
            self.assertEqual(send.call_count, 1)


if __name__ == '__main__':
    unittest.main()

"""Regression checks for costly mistakes: wrong take, corrupt file, regeneration."""
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import asset_checks as assets
import import_existing as importer
import plan_batch


class ProductionSafetyTests(unittest.TestCase):
    def setUp(self):
        self.known = assets.read("known_recordings.json")["recordings"][0]
        self.hosts, self.clips = assets.catalogue()
        self.voice = self.hosts[self.known["host_id"]]["voice_id"]
        self.text = self.clips[self.known["clip_id"]]["text"]
        self.export = dict(self.known, status="completed", voice_id=self.voice, prompt=self.text,
            model_id="eleven_v4", download_url=f'https://storage.googleapis.com/xi-backend/content_generation/{self.known["session_id"]}/{self.known["generation_id"]}/content.mp3')

    def test_flow_rejects_wrong_voice_script_and_provenance(self):
        for field in ("voice_id", "prompt", "flow_id", "session_id", "generation_id", "history_item_id"):
            with self.subTest(field=field):
                wrong = dict(self.export, **{field: "incorrect"})
                with self.assertRaises(ValueError):
                    importer.flow_source(self.known, wrong, self.voice, self.text)

    def test_flow_url_must_identify_exact_recording(self):
        wrong = dict(self.export, download_url="https://storage.googleapis.com/content.mp3")
        with self.assertRaises(ValueError):
            importer.flow_source(self.known, wrong, self.voice, self.text)

    def test_transport_refuses_generation_and_credential_exfiltration(self):
        for url, key in [
            ("https://api.elevenlabs.io/v1/text-to-speech/voice", None),
            ("http://api.elevenlabs.io/v1/history", "test-only"),
            ("https://storage.googleapis.com/test/content.mp3", "test-only"),
            ("https://example.com/content.mp3", None),
        ]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                importer.get(url, key)

    def test_redirect_cannot_forward_a_key_to_another_origin(self):
        request = importer.urllib.request.Request("https://api.elevenlabs.io/v1/history/a/audio")
        with self.assertRaises(ValueError):
            importer.SafeRedirect().redirect_request(request, None, 302, "", {}, "https://example.com/audio")

    def test_id3_header_is_not_enough_to_pass_audio_validation(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "bad.mp3"
            path.write_bytes(b"ID3" + b"not audio" * 100)
            with self.assertRaises(Exception):
                assets.inspect_mp3(path)

    def test_checksum_mismatch_is_rejected(self):
        receipt = copy.deepcopy(assets.read("imported_assets.json")["assets"][0])
        receipt["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "sha256"):
            assets.verify_record(receipt)

    def test_download_failure_leaves_no_recording_or_temporary_file(self):
        with tempfile.TemporaryDirectory() as folder:
            destination = Path(folder) / "clip.mp3"
            with patch.object(importer, "get", return_value=io.BytesIO(b"not mp3")):
                with self.assertRaises(ValueError):
                    importer.download(self.export["download_url"], destination)
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_reimport_never_calls_network_even_without_key(self):
        with patch.object(importer, "get", side_effect=AssertionError("Unexpected network request")), \
                patch("sys.argv", ["import_existing.py", "--execute"]), \
                patch.dict(importer.os.environ, {}, clear=True):
            importer.run()

    def test_plan_refuses_previously_generated_target(self):
        real_read = plan_batch.read
        def read(name):
            data = real_read(name)
            if name == "known_recordings.json":
                data["recordings"].append({"host_id": "david", "clip_id": "anonymous_handoff_001"})
            return data
        with patch.object(plan_batch, "read", side_effect=read), patch.object(plan_batch, "verify_all"):
            with self.assertRaisesRegex(ValueError, "do not regenerate"):
                plan_batch.build()

    def test_history_prefers_exact_id_and_never_generates(self):
        item = {"history_item_id": self.known["history_item_id"], "voice_id": self.voice, "text": self.text}
        response = io.BytesIO(json.dumps(item).encode())
        with patch.object(importer, "get", return_value=response) as get:
            self.assertEqual(importer.find_history(self.known, self.voice, self.text, "test-only"), item)
            self.assertEqual(get.call_args.args[0], importer.API + "/history/" + self.known["history_item_id"])


if __name__ == "__main__":
    unittest.main()

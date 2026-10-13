import io
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import fax_forwarder as ff  # noqa: E402


def make_config(root: Path, **watch) -> ff.Config:
    return ff.Config(
        watch=ff.WatchConfig(
            inbox=root / "inbox",
            archive=root / "sent",
            failed=root / "failed",
            stable_seconds=watch.pop("stable_seconds", 5),
            max_retries=watch.pop("max_retries", 3),
            **watch,
        ),
        smtp=ff.SmtpConfig(host="smtp.example.com"),
        mail=ff.MailConfig(sender="fax@example.com",
                           recipients=["a@example.com", "b@example.com"]),
    )


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


class ForwarderTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.cfg = make_config(self.root)
        self.cfg.watch.inbox.mkdir()
        self.sent = []
        self.clock = FakeClock()
        self.fwd = ff.Forwarder(self.cfg, sender=lambda _s, m: self.sent.append(m),
                                clock=self.clock)

    def tearDown(self):
        self.tmp.cleanup()

    def test_waits_until_file_is_stable_then_sends_and_archives(self):
        f = self.cfg.watch.inbox / "fax001.pdf"
        f.write_bytes(b"%PDF-1.4 test")
        self.assertEqual(self.fwd.process_once(), 0)
        self.clock.now += 2
        self.assertEqual(self.fwd.process_once(), 0)  # まだ stable_seconds 未満
        self.clock.now += 5
        self.assertEqual(self.fwd.process_once(), 1)

        self.assertFalse(f.exists())
        self.assertTrue((self.cfg.watch.archive / "fax001.pdf").exists())
        msg = self.sent[0]
        self.assertEqual(msg["To"], "a@example.com, b@example.com")
        self.assertIn("fax001.pdf", msg["Subject"])
        att = next(msg.iter_attachments())
        self.assertEqual(att.get_filename(), "fax001.pdf")
        self.assertEqual(att.get_content_type(), "application/pdf")
        self.assertEqual(att.get_content(), b"%PDF-1.4 test")

    def test_growing_file_is_not_sent(self):
        f = self.cfg.watch.inbox / "fax.pdf"
        f.write_bytes(b"a")
        self.fwd.process_once()
        self.clock.now += 10
        f.write_bytes(b"ab")  # 書き込み継続中
        self.assertEqual(self.fwd.process_once(), 0)
        self.clock.now += 10
        self.assertEqual(self.fwd.process_once(), 1)

    def test_ignores_other_extensions_and_hidden_files(self):
        (self.cfg.watch.inbox / "memo.txt").write_text("x")
        (self.cfg.watch.inbox / ".tmp.pdf").write_bytes(b"x")
        self.fwd.process_once()
        self.clock.now += 10
        self.assertEqual(self.fwd.process_once(), 0)
        self.assertEqual(self.sent, [])

    def test_failure_retries_with_backoff_then_moves_to_failed(self):
        def boom(_s, _m):
            raise OSError("smtp down")

        fwd = ff.Forwarder(self.cfg, sender=boom, clock=self.clock)
        f = self.cfg.watch.inbox / "fax.pdf"
        f.write_bytes(b"x")
        fwd.process_once()
        self.clock.now += 10
        fwd.process_once()  # 1回目の失敗
        self.assertTrue(f.exists())
        self.clock.now += 10
        fwd.process_once()  # バックオフ中なので送らない
        self.assertEqual(fwd._failures[f], 1)
        for _ in range(2):
            self.clock.now += 3600
            fwd.process_once()
        self.assertFalse(f.exists())
        self.assertTrue((self.cfg.watch.failed / "fax.pdf").exists())

    def test_archive_does_not_overwrite_existing(self):
        self.cfg.watch.archive.mkdir()
        (self.cfg.watch.archive / "fax.pdf").write_bytes(b"old")
        (self.cfg.watch.inbox / "fax.pdf").write_bytes(b"new")
        self.fwd.process_once()
        self.clock.now += 10
        self.fwd.process_once()
        self.assertEqual((self.cfg.watch.archive / "fax.pdf").read_bytes(), b"old")
        self.assertEqual((self.cfg.watch.archive / "fax_1.pdf").read_bytes(), b"new")

    def test_oversized_file_is_notified_without_attachment(self):
        self.cfg.mail.max_attachment_mb = 0.000001
        f = self.cfg.watch.inbox / "big.pdf"
        f.write_bytes(b"x" * 100)
        msg = ff.build_message(self.cfg, f, datetime(2026, 10, 13, 9, 30))
        self.assertEqual(list(msg.iter_attachments()), [])
        self.assertIn("上限を超えた", msg.get_content())


class TiffTest(unittest.TestCase):
    def test_multipage_tiff_converted_to_pdf(self):
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Pillow not installed")
        pages = [Image.new("1", (1728, 1100), 1) for _ in range(3)]
        buf = io.BytesIO()
        pages[0].save(buf, format="TIFF", save_all=True, append_images=pages[1:],
                      compression="group4", dpi=(204, 98))
        with tempfile.TemporaryDirectory() as d:
            cfg = make_config(Path(d))
            p = Path(d) / "fax.tif"
            p.write_bytes(buf.getvalue())
            msg = ff.build_message(cfg, p, datetime(2026, 10, 13, 9, 30))
        att = next(msg.iter_attachments())
        self.assertEqual(att.get_filename(), "fax.pdf")
        pdf = att.get_content()
        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertEqual(pdf.count(b"/Type /Page\n"), 3)


class ConfigTest(unittest.TestCase):
    def test_load_example_config(self):
        example = Path(__file__).resolve().parent.parent / "config.example.toml"
        cfg = ff.load_config(example)
        self.assertEqual(cfg.smtp.host, "smtp.gmail.com")
        self.assertEqual(cfg.mail.recipients, ["office@example.com", "owner@example.com"])
        self.assertEqual(cfg.watch.inbox, (example.parent / "inbox").resolve())

    def test_password_from_env(self):
        example = Path(__file__).resolve().parent.parent / "config.example.toml"
        import os
        os.environ["FAX_SMTP_PASSWORD"] = "secret"
        try:
            self.assertEqual(ff.load_config(example).smtp.password, "secret")
        finally:
            del os.environ["FAX_SMTP_PASSWORD"]


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""FAX受信ファイルをメールに転送する常駐プログラム。

複合機の「FAX受信→フォルダ保存」機能や HylaFAX の受信キューなど、
受信したFAXがファイルとして置かれるフォルダを監視し、新しいファイルを
メールに添付して送信する。送信済みのファイルは archive フォルダへ移動する。

使い方:
    python3 fax_forwarder.py -c config.toml          # 常駐して監視
    python3 fax_forwarder.py -c config.toml --once   # 1回だけ処理して終了 (cron向け)
    python3 fax_forwarder.py -c config.toml --test   # テストメールを送信
"""

from __future__ import annotations

import argparse
import io
import logging
import mimetypes
import os
import shutil
import signal
import smtplib
import ssl
import sys
import time
import tomllib
from dataclasses import dataclass, field
from datetime import datetime
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path

log = logging.getLogger("fax_forwarder")

TIFF_SUFFIXES = {".tif", ".tiff"}
DEFAULT_EXTENSIONS = [".pdf", ".tif", ".tiff", ".png", ".jpg", ".jpeg"]


@dataclass
class SmtpConfig:
    host: str
    port: int = 587
    security: str = "starttls"  # "starttls" | "ssl" | "none"
    username: str = ""
    password: str = ""
    timeout: int = 30


@dataclass
class MailConfig:
    sender: str
    recipients: list[str]
    subject: str = "【FAX受信】{received:%Y/%m/%d %H:%M} {filename}"
    body: str = (
        "FAXを受信しました。\n\n"
        "受信日時: {received:%Y年%m月%d日 %H:%M}\n"
        "ファイル: {filename} ({size_kb} KB)\n\n"
        "※このメールはFAX転送プログラムから自動送信されています。\n"
    )
    max_attachment_mb: float = 20.0


@dataclass
class WatchConfig:
    inbox: Path
    archive: Path
    failed: Path
    extensions: list[str] = field(default_factory=lambda: list(DEFAULT_EXTENSIONS))
    poll_interval: float = 10.0
    stable_seconds: float = 5.0
    convert_tiff_to_pdf: bool = True
    max_retries: int = 5


@dataclass
class Config:
    watch: WatchConfig
    smtp: SmtpConfig
    mail: MailConfig


def load_config(path: Path) -> Config:
    with path.open("rb") as f:
        raw = tomllib.load(f)
    base = path.parent

    def resolve(p: str) -> Path:
        pp = Path(p).expanduser()
        return pp if pp.is_absolute() else (base / pp).resolve()

    w = raw.get("watch", {})
    inbox = resolve(w["inbox"])
    watch = WatchConfig(
        inbox=inbox,
        archive=resolve(w.get("archive", str(inbox / "sent"))),
        failed=resolve(w.get("failed", str(inbox / "failed"))),
        extensions=[e.lower() if e.startswith(".") else "." + e.lower()
                    for e in w.get("extensions", DEFAULT_EXTENSIONS)],
        poll_interval=float(w.get("poll_interval", 10)),
        stable_seconds=float(w.get("stable_seconds", 5)),
        convert_tiff_to_pdf=bool(w.get("convert_tiff_to_pdf", True)),
        max_retries=int(w.get("max_retries", 5)),
    )

    s = raw.get("smtp", {})
    smtp = SmtpConfig(
        host=s["host"],
        port=int(s.get("port", 587)),
        security=s.get("security", "starttls").lower(),
        username=s.get("username", ""),
        # パスワードは設定ファイルに書かず環境変数で渡すのを推奨
        password=os.environ.get("FAX_SMTP_PASSWORD", s.get("password", "")),
        timeout=int(s.get("timeout", 30)),
    )
    if smtp.security not in ("starttls", "ssl", "none"):
        raise ValueError(f"smtp.security が不正です: {smtp.security}")

    m = raw.get("mail", {})
    recipients = m.get("to", [])
    if isinstance(recipients, str):
        recipients = [recipients]
    if not recipients:
        raise ValueError("mail.to に送信先を1件以上指定してください")
    mail = MailConfig(
        sender=m.get("from", smtp.username),
        recipients=recipients,
        **{k: m[k] for k in ("subject", "body", "max_attachment_mb") if k in m},
    )
    if not mail.sender:
        raise ValueError("mail.from を指定してください")
    return Config(watch=watch, smtp=smtp, mail=mail)


def tiff_to_pdf(data: bytes) -> bytes | None:
    """複数ページTIFFをPDFに変換する。Pillow が無い/変換失敗時は None。"""
    try:
        from PIL import Image, ImageSequence
    except ImportError:
        return None
    try:
        with Image.open(io.BytesIO(data)) as img:
            pages = [p.convert("RGB") if p.mode not in ("1", "L", "RGB") else p.copy()
                     for p in ImageSequence.Iterator(img)]
            # FAXは横200dpi/縦100dpi(標準モード)のように縦横で解像度が違うことがある
            dpi = img.info.get("dpi", (200, 200))
        if not pages:
            return None
        xdpi, ydpi = (float(dpi[0]) or 200.0), (float(dpi[1]) or 200.0)
        if abs(xdpi - ydpi) > 1:
            target = max(xdpi, ydpi)
            pages = [p.resize((round(p.width * target / xdpi), round(p.height * target / ydpi)))
                     for p in pages]
            xdpi = ydpi = target
        out = io.BytesIO()
        pages[0].save(out, format="PDF", save_all=True, append_images=pages[1:],
                      resolution=xdpi)
        return out.getvalue()
    except Exception:
        log.exception("TIFF→PDF変換に失敗しました。TIFFのまま添付します")
        return None


def build_message(cfg: Config, path: Path, received: datetime) -> EmailMessage:
    data = path.read_bytes()
    filename = path.name
    if cfg.watch.convert_tiff_to_pdf and path.suffix.lower() in TIFF_SUFFIXES:
        pdf = tiff_to_pdf(data)
        if pdf is not None:
            data = pdf
            filename = path.stem + ".pdf"

    fields = {
        "filename": filename,
        "original_filename": path.name,
        "received": received,
        "size_kb": max(1, round(len(data) / 1024)),
    }
    msg = EmailMessage()
    msg["From"] = cfg.mail.sender
    msg["To"] = ", ".join(cfg.mail.recipients)
    msg["Subject"] = cfg.mail.subject.format(**fields)
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=cfg.mail.sender.rsplit("@", 1)[-1] or None)
    body = cfg.mail.body.format(**fields)

    limit = int(cfg.mail.max_attachment_mb * 1024 * 1024)
    if len(data) > limit:
        body += (f"\n※ファイルサイズ({fields['size_kb']} KB)が上限を超えたため添付していません。\n"
                 f"保存先フォルダ: {cfg.watch.archive}\n")
        msg.set_content(body)
        return msg

    msg.set_content(body)
    ctype, _ = mimetypes.guess_type(filename)
    maintype, subtype = (ctype or "application/octet-stream").split("/", 1)
    msg.add_attachment(data, maintype=maintype, subtype=subtype, filename=filename)
    return msg


def send_message(smtp_cfg: SmtpConfig, msg: EmailMessage) -> None:
    ctx = ssl.create_default_context()
    if smtp_cfg.security == "ssl":
        server = smtplib.SMTP_SSL(smtp_cfg.host, smtp_cfg.port,
                                  timeout=smtp_cfg.timeout, context=ctx)
    else:
        server = smtplib.SMTP(smtp_cfg.host, smtp_cfg.port, timeout=smtp_cfg.timeout)
    with server:
        if smtp_cfg.security == "starttls":
            server.starttls(context=ctx)
        if smtp_cfg.username:
            server.login(smtp_cfg.username, smtp_cfg.password)
        server.send_message(msg)


def unique_destination(directory: Path, name: str) -> Path:
    dest = directory / name
    stem, suffix = Path(name).stem, Path(name).suffix
    n = 1
    while dest.exists():
        dest = directory / f"{stem}_{n}{suffix}"
        n += 1
    return dest


class Forwarder:
    def __init__(self, cfg: Config, sender=send_message, clock=time.time):
        self.cfg = cfg
        self._send = sender
        self._clock = clock
        # path -> (size, mtime, 最初にその状態を観測した時刻)
        self._seen: dict[Path, tuple[int, float, float]] = {}
        self._failures: dict[Path, int] = {}
        self._next_try: dict[Path, float] = {}

    def candidates(self) -> list[Path]:
        w = self.cfg.watch
        try:
            entries = list(w.inbox.iterdir())
        except FileNotFoundError:
            log.error("監視フォルダが見つかりません: %s", w.inbox)
            return []
        files = [p for p in entries
                 if p.is_file()
                 and p.suffix.lower() in w.extensions
                 and not p.name.startswith(".")]
        return sorted(files, key=lambda p: p.stat().st_mtime)

    def is_stable(self, path: Path, now: float) -> bool:
        """書き込み途中のファイルを送らないよう、サイズと更新時刻が一定時間変わらないか確認する。"""
        st = path.stat()
        state = (st.st_size, st.st_mtime)
        prev = self._seen.get(path)
        if prev is None or prev[:2] != state:
            self._seen[path] = (*state, now)
            return False
        return st.st_size > 0 and now - prev[2] >= self.cfg.watch.stable_seconds

    def process_once(self) -> int:
        """監視フォルダを1回走査し、送信できたファイル数を返す。"""
        now = self._clock()
        sent = 0
        present = set()
        for path in self.candidates():
            present.add(path)
            try:
                if not self.is_stable(path, now):
                    continue
            except FileNotFoundError:
                continue
            if self._next_try.get(path, 0) > now:
                continue
            if self._forward(path, now):
                sent += 1
        for path in list(self._seen):
            if path not in present:
                self._forget(path)
        return sent

    def _forward(self, path: Path, now: float) -> bool:
        w = self.cfg.watch
        received = datetime.fromtimestamp(path.stat().st_mtime)
        try:
            msg = build_message(self.cfg, path, received)
            self._send(self.cfg.smtp, msg)
        except Exception as e:
            count = self._failures.get(path, 0) + 1
            self._failures[path] = count
            if count >= w.max_retries:
                w.failed.mkdir(parents=True, exist_ok=True)
                dest = unique_destination(w.failed, path.name)
                shutil.move(str(path), dest)
                self._forget(path)
                log.error("送信に%d回失敗したため %s へ移動しました: %s", count, dest, e)
            else:
                delay = min(60 * 2 ** (count - 1), 3600)
                self._next_try[path] = now + delay
                log.warning("送信失敗 (%d/%d回目) %s: %s — %d秒後に再試行",
                            count, w.max_retries, path.name, e, delay)
            return False

        w.archive.mkdir(parents=True, exist_ok=True)
        dest = unique_destination(w.archive, path.name)
        shutil.move(str(path), dest)
        self._forget(path)
        log.info("転送しました: %s → %s (保存先 %s)",
                 path.name, ", ".join(self.cfg.mail.recipients), dest)
        return True

    def _forget(self, path: Path) -> None:
        self._seen.pop(path, None)
        self._failures.pop(path, None)
        self._next_try.pop(path, None)

    def run(self, once: bool = False) -> None:
        if once:
            # 単発実行では安定判定のため stable_seconds だけ待って2回走査する
            self.process_once()
            time.sleep(self.cfg.watch.stable_seconds)
            self.process_once()
            return
        stop = False

        def handle(signum, _frame):
            nonlocal stop
            log.info("シグナル %d を受信したため終了します", signum)
            stop = True

        signal.signal(signal.SIGINT, handle)
        signal.signal(signal.SIGTERM, handle)
        log.info("監視を開始しました: %s (間隔 %.0f秒)",
                 self.cfg.watch.inbox, self.cfg.watch.poll_interval)
        while not stop:
            try:
                self.process_once()
            except Exception:
                log.exception("監視中に予期しないエラーが発生しました")
            deadline = time.monotonic() + self.cfg.watch.poll_interval
            while not stop and time.monotonic() < deadline:
                time.sleep(0.5)


def send_test_mail(cfg: Config) -> None:
    msg = EmailMessage()
    msg["From"] = cfg.mail.sender
    msg["To"] = ", ".join(cfg.mail.recipients)
    msg["Subject"] = "【FAX転送】テストメール"
    msg["Date"] = formatdate(localtime=True)
    msg.set_content(
        "FAX転送プログラムのテストメールです。\n"
        f"監視フォルダ: {cfg.watch.inbox}\n"
        "このメールが届いていれば、メール送信の設定は正しく動作しています。\n"
    )
    send_message(cfg.smtp, msg)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="FAX受信ファイルをメールに転送します")
    ap.add_argument("-c", "--config", type=Path, default=Path("config.toml"),
                    help="設定ファイル (既定: config.toml)")
    ap.add_argument("--once", action="store_true", help="1回だけ処理して終了")
    ap.add_argument("--test", action="store_true", help="テストメールを送信して終了")
    ap.add_argument("-v", "--verbose", action="store_true", help="詳細ログを出力")
    args = ap.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    try:
        cfg = load_config(args.config)
    except (OSError, KeyError, ValueError, tomllib.TOMLDecodeError) as e:
        log.error("設定ファイルを読み込めません (%s): %s", args.config, e)
        return 2

    if args.test:
        try:
            send_test_mail(cfg)
        except Exception as e:
            log.error("テストメールの送信に失敗しました: %s", e)
            return 1
        log.info("テストメールを送信しました: %s", ", ".join(cfg.mail.recipients))
        return 0

    cfg.watch.inbox.mkdir(parents=True, exist_ok=True)
    Forwarder(cfg).run(once=args.once)
    return 0


if __name__ == "__main__":
    sys.exit(main())

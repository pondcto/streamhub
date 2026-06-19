"""Native-subprocess controller for the dstv-widevine-decryption restreamer.

Spawns one `wv-mpd-streaming` process per channel, tracks it by contentId,
waits for its HLS playlist to appear, and stops it via SIGTERM to the process
group. Linux-targeted (the binary is Linux; uses os.killpg / start_new_session).

Shared by the user "Watch" flow (/api/stream) and the admin controller (phase 3).
Admin-managed channels (started via the admin panel or scheduler) are not
stopped by the user Watch-flow cleanup; only an explicit admin stop or a
scheduled stop can terminate them.
"""

import asyncio
import logging
import os
import shutil
import signal
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import IO, Optional

from app.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class ChannelProcess:
    content_id: str
    channel_tag: Optional[str]
    pid: int
    started_at: datetime
    hls_url: str
    log_path: str
    popen: subprocess.Popen = field(repr=False)
    log_file: Optional[IO[bytes]] = field(default=None, repr=False)
    # When True only stop_channel() (admin/scheduler) can terminate this
    # process; the user Watch-flow cleanup is a no-op for this channel.
    admin_managed: bool = False


# contentId -> running process
_processes: dict[str, ChannelProcess] = {}


def _mode_for(content_type: str) -> str:
    """Map our content types to the binary's <vod|live> arg."""
    return "vod" if (content_type or "").strip().lower() == "vod" else "live"


def _playlist_path(content_id: str) -> Path:
    settings = get_settings()
    return Path(settings.hls_output_dir) / content_id / f"{content_id}.m3u8"


def _hls_ready(content_id: str) -> bool:
    """Return True only when the master playlist AND all init files it references exist."""
    master = _playlist_path(content_id)
    if not (master.exists() and master.stat().st_size > 0):
        return False
    try:
        text = master.read_text(errors="replace")
    except OSError:
        return False
    channel_dir = master.parent
    # If the master mentions a separate audio rendition, wait for its init too.
    if "_audio.m3u8" in text:
        audio_init = channel_dir / f"{content_id}_a_init.mp4"
        if not (audio_init.exists() and audio_init.stat().st_size > 0):
            return False
    video_init = channel_dir / f"{content_id}_v_init.mp4"
    if not (video_init.exists() and video_init.stat().st_size > 0):
        return False
    return True


def _info(proc: ChannelProcess, *, ready: bool = True) -> dict:
    return {
        "contentId": proc.content_id,
        "channelTag": proc.channel_tag,
        "pid": proc.pid,
        "status": "playing" if ready else "starting",
        "hlsUrl": proc.hls_url,
        "startedAt": proc.started_at.isoformat(),
        "adminManaged": proc.admin_managed,
    }


def is_running(content_id: str) -> bool:
    proc = _processes.get(content_id)
    if proc is None:
        return False
    if proc.popen.poll() is not None:  # process exited
        _cleanup(proc)
        _processes.pop(content_id, None)
        return False
    return True


def _cleanup(proc: ChannelProcess) -> None:
    if proc.log_file is not None:
        try:
            proc.log_file.close()
        except Exception:
            pass


def _kill(proc: ChannelProcess) -> None:
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        try:
            proc.popen.terminate()
        except Exception:
            pass
    try:
        proc.popen.wait(timeout=10)
    except Exception:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except Exception:
            pass
    _cleanup(proc)
    logger.info("Stopped wv-mpd-streaming for %s (pid %s)", proc.content_id, proc.pid)


async def start_channel(
    *,
    content_id: str,
    manifest_url: str,
    content_type: str = "live",
    channel_tag: Optional[str] = None,
    device_id: Optional[str] = None,
    admin_managed: bool = False,
) -> dict:
    settings = get_settings()

    if is_running(content_id):
        proc = _processes[content_id]
        # Upgrade to admin-managed if the admin (re-)starts an already-running channel.
        if admin_managed and not proc.admin_managed:
            proc.admin_managed = True
            logger.info("Channel %s is now admin-managed", content_id)
        return _info(proc)

    # wv-mpd-streaming wants the bare .mpd — drop any ?ssai=...&filter=... query
    # (the user Watch flow strips this client-side; do it here for admin/scheduled
    # starts too so all paths behave identically).
    manifest_url = manifest_url.split("?", 1)[0]

    binary = Path(settings.wv_streaming_binary)
    if not binary.exists():
        raise FileNotFoundError(
            f"wv-mpd-streaming binary not found at '{binary}'. "
            "Build dstv-widevine-decryption and set WV_STREAMING_BINARY in .env."
        )

    logs_dir = Path(settings.hls_logs_dir)
    logs_dir.mkdir(parents=True, exist_ok=True)

    # Remove stale HLS output from any previous run so the ready-check can't
    # fire on an old playlist, and the player always gets a consistent fresh set
    # of init segments, playlists, and media segments.
    channel_out = Path(settings.hls_output_dir) / content_id
    if channel_out.exists():
        shutil.rmtree(channel_out, ignore_errors=True)
        logger.info("Cleared stale HLS output for %s", content_id)

    Path(settings.hls_output_dir).mkdir(parents=True, exist_ok=True)
    log_path = logs_dir / f"{content_id}.log"

    # Archive any existing log from a previous run before opening a fresh file,
    # so display/download always reflects only the current service run.
    if log_path.exists() and log_path.stat().st_size > 0:
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        archive_path = logs_dir / f"{content_id}_{ts}.log"
        try:
            log_path.rename(archive_path)
            logger.info("Archived previous log for %s → %s", content_id, archive_path.name)
        except OSError:
            pass  # non-fatal; append mode below is safe fallback

    cmd = [str(binary), manifest_url, content_id, _mode_for(content_type)]
    effective_device = device_id or settings.wv_device_id
    if effective_device:
        cmd.append(effective_device)

    log_file = open(log_path, "wb", buffering=0)
    popen = subprocess.Popen(
        cmd,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        cwd=str(binary.resolve().parent.parent),  # project root (configs/ live here)
        start_new_session=True,  # own process group, so we can signal the whole tree
    )
    proc = ChannelProcess(
        content_id=content_id,
        channel_tag=channel_tag,
        pid=popen.pid,
        started_at=datetime.now(timezone.utc),
        hls_url=f"/hls/{content_id}/{content_id}.m3u8",
        log_path=str(log_path),
        popen=popen,
        log_file=log_file,
        admin_managed=admin_managed,
    )
    _processes[content_id] = proc
    logger.info(
        "Started wv-mpd-streaming for %s (pid %s, admin_managed=%s): %s",
        content_id, popen.pid, admin_managed, " ".join(cmd),
    )

    # Wait for the master playlist AND all init files to materialise (or the
    # process to die / time out). _hls_ready() also checks init files so the
    # player never gets a "ready" signal when the audio init is still being written.
    waited = 0.0
    timeout = settings.hls_ready_timeout_seconds
    while waited < timeout:
        if popen.poll() is not None:
            _cleanup(proc)
            _processes.pop(content_id, None)
            raise RuntimeError(
                f"wv-mpd-streaming exited early (code {popen.returncode}). See {log_path}."
            )
        if _hls_ready(content_id):
            return _info(proc, ready=True)
        await asyncio.sleep(0.5)
        waited += 0.5

    # Still alive but no playlist yet — let it keep buffering; client can retry.
    return _info(proc, ready=False)


def stop_channel(content_id: str) -> bool:
    """Stop a channel unconditionally (admin panel and scheduler use this)."""
    proc = _processes.pop(content_id, None)
    if proc is None:
        return False
    _kill(proc)
    return True


def stop_user_channel(content_id: str) -> bool:
    """Stop a channel only if it is NOT admin-managed.

    Called by the user Watch-flow cleanup so that closing a browser modal or
    tab does not kill a channel that the admin panel is keeping alive.
    """
    proc = _processes.get(content_id)
    if proc is None:
        return False
    if proc.admin_managed:
        logger.debug(
            "Ignoring Watch-flow stop for admin-managed channel %s", content_id
        )
        return False
    return stop_channel(content_id)


def list_running() -> list[dict]:
    return [_info(_processes[cid]) for cid in list(_processes.keys()) if is_running(cid)]


def get_status(content_id: str) -> Optional[dict]:
    return _info(_processes[content_id]) if is_running(content_id) else None


def stop_all() -> None:
    for cid in list(_processes.keys()):
        stop_channel(cid)


def read_log_since(content_id: str, offset: int = 0) -> tuple[str, int]:
    """Return new log text written after `offset` bytes, plus the new offset.

    Resets to 0 if the file shrank (rotation/restart). Enables cheap polling
    of a channel's wv-mpd-streaming log from the admin dashboard.
    """
    settings = get_settings()
    path = Path(settings.hls_logs_dir) / f"{content_id}.log"
    if not path.exists():
        return "", 0
    try:
        size = path.stat().st_size
        if offset < 0 or offset > size:
            offset = 0
        with open(path, "rb") as fh:
            fh.seek(offset)
            data = fh.read()
        return data.decode("utf-8", errors="replace"), size
    except OSError:
        return "", offset

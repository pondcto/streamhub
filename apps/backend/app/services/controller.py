"""Native-subprocess controller for the dstv-widevine-decryption restreamer.

Spawns one `wv-mpd-streaming` process per channel, tracks it by contentId,
waits for its HLS playlist to appear, and stops it via SIGTERM to the process
group. Linux-targeted (the binary is Linux; uses os.killpg / start_new_session).

Shared by the user "Watch" flow (/api/stream) and the admin controller (phase 3).
"""

import asyncio
import logging
import os
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


# contentId -> running process
_processes: dict[str, ChannelProcess] = {}


def _mode_for(content_type: str) -> str:
    """Map our content types to the binary's <vod|live> arg."""
    return "vod" if (content_type or "").strip().lower() == "vod" else "live"


def _playlist_path(content_id: str) -> Path:
    settings = get_settings()
    return Path(settings.hls_output_dir) / content_id / f"{content_id}.m3u8"


def _info(proc: ChannelProcess, *, ready: bool = True) -> dict:
    return {
        "contentId": proc.content_id,
        "channelTag": proc.channel_tag,
        "pid": proc.pid,
        "status": "playing" if ready else "starting",
        "hlsUrl": proc.hls_url,
        "startedAt": proc.started_at.isoformat(),
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


async def start_channel(
    *,
    content_id: str,
    manifest_url: str,
    content_type: str = "live",
    channel_tag: Optional[str] = None,
    device_id: Optional[str] = None,
) -> dict:
    settings = get_settings()

    if is_running(content_id):
        return _info(_processes[content_id])

    binary = Path(settings.wv_streaming_binary)
    if not binary.exists():
        raise FileNotFoundError(
            f"wv-mpd-streaming binary not found at '{binary}'. "
            "Build dstv-widevine-decryption and set WV_STREAMING_BINARY in .env."
        )

    logs_dir = Path(settings.hls_logs_dir)
    logs_dir.mkdir(parents=True, exist_ok=True)
    Path(settings.hls_output_dir).mkdir(parents=True, exist_ok=True)
    log_path = logs_dir / f"{content_id}.log"

    cmd = [str(binary), manifest_url, content_id, _mode_for(content_type)]
    effective_device = device_id or settings.wv_device_id
    if effective_device:
        cmd.append(effective_device)

    log_file = open(log_path, "ab", buffering=0)
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
    )
    _processes[content_id] = proc
    logger.info("Started wv-mpd-streaming for %s (pid %s): %s", content_id, popen.pid, " ".join(cmd))

    # Wait for the playlist to materialise (or the process to die / time out).
    playlist = _playlist_path(content_id)
    waited = 0.0
    timeout = settings.hls_ready_timeout_seconds
    while waited < timeout:
        if popen.poll() is not None:
            _cleanup(proc)
            _processes.pop(content_id, None)
            raise RuntimeError(
                f"wv-mpd-streaming exited early (code {popen.returncode}). See {log_path}."
            )
        if playlist.exists() and playlist.stat().st_size > 0:
            return _info(proc, ready=True)
        await asyncio.sleep(0.5)
        waited += 0.5

    # Still alive but no playlist yet — let it keep buffering; client can retry.
    return _info(proc, ready=False)


def stop_channel(content_id: str) -> bool:
    proc = _processes.pop(content_id, None)
    if proc is None:
        return False
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
    logger.info("Stopped wv-mpd-streaming for %s (pid %s)", content_id, proc.pid)
    return True


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
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            fh.seek(offset)
            data = fh.read()
        return data, size
    except OSError:
        return "", offset

import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from app.models.catalog import CatalogCard, CatalogLink, CatalogRail
from app.services.dstv_channel_logos import channel_logo_for_tag
from app.models.live import LiveChannel
from app.models.navigation import NavigationSection

DASHBOARD_SECTIONS = {
    "home": {"title": "Home", "aliases": ["home", "dstv_now_home"]},
    "live": {"title": "Live TV", "aliases": ["live", "live_tv", "livetv"]},
    "movies": {"title": "Movies", "aliases": ["movies", "movie"]},
    "sport": {"title": "Sport", "aliases": ["sport", "sports"]},
    "tvshows": {"title": "TV Shows", "aliases": ["tv_shows", "tvshows", "tv shows"]},
    "kids": {"title": "Kids", "aliases": ["kids", "kids_corner"]},
    "search": {"title": "Search", "aliases": ["search"]},
}


def _first(*values: Any) -> Optional[Any]:
    for v in values:
        if v is not None and v != "":
            return v
    return None


def _coerce_text(value: Any) -> Optional[str]:
    if value is None or value == "":
        return None
    if isinstance(value, list):
        parts = [str(item).strip() for item in value if item is not None and str(item).strip()]
        return ", ".join(parts) if parts else None
    text = str(value).strip()
    return text or None


def _extract_dstv_image_paths(paths: Any) -> Optional[str]:
    if not isinstance(paths, dict):
        return None
    for key in ("LARGE", "XLARGE", "MEDIUM", "THUMB", "SMALL", "DEFAULT"):
        val = paths.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    for val in paths.values():
        if isinstance(val, str) and val.strip().startswith("http"):
            return val.strip()
    return None


def _extract_image(item: Dict[str, Any]) -> Optional[str]:
    for paths_key in ("channelLogoPathsWeb", "channelLogoPaths", "thumbnailImagePaths"):
        url = _extract_dstv_image_paths(item.get(paths_key))
        if url:
            return url

    images = item.get("images") or item.get("imageSet") or item.get("thumbnails") or []
    if isinstance(images, dict):
        for key in ("poster", "thumbnail", "landscape", "portrait", "hero", "LARGE", "XLARGE", "MEDIUM"):
            val = images.get(key)
            if isinstance(val, str):
                return val
            if isinstance(val, dict):
                url = val.get("url") or val.get("href")
                if url:
                    return url
    if isinstance(images, list):
        for img in images:
            if isinstance(img, str):
                return img
            if isinstance(img, dict):
                url = _first(img.get("url"), img.get("href"), img.get("src"))
                if url:
                    return url
    return _first(
        item.get("image"),
        item.get("poster"),
        item.get("thumbnail"),
        item.get("thumbnailUrl"),
        item.get("logo"),
        item.get("channelLogo"),
        item.get("logoUrl"),
    )


def _extract_links(item: Dict[str, Any]) -> List[CatalogLink]:
    links: List[CatalogLink] = []
    raw_links = item.get("links") or item.get("_links") or []
    if isinstance(raw_links, dict):
        for rel, link in raw_links.items():
            if isinstance(link, dict):
                href = link.get("href") or link.get("url")
                if href:
                    links.append(CatalogLink(rel=[rel], method=link.get("method", "GET"), href=href))
            elif isinstance(link, str):
                links.append(CatalogLink(rel=[rel], method="GET", href=link))
    elif isinstance(raw_links, list):
        for link in raw_links:
            if isinstance(link, dict):
                href = link.get("href") or link.get("url")
                if href:
                    rel = link.get("rel") or link.get("relation") or []
                    if isinstance(rel, str):
                        rel = [rel]
                    links.append(
                        CatalogLink(
                            rel=rel,
                            method=link.get("method", "GET"),
                            href=href,
                        )
                    )
    return links


_SEASON_LINK_RE = re.compile(
    r"stacks/(?P<stack>[^/]+)/programs/(?P<program>[^/]+)/seasons/(?P<season>[^/?#]+)",
    re.IGNORECASE,
)


def _parse_season_ids_from_href(href: str) -> Optional[Tuple[str, str, str]]:
    match = _SEASON_LINK_RE.search(href or "")
    if not match:
        return None
    return match.group("stack"), match.group("program"), match.group("season")


def _parse_season_ids(item: Dict[str, Any], links: List[CatalogLink]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    for link in links:
        parsed = _parse_season_ids_from_href(link.href)
        if parsed:
            return parsed

    stack_id = _first(item.get("stack_id"), item.get("stackId"))
    program_id = _first(item.get("program_id"), item.get("programId"))
    season_id = _first(item.get("season_id"), item.get("seasonId"))
    if stack_id and program_id and season_id:
        return str(stack_id), str(program_id), str(season_id)
    return None, None, None


def _infer_rail_layout(row: Dict[str, Any], index: int) -> str:
    raw = str(
        _first(
            row.get("layout"),
            row.get("row_type"),
            row.get("rowType"),
            row.get("display"),
            row.get("type"),
            row.get("name"),
        )
        or ""
    ).lower()

    if index == 0 or any(token in raw for token in ("hero", "billboard", "featured", "spotlight")):
        return "hero"
    if any(token in raw for token in ("portrait", "vertical", "poster")):
        return "portrait"
    if any(token in raw for token in ("category", "genre", "square", "discover")):
        return "category"
    return "landscape"


def _row_items(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    for key in ("items", "content", "cards", "tiles", "assets", "contents", "entries"):
        val = row.get(key)
        if isinstance(val, list):
            return [i for i in val if isinstance(i, dict)]
    return []


_DTV_PAGE_SECTION_TYPES = frozenset({"billboard", "layouts", "vod_with_layout", "vod"})


def _is_dstv_page_sections(items: List[Any]) -> bool:
    if not items or not isinstance(items[0], dict):
        return False
    sample = items[0]
    return str(sample.get("type") or "").lower() in _DTV_PAGE_SECTION_TYPES and isinstance(
        sample.get("items"), list
    )


def _infer_section_rail_layout(section: Dict[str, Any]) -> str:
    section_type = str(section.get("type") or "").lower()
    features = section.get("features") or []
    feature_tokens = {str(f).lower() for f in features} if isinstance(features, list) else set()

    if section_type == "billboard" or "hero" in feature_tokens:
        return "hero"
    if section_type == "layouts":
        return "category"
    if "small_16x9" in feature_tokens:
        return "landscape"
    if "poster" in feature_tokens:
        return "portrait"
    return "landscape"


def _href_from_links(links: List[Any], *wanted_rels: str) -> Optional[str]:
    wanted = {rel.lower() for rel in wanted_rels}
    for link in links:
        rels: Any
        href: Any
        if isinstance(link, dict):
            rels = link.get("rel") or []
            href = link.get("href") or link.get("url")
        elif hasattr(link, "rel") and hasattr(link, "href"):
            rels = getattr(link, "rel", []) or []
            href = getattr(link, "href", None)
        else:
            continue
        if isinstance(rels, str):
            rels = [rels]
        rel_set = {str(r).lower() for r in rels}
        if rel_set.intersection(wanted) and href:
            return str(href).strip()
    return None


def _format_event_window(start: Any, end: Any) -> Optional[str]:
    if not start or not end:
        return None
    try:
        from datetime import datetime

        def _parse(value: str) -> datetime:
            normalized = value.replace("+0000", "+00:00").replace("Z", "+00:00")
            return datetime.fromisoformat(normalized)

        start_dt = _parse(str(start))
        end_dt = _parse(str(end))
        return f"{start_dt.strftime('%H:%M')} - {end_dt.strftime('%H:%M')}"
    except (TypeError, ValueError):
        return None


def pick_best_image_for_layout(images: Any, layout: str) -> Optional[str]:
    if layout == "hero":
        preferred_rels = ("billboard", "hero", "poster")
    elif layout == "category":
        preferred_rels = ("poster-landscape", "hero", "billboard", "poster")
    elif layout == "portrait":
        preferred_rels = ("poster", "portrait-iconic", "poster-landscape", "hero")
    else:
        preferred_rels = ("poster-landscape", "16x9", "hero", "billboard", "poster")

    if not images:
        return None

    if isinstance(images, dict):
        for rel in preferred_rels:
            url = _pick_size_url(images.get(rel))
            if url:
                return url
        return pick_best_image(images)

    if isinstance(images, list):
        for rel in preferred_rels:
            for image in images:
                if not isinstance(image, dict):
                    continue
                rels = image.get("rel") or []
                if isinstance(rels, str):
                    rels = [rels]
                if rel in {str(r) for r in rels}:
                    href = image.get("href") or image.get("url")
                    if href:
                        return str(href)
        return pick_best_image(images)

    return pick_best_image(images)


def _normalize_catalog_card(
    item: Dict[str, Any], section: str, layout_hint: str = "landscape"
) -> Optional[CatalogCard]:
    item_id = _first(item.get("id"), item.get("contentId"), item.get("assetId"), item.get("guid"))
    title = _first(item.get("title"), item.get("name"), item.get("headline"))
    if not item_id or not title:
        return None

    duration = _first(
        item.get("duration"),
        item.get("durationFormatted"),
        item.get("runtime"),
        item.get("duration_in_seconds"),
        (item.get("metadata") or {}).get("duration") if isinstance(item.get("metadata"), dict) else None,
    )
    if isinstance(duration, (int, float)):
        duration = _format_duration_seconds(int(duration)) if duration > 60 else f"{int(duration)} min"

    raw_item_links = item.get("links") or item.get("_links") or []
    links = _extract_links(item)
    stack_id, program_id, season_id = _parse_season_ids(item, links)

    images = item.get("images") or item.get("imageSet") or item.get("thumbnails")
    image = pick_best_image_for_layout(images, layout_hint) if images else _extract_image(item)

    channel = item.get("channel") if isinstance(item.get("channel"), dict) else {}
    channel_tag = _first(
        item.get("channel_tag"),
        item.get("channelTag"),
        channel.get("channel_tag"),
        channel.get("channelTag"),
    )
    channel_number = _first(item.get("channel_number"), item.get("channelNumber"))

    raw_type = str(_first(item.get("type"), item.get("contentType"), item.get("assetType"), "vod")).lower()
    is_live = False
    manifest_hint = None

    if raw_type == "event":
        item_type = "live"
        is_live = True
        link_source = raw_item_links if isinstance(raw_item_links, list) else links
        manifest_hint = _href_from_links(link_source, "stream")
        event_window = _format_event_window(item.get("start_date_time"), item.get("end_date_time"))
        label = item.get("label") if isinstance(item.get("label"), dict) else {}
        label_text = label.get("text") if isinstance(label, dict) else None
        if event_window and label_text:
            duration = f"{event_window} | {label_text}"
        elif event_window:
            duration = event_window
        elif label_text:
            duration = str(label_text)
    elif raw_type == "layout":
        item_type = "category"
    elif raw_type == "programs":
        item_type = "vod"
    else:
        item_type = raw_type
        if item_type in ("streaming", "highlight", "vod"):
            manifest_hint = _streaming_manifest_hint(item)

    genres = item.get("genres")
    category = section
    if isinstance(genres, dict):
        category = _first(genres.get("group"), genres.get("primary"), section) or section
    elif isinstance(genres, list) and genres:
        category = str(genres[0])
    else:
        category = str(_first(item.get("category"), item.get("genre"), section))

    return CatalogCard(
        id=str(item_id),
        title=str(title),
        type=item_type,
        description=_first(item.get("description"), item.get("synopsis"), item.get("summary"), item.get("episode_title")),
        image=image,
        category=str(category),
        duration=str(duration) if duration else None,
        channel_tag=str(channel_tag) if channel_tag else None,
        channel_number=str(channel_number) if channel_number else None,
        is_live=is_live,
        manifest_hint=manifest_hint,
        stack_id=stack_id,
        program_id=program_id,
        season_id=season_id,
        links=links,
    )


def normalize_catalog_page(data: Any, section: str) -> List[CatalogRail]:
    if not isinstance(data, dict):
        return []

    page_items = data.get("items")
    if isinstance(page_items, list) and _is_dstv_page_sections(page_items):
        rails: List[CatalogRail] = []
        for index, page_section in enumerate(page_items):
            if not isinstance(page_section, dict):
                continue
            layout = _infer_section_rail_layout(page_section)
            cards: List[CatalogCard] = []
            for item in _row_items(page_section):
                card = _normalize_catalog_card(item, section, layout_hint=layout)
                if card:
                    cards.append(card)
            if not cards:
                continue

            rail_id = str(_first(page_section.get("id"), page_section.get("title"), f"rail-{index}"))
            rail_title = str(_first(page_section.get("title"), page_section.get("name"), "Sport"))
            if layout == "hero":
                rail_title = ""
            rails.append(
                CatalogRail(
                    id=rail_id,
                    title=rail_title,
                    layout=layout,  # type: ignore[arg-type]
                    items=cards,
                )
            )
        if rails:
            return rails

    rows = data.get("rows") or data.get("sections") or data.get("rails") or data.get("page_sections") or []
    rails: List[CatalogRail] = []

    if isinstance(rows, list) and rows:
        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                continue
            layout = _infer_rail_layout(row, index)
            items_raw = _row_items(row)
            cards: List[CatalogCard] = []
            for item in items_raw:
                card = _normalize_catalog_card(item, section, layout_hint=layout)
                if card:
                    cards.append(card)
            if not cards:
                continue

            rail_id = str(_first(row.get("id"), row.get("name"), row.get("title"), f"rail-{index}"))
            rail_title = str(_first(row.get("title"), row.get("name"), row.get("heading"), "Sport"))
            rails.append(
                CatalogRail(
                    id=rail_id,
                    title=rail_title,
                    layout=layout,  # type: ignore[arg-type]
                    items=cards,
                )
            )
        if rails:
            return rails

    flat_items = _collect_catalog_items(data)
    if isinstance(page_items, list) and _is_dstv_page_sections(page_items):
        flat_items = []
        for page_section in page_items:
            if isinstance(page_section, dict):
                flat_items.extend(_row_items(page_section))

    cards = []
    for item in flat_items:
        card = _normalize_catalog_card(item, section)
        if card:
            cards.append(card)
    if cards:
        return [CatalogRail(id="sport-all", title="Sport", layout="landscape", items=cards)]
    return []


def normalize_season_detail(meta: Any) -> Dict[str, Any]:
    root = meta
    if isinstance(meta, dict) and isinstance(meta.get("data"), dict):
        root = meta["data"]
    if not isinstance(root, dict):
        root = {}

    channel = root.get("channel") if isinstance(root.get("channel"), dict) else {}
    genres = root.get("genres") if isinstance(root.get("genres"), dict) else {}

    videos: List[Dict[str, Any]] = []
    for video in root.get("videos") or []:
        if not isinstance(video, dict):
            continue
        playback_id = None
        manifest_hint = _streaming_manifest_hint(video)
        for asset in video.get("video_assets") or []:
            if isinstance(asset, dict) and asset.get("id"):
                playback_id = str(asset["id"])
                break
        if not playback_id:
            playback_id = str(_first(video.get("id"), ""))
        if not playback_id:
            continue

        duration_sec = video.get("duration_in_seconds")
        duration = None
        if isinstance(duration_sec, (int, float)) and duration_sec > 0:
            duration = _format_duration_seconds(int(duration_sec))

        videos.append(
            {
                "id": playback_id,
                "title": str(_first(video.get("title"), video.get("series_title"), root.get("title"))),
                "synopsis": _first(video.get("synopsis"), video.get("series_title")),
                "duration": duration,
                "image": pick_best_image(video.get("images") or []) or _extract_image(video),
                "manifest_hint": manifest_hint,
                "content_type": "streaming",
            }
        )

    stack_id = None
    program_id = None
    for link in root.get("links") or []:
        if isinstance(link, dict):
            parsed = _parse_season_ids_from_href(str(link.get("href") or ""))
            if parsed:
                stack_id, program_id, _ = parsed
                break

    return {
        "id": str(_first(root.get("id"), "")),
        "title": str(_first(root.get("title"), "Season")),
        "synopsis": _first(root.get("synopsis"), root.get("description")),
        "image": pick_best_image(root.get("images") or []) or _extract_image(root),
        "channel_name": _first(channel.get("channel_name"), channel.get("name")),
        "channel_tag": _first(channel.get("channel_tag"), channel.get("channelTag")),
        "genre": _first(genres.get("primary"), genres.get("group")),
        "stack_id": stack_id or "",
        "program_id": program_id or "",
        "videos": videos,
    }


def _normalize_slug(value: str) -> str:
    return value.lower().replace(" ", "_").replace("-", "_")


def normalize_navigation(data: Any) -> List[NavigationSection]:
    sections: List[NavigationSection] = []
    items: List[Any] = []

    if isinstance(data, dict):
        items = (
            data.get("menuItems")
            or data.get("items")
            or data.get("navigation")
            or data.get("sections")
            or []
        )
        if not items and "data" in data:
            items = data["data"] if isinstance(data["data"], list) else []
    elif isinstance(data, list):
        items = data

    seen_slugs: set[str] = set()

    for item in items:
        if not isinstance(item, dict):
            continue
        raw_id = _first(item.get("id"), item.get("slug"), item.get("name"), item.get("title"))
        raw_title = _first(item.get("title"), item.get("name"), item.get("label"), raw_id)
        if not raw_id or not raw_title:
            continue

        slug = _normalize_slug(str(item.get("slug") or item.get("id") or raw_title))
        title = str(raw_title)

        matched_key: Optional[str] = None
        for key, meta in DASHBOARD_SECTIONS.items():
            if slug in meta["aliases"] or _normalize_slug(title) in meta["aliases"]:
                matched_key = key
                title = meta["title"]
                slug = key
                break

        if matched_key is None and slug not in DASHBOARD_SECTIONS:
            continue

        if slug in seen_slugs:
            continue
        seen_slugs.add(slug)

        endpoint = _first(
            item.get("endpoint"),
            item.get("href"),
            item.get("url"),
            (item.get("link") or {}).get("href") if isinstance(item.get("link"), dict) else None,
        )

        visible = item.get("visible", item.get("isVisible", True))
        if isinstance(visible, str):
            visible = visible.lower() not in ("false", "0", "hidden")

        sections.append(
            NavigationSection(
                id=str(raw_id),
                title=title,
                slug=slug,
                visible=bool(visible),
                endpoint=str(endpoint) if endpoint else None,
            )
        )

    if not sections:
        for key, meta in DASHBOARD_SECTIONS.items():
            sections.append(
                NavigationSection(
                    id=key,
                    title=meta["title"],
                    slug=key,
                    visible=key != "search",
                    endpoint=None,
                )
            )

    return sections


def _pick_size_url(size_map: Any) -> Optional[str]:
    if isinstance(size_map, str) and size_map.strip():
        return size_map.strip()
    if not isinstance(size_map, dict):
        return None
    for size in ("XLARGE", "LARGE", "MEDIUM", "SMALL", "THUMB", "DEFAULT"):
        url = size_map.get(size)
        if isinstance(url, str) and url.strip():
            return url.strip()
    for url in size_map.values():
        if isinstance(url, str) and url.strip().startswith("http"):
            return url.strip()
    href = size_map.get("href") or size_map.get("url")
    return str(href).strip() if href else None


def pick_best_image(images: Any) -> Optional[str]:
    if not images:
        return None

    if isinstance(images, dict):
        # DStv granular_catalogue: { "poster-landscape": { "LARGE": "https://..." }, ... }
        preferred_groups = (
            "poster-landscape",
            "hero",
            "poster",
            "play-image",
            "portrait-iconic",
            "billboard",
            "show-logo",
            "square-iconic",
        )
        for group in preferred_groups:
            url = _pick_size_url(images.get(group))
            if url:
                return url

        for value in images.values():
            url = _pick_size_url(value)
            if url:
                return url

        return _pick_size_url(images)

    if not isinstance(images, list):
        return None

    preferred_rels = ["poster-landscape", "hero", "billboard", "poster"]
    for rel in preferred_rels:
        for image in images:
            if isinstance(image, str) and image.strip():
                continue
            if not isinstance(image, dict):
                continue
            rels = image.get("rel") or []
            if isinstance(rels, str):
                rels = [rels]
            if rel in rels:
                href = image.get("href") or image.get("url")
                if href:
                    return str(href)

    first = images[0]
    if isinstance(first, str):
        return first.strip() or None
    if isinstance(first, dict):
        return _pick_size_url(first)
    return None


def normalize_test_video_card(meta: Any, fallback_id: str) -> Dict[str, Any]:
    root = meta
    if isinstance(meta, dict) and isinstance(meta.get("data"), dict):
        root = meta["data"]

    if not isinstance(root, dict):
        root = {}

    duration = _first(
        root.get("duration"),
        root.get("runtime"),
        root.get("durationFormatted"),
        root.get("duration_in_seconds"),
    )
    if isinstance(duration, (int, float)):
        total_seconds = int(duration)
        if total_seconds > 120:
            duration = f"{total_seconds // 60} min"
        else:
            duration = f"{total_seconds} min"

    images = root.get("images") or root.get("imageSet") or root.get("thumbnails") or []
    image = pick_best_image(images) or _extract_image(root)

    return {
        "id": str(_first(root.get("id"), root.get("genref"), root.get("contentId"), fallback_id)),
        "title": str(_first(root.get("title"), root.get("name"), f"Video {fallback_id}")),
        "type": "vod",
        "category": "Test",
        "description": _first(root.get("synopsis"), root.get("description"), root.get("summary")),
        "duration": str(duration) if duration else None,
        "image": image,
        "playable": True,
        "metadataStatus": "ok",
    }


def _season_video_matches(video: Dict[str, Any], asset_id: str, content_id: str) -> bool:
    needle = asset_id.strip().upper()
    cid = content_id.strip().upper()
    if not needle and not cid:
        return False

    vid = str(_first(video.get("id"), "") or "").upper()
    if needle and needle in vid:
        return True
    if cid and cid in vid:
        return True

    ext = video.get("external_reference")
    if isinstance(ext, dict):
        for key in ("gen_ref", "video_meta_id", "slug", "uid"):
            val = str(_first(ext.get(key), "") or "").upper()
            if needle and needle in val:
                return True
            if cid and cid in val:
                return True

    for asset in video.get("video_assets") or []:
        if not isinstance(asset, dict):
            continue
        aid = str(_first(asset.get("id"), asset.get("man_item_id"), "") or "").upper()
        if needle and needle in aid:
            return True
        if cid and cid in aid:
            return True
    return False


def _format_duration_seconds(total_seconds: int) -> str:
    if total_seconds >= 3600:
        hours, rem = divmod(total_seconds, 3600)
        minutes = rem // 60
        return f"{hours}h {minutes}m" if minutes else f"{hours}h"
    minutes = max(1, total_seconds // 60)
    return f"{minutes} min"


def _streaming_manifest_hint(video: Dict[str, Any]) -> Optional[str]:
    for asset in video.get("video_assets") or []:
        if not isinstance(asset, dict):
            continue
        if str(asset.get("type") or "").upper() != "STREAMING":
            continue
        url = str(_first(asset.get("url"), "") or "").strip()
        if not url:
            continue
        if url.endswith(".mpd"):
            return url
        return f"{url.rstrip('/')}/.mpd"
    return None


def normalize_test_season_item(
    meta: Any,
    asset_id: str,
    content_id: str,
) -> Dict[str, Any]:
    root = meta
    if isinstance(meta, dict) and isinstance(meta.get("data"), dict):
        root = meta["data"]
    if not isinstance(root, dict):
        root = {}

    videos = root.get("videos") or []
    match: Optional[Dict[str, Any]] = None
    if isinstance(videos, list):
        for video in videos:
            if isinstance(video, dict) and _season_video_matches(video, asset_id, content_id):
                match = video
                break

    if match is None:
        return {
            "id": content_id,
            "title": str(_first(root.get("title"), f"Season {asset_id}")),
            "type": "streaming",
            "category": "Sport",
            "description": _first(root.get("synopsis"), root.get("description")),
            "duration": None,
            "image": pick_best_image(root.get("images") or []) or _extract_image(root),
            "playable": True,
            "metadataStatus": "fallback",
        }

    duration_sec = match.get("duration_in_seconds")
    duration: Optional[str] = None
    if isinstance(duration_sec, (int, float)) and duration_sec > 0:
        duration = _format_duration_seconds(int(duration_sec))

    playback_id = content_id
    for asset in match.get("video_assets") or []:
        if isinstance(asset, dict) and asset.get("id"):
            playback_id = str(asset["id"])
            break

    return {
        "id": playback_id,
        "title": str(_first(match.get("title"), match.get("series_title"), root.get("title"))),
        "type": "streaming",
        "category": "Sport",
        "description": _first(match.get("synopsis"), match.get("series_title"), root.get("synopsis")),
        "duration": duration,
        "image": pick_best_image(match.get("images") or []) or _extract_image(match),
        "manifest_hint": _streaming_manifest_hint(match),
        "playable": True,
        "metadataStatus": "ok",
    }


def _collect_catalog_items(data: Any) -> List[Dict[str, Any]]:
    if isinstance(data, list):
        return [i for i in data if isinstance(i, dict)]
    if not isinstance(data, dict):
        return []

    for key in ("items", "content", "cards", "tiles", "results", "entries", "assets"):
        val = data.get(key)
        if isinstance(val, list) and val:
            return [i for i in val if isinstance(i, dict)]

    rows = data.get("rows") or data.get("sections") or data.get("rails") or []
    collected: List[Dict[str, Any]] = []
    if isinstance(rows, list):
        for row in rows:
            if not isinstance(row, dict):
                continue
            for key in ("items", "content", "cards", "tiles", "assets"):
                val = row.get(key)
                if isinstance(val, list):
                    collected.extend(i for i in val if isinstance(i, dict))
    return collected


def normalize_catalog(data: Any, section: str) -> List[CatalogCard]:
    page = normalize_catalog_page(data, section)
    cards: List[CatalogCard] = []
    for rail in page:
        cards.extend(rail.items)
    if cards:
        return cards

    items = _collect_catalog_items(data)
    for item in items:
        card = _normalize_catalog_card(item, section)
        if card:
            cards.append(card)
    return cards


LIVE_SECTION_FILTERS = {
    "home": lambda category, title: True,
    "movies": lambda category, title: bool(
        category and "Movies" in category
    ) or "movie" in title.lower(),
    "sport": lambda category, title: bool(
        category and category.startswith("Sport")
    ) or "sport" in title.lower(),
    "tvshows": lambda category, title: bool(
        category and ("Series" in category or "Shows" in category)
    ),
    "kids": lambda category, title: bool(
        category and "Kids" in category
    ) or "kids" in title.lower() or "cartoon" in title.lower(),
}


def manifest_hint_from_player_url(player_url: Optional[str]) -> Optional[str]:
    """Unsigned MPD path from a live channel playerUrl (no hdntl/hmac)."""
    if not player_url:
        return None
    parsed = urlparse(str(player_url).strip())
    path = parsed.path.lstrip("/")
    if not path:
        return None
    if path.endswith(".ism"):
        return f"{path}/.mpd"
    if path.endswith(".mpd"):
        return path
    return None


def _live_manifest_hint(item: Dict[str, Any]) -> Optional[str]:
    streams = item.get("streams") if isinstance(item.get("streams"), list) else []
    for stream in streams:
        if not isinstance(stream, dict):
            continue
        hint = manifest_hint_from_player_url(stream.get("playerUrl"))
        if hint:
            return hint
    return None


def filter_live_channels_for_section(channels: List[LiveChannel], section: str) -> List[LiveChannel]:
    predicate = LIVE_SECTION_FILTERS.get(section, LIVE_SECTION_FILTERS["home"])
    filtered = [
        channel
        for channel in channels
        if predicate(channel.category or "", channel.title)
    ]
    if section == "home":
        return channels[:48]
    return filtered


def live_channels_to_catalog_cards(channels: List[LiveChannel], section: str) -> List[CatalogCard]:
    filtered = filter_live_channels_for_section(channels, section)
    cards: List[CatalogCard] = []
    for channel in filtered:
        cards.append(
            CatalogCard(
                id=channel.id,
                title=channel.title,
                type="live",
                description=channel.currentEvent,
                image=channel.image,
                category=channel.category or section,
                duration=channel.duration,
                channel_tag=channel.channelTag,
                manifest_hint=channel.manifestHint,
            )
        )
    return cards


def normalize_live_channels(data: Any) -> List[LiveChannel]:
    items: List[Dict[str, Any]] = []
    if isinstance(data, list):
        items = [i for i in data if isinstance(i, dict)]
    elif isinstance(data, dict):
        for key in ("items", "channels", "events", "results", "channelEvents"):
            val = data.get(key)
            if isinstance(val, list):
                items.extend(i for i in val if isinstance(i, dict))
                break

    channels: List[LiveChannel] = []
    for item in items:
        channel_id = _first(item.get("id"), item.get("channelId"), (item.get("channel") or {}).get("id"))
        events = item.get("events") if isinstance(item.get("events"), list) else []
        current_event = events[0] if events and isinstance(events[0], dict) else {}

        title = _first(item.get("name"), item.get("channelName"), item.get("title"))
        if not title:
            continue

        item_id = _first(current_event.get("id"), channel_id, title)
        channel_tag = _first(
            current_event.get("channelTag"),
            item.get("channelAlias"),
            channel_id,
        )

        start = _first(current_event.get("startDateTime"), current_event.get("startTime"), current_event.get("start"))
        end = _first(current_event.get("endDateTime"), current_event.get("endTime"), current_event.get("end"))

        duration = current_event.get("duration")
        if not duration and start and end:
            duration = f"{start} – {end}"

        image = (
            _extract_image(item)
            or _extract_image(current_event)
            or _extract_dstv_image_paths(item.get("channelLogoPathsWeb"))
            or _extract_dstv_image_paths(item.get("channelLogoPaths"))
            or channel_logo_for_tag(str(channel_tag) if channel_tag else None)
        )

        channels.append(
            LiveChannel(
                id=str(item_id),
                channelId=str(channel_id) if channel_id else None,
                channelTag=str(channel_tag) if channel_tag else None,
                manifestHint=_live_manifest_hint(item),
                title=str(title),
                image=image,
                currentEvent=_first(
                    current_event.get("title"),
                    current_event.get("episodeTitle"),
                    current_event.get("eventTitle"),
                ),
                startTime=str(start) if start else None,
                endTime=str(end) if end else None,
                duration=str(duration) if duration else None,
                category=_coerce_text(
                    _first(
                        current_event.get("primaryGenre"),
                        current_event.get("genres"),
                        item.get("genres"),
                        item.get("primaryGenre"),
                    )
                ),
            )
        )

    return channels

"""Static DStv sport page payload (captured layout) for offline / auth-fallback UI."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict

# Full DStv sport page capture (249 cards across 16 rails). When present, used instead of build_sport_page_fixture().
_FIXTURE_JSON = Path(__file__).resolve().parent / "dstv_sport_page.json"


def _program(
    pid: str,
    title: str,
    poster: str,
    *,
    stack: str = "SS119483",
    program: str = "S119483",
) -> Dict[str, Any]:
    return {
        "id": pid,
        "type": "programs",
        "title": title,
        "season_number": "0",
        "images": [{"rel": ["poster", "MEDIUM"], "method": "GET", "href": poster}],
        "links": [
            {
                "rel": ["season"],
                "method": "GET",
                "href": (
                    f"virtual://dstv_now_production/vod/granular_catalogue/stacks/"
                    f"{stack}/programs/{program}/seasons/{pid}?country=ZA&subscription_package=PREMIUM"
                ),
            }
        ],
    }


def _layout(
    lid: str,
    title: str,
    genre: str,
    poster: str,
    hero: str | None = None,
) -> Dict[str, Any]:
    return {
        "id": f"sports_genre/{genre}",
        "type": "layout",
        "title": title,
        "description": f"The home of {title}",
        "links": [
            {
                "rel": ["layout"],
                "method": "GET",
                "href": (
                    f"virtual://dstv_now_production/pages/v2/sports_genre/{genre}"
                    "?platform_id=32faad53-5e7b-4cc0-9f33-000092e85950"
                ),
            }
        ],
        "images": [
            {"rel": ["poster-landscape"], "method": "GET", "href": poster},
            {
                "rel": ["hero"],
                "method": "GET",
                "href": hero or poster,
            },
        ],
    }


def _section(section_id: str, title: str, stype: str, items: list, features: list | None = None) -> Dict[str, Any]:
    return {
        "id": section_id,
        "title": title,
        "type": stype,
        "time_to_refresh_in_seconds": 120,
        "product": "dstv",
        "links": [],
        "items": items,
        "features": features or ["poster"],
    }


def build_sport_page_fixture() -> Dict[str, Any]:
    hero_event = {
        "id": "A11150250189",
        "type": "event",
        "channel_tag": "A11",
        "channel_number": "211",
        "title": "TC '26: Griquas v Black Lion",
        "season_number": "0",
        "episode_number": "0",
        "start_date_time": "2026-06-10T11:25:00.000+0000",
        "end_date_time": "2026-06-10T13:25:00.000+0000",
        "label": {"id": "live", "text": "Live"},
        "links": [
            {
                "rel": ["stream"],
                "method": "GET",
                "href": "https://i-live-cache.akamaized.net/USL08/A11/A11.isml?contentId=A11&keyId=131a6df2-567e-4e6c-b6ef-84b855e7c4e3",
            }
        ],
        "images": [
            {
                "rel": ["billboard", "hero"],
                "method": "GET",
                "href": "https://cdn.dstv.com/www.dstv.com/epg/guide2/original/291861_ToyotaChallengeFull.png",
            },
            {
                "rel": ["channel_logo"],
                "method": "GET",
                "href": "https://cdn.dstv.com/dstvcms/2020/09/01/SS_Logo_Rugby_4-3_001_xlrg.png",
            },
        ],
    }

    categories = [
        _layout(
            "football",
            "Football",
            "football",
            "https://images.dstv.stream/images/content/2025/09/11/16x9_Genre_Sport_Football_pre_thumb.jpg",
        ),
        _layout(
            "rugby",
            "Rugby",
            "rugby",
            "https://images.dstv.stream/images/content/2025/09/11/16x9_Genre_Sport_Rugby_pre_thumb.jpg",
        ),
        _layout(
            "motorsport",
            "Motorsport",
            "motorsport",
            "https://images.dstv.stream/images/content/2025/09/11/16x9_Genre_Sport_Motosport_pre_thumb.jpg",
        ),
        _layout(
            "golf",
            "Golf",
            "golf",
            "https://images.dstv.stream/images/content/2025/09/11/16x9_Genre_Sport_Golf_pre_thumb.jpg",
        ),
        _layout(
            "cricket",
            "Cricket",
            "cricket",
            "https://images.dstv.stream/images/content/2025/09/11/16x9_Genre_Sport_Cricket_pre_thumb.jpg",
        ),
        _layout(
            "discover_more",
            "Discover More",
            "discover_more",
            "https://images.dstv.stream/images/content/2026/01/28/Discover_More_16x9_pre_thumb.png",
        ),
        _layout(
            "wwe",
            "WWE",
            "wwe",
            "https://images.dstv.stream/images/content/2025/09/11/16x9_Genre_Sport_WWE_pre_thumb.jpg",
        ),
    ]

    fwc_hub = [
        _program(
            "STK06999",
            "2026 FIFA World Cup - Versus",
            "https://images.dstv.stream/images/vod/2026/06/08/IS20_STK06999_PP_med.jpg",
            stack="SS119499",
            program="S119499",
        ),
        _program(
            "STK07075",
            "Hugo Broos - Press Conference",
            "https://images.dstv.stream/images/vod/2026/06/08/IS20_STK07075_PP_med.jpg",
            stack="SS119781",
            program="S119781",
        ),
        _program(
            "STK03886",
            "FIFA World Cup Finals",
            "https://images.dstv.stream/images/vod/2026/06/01/IS20_STK03886_PP_med.jpg",
            stack="SS87905",
            program="S87905",
        ),
        _program(
            "STK06944",
            "International World Cup Friendly",
            "https://images.dstv.stream/images/vod/2026/06/05/E36B_STK06944_PP_med.jpg",
        ),
        _program(
            "STK06970",
            "Bafana: 2026 FWC Squad Announcement",
            "https://images.dstv.stream/images/vod/2026/06/10/IS20_STK06970_PP_med.jpg",
            stack="SS95106",
            program="S95106",
        ),
        _program(
            "STK06888",
            "2026 FIFA World Cup Countdown To Kick-off",
            "https://images.dstv.stream/images/vod/2026/05/10/IS20_STK06888_PP_med.jpg",
            stack="SS119440",
            program="S119440",
        ),
    ]

    must_watch = [
        _program(
            "b7879aeb-5203-4604-91ed-e284c04c524b",
            "WWE Raw",
            "https://images.dstv.stream/images/vod/2025/11/11/IS20_STK00067_PP_med.jpg",
            stack="SS94366",
            program="S94366",
        ),
        _program(
            "STK05994",
            "Formula One Monaco",
            "https://images.dstv.stream/images/vod/2026/06/07/E36B_STK05994_PP_med.jpg",
            stack="SS41245",
            program="S41245",
        ),
        _program(
            "STK06364",
            "Hungary MotoGP",
            "https://images.dstv.stream/images/vod/2025/08/25/IS20_STK06364_PP_med.jpg",
            stack="SS33980",
            program="S33980",
        ),
        _program(
            "STK06986",
            "United Rugby Championship Semi-Finals",
            "https://images.dstv.stream/images/vod/2026/06/05/IS20_STK06986_PP_med.jpg",
            stack="SS105057",
            program="S105057",
        ),
        _program(
            "STK01631",
            "UEFA Champions League Review",
            "https://images.dstv.stream/images/vod/2026/06/01/IS20_STK01631_PP_med.jpg",
            stack="SS46237",
            program="S46237",
        ),
        _program(
            "STK01168",
            "Roland Garros Finals",
            "https://images.dstv.stream/images/vod/2026/06/06/IS20_STK01168_PP_med.jpg",
            stack="SS61873",
            program="S61873",
        ),
    ]

    football = [
        _program(
            "STK07021",
            "Premier League 25/26",
            "https://images.dstv.stream/images/vod/2026/06/05/E36B_STK07021_PP_med.jpg",
            stack="SS108398",
            program="S108398",
        ),
        _program(
            "STK01631",
            "UEFA Champions League Review",
            "https://images.dstv.stream/images/vod/2026/06/01/IS20_STK01631_PP_med.jpg",
        ),
        _program(
            "STK07023",
            "Ligue 1 Top Goals",
            "https://images.dstv.stream/images/vod/2026/06/05/E36B_STK07023_PP_med.jpg",
            stack="SS118149",
            program="S118149",
        ),
        _program(
            "STK03840",
            "Bucs Camp",
            "https://images.dstv.stream/images/vod/2026/01/23/E36B_STK03840_PP_med.jpg",
            stack="SS108703",
            program="S108703",
        ),
        _program(
            "STK06943",
            "UEFA Champions League Final",
            "https://images.dstv.stream/images/vod/2026/05/29/IS20_STK06943_PP_med.jpg",
            stack="SS38365",
            program="S38365",
        ),
    ]

    f1_landscape = [
        {
            **_program(
                "STK05994",
                "Formula One Monaco",
                "https://images.dstv.stream/images/vod/2026/06/07/IS20_STK05994_LPS.jpg?presentation=small_16x9",
            ),
            "images": [
                {
                    "rel": ["16x9", "poster-landscape"],
                    "method": "GET",
                    "href": "https://images.dstv.stream/images/vod/2026/06/07/IS20_STK05994_LPS.jpg?presentation=small_16x9",
                }
            ],
        },
        {
            **_program(
                "STK06760",
                "F1 - Chequered Flag",
                "https://images.dstv.stream/images/vod/2026/03/07/E36B_STK06760_LPS.jpg?presentation=small_16x9",
            ),
            "images": [
                {
                    "rel": ["16x9", "poster-landscape"],
                    "method": "GET",
                    "href": "https://images.dstv.stream/images/vod/2026/03/07/E36B_STK06760_LPS.jpg?presentation=small_16x9",
                }
            ],
        },
        {
            **_program(
                "STK00978",
                "The F1 Show",
                "https://images.dstv.stream/images/vod/2026/03/06/E36B_STK00978_LPS.jpg?presentation=small_16x9",
            ),
            "images": [
                {
                    "rel": ["16x9", "poster-landscape"],
                    "method": "GET",
                    "href": "https://images.dstv.stream/images/vod/2026/03/06/E36B_STK00978_LPS.jpg?presentation=small_16x9",
                }
            ],
        },
    ]

    rugby = [
        _program(
            "STK06986",
            "United Rugby Championship Semi-Finals",
            "https://images.dstv.stream/images/vod/2026/06/05/IS20_STK06986_PP_med.jpg",
        ),
        _program(
            "STK03760",
            "Toyota Challenge",
            "https://images.dstv.stream/images/vod/2024/10/07/IS20_STK03760_PP_med.jpg",
            stack="SS104075",
            program="S104075",
        ),
        _program(
            "STK03204",
            "Super Rugby Pacific",
            "https://images.dstv.stream/images/vod/2026/02/20/E36B_STK03204_PP_med.jpg",
            stack="SS105984",
            program="S105984",
        ),
        _program(
            "STK06975",
            "Rugby's Greatest Rivalry",
            "https://images.dstv.stream/images/vod/2026/06/10/E36B_STK06975_PP_med.jpg",
            stack="SS101996",
            program="S101996",
        ),
    ]

    cricket = [
        {
            **_program(
                "STK02627",
                "England v New Zealand Test Series",
                "https://images.dstv.stream/images/vod/2026/06/05/IS20_STK02627_LPS.jpg?presentation=small_16x9",
            ),
            "images": [
                {
                    "rel": ["16x9", "poster-landscape"],
                    "method": "GET",
                    "href": "https://images.dstv.stream/images/vod/2026/06/05/IS20_STK02627_LPS.jpg?presentation=small_16x9",
                }
            ],
        },
        {
            **_program(
                "STK02547",
                "Indian Premier League T20",
                "https://images.dstv.stream/images/vod/2026/04/15/E36B_STK02547_LPS.jpg?presentation=small_16x9",
            ),
            "images": [
                {
                    "rel": ["16x9", "poster-landscape"],
                    "method": "GET",
                    "href": "https://images.dstv.stream/images/vod/2026/04/15/E36B_STK02547_LPS.jpg?presentation=small_16x9",
                }
            ],
        },
    ]

    discover_more = [
        _program(
            "STK07051",
            "Ilia Topuria v Justin Gaethje",
            "https://images.dstv.stream/images/vod/2026/06/08/IS20_STK07051_PP_med.jpg",
            stack="SS97918",
            program="S97918",
        ),
        _program(
            "STK06151",
            "The 360 Padel Show",
            "https://images.dstv.stream/images/vod/2026/05/30/IS20_STK06151_PP_med.jpg",
            stack="SS117271",
            program="S117271",
        ),
        _program(
            "STK03243",
            "World Surf League Presents",
            "https://images.dstv.stream/images/vod/2024/03/06/E36B_STK03243_PP_med.jpg",
            stack="SS102940",
            program="S102940",
        ),
        _program(
            "STK00920",
            "Watersports World",
            "https://images.dstv.stream/images/vod/2023/01/22/E36B_STK00920_PP_med.jpg",
            stack="SS33614",
            program="S33614",
        ),
        _program(
            "STK02189",
            "Diamond League",
            "https://images.dstv.stream/images/vod/2026/05/27/IS20_STK02189_PP_med.jpg",
            stack="SS79056",
            program="S79056",
        ),
    ]

    full_coverage = [
        _program(
            "STK06460",
            "United Rugby Championship Full Game",
            "https://images.dstv.stream/images/vod/2026/01/08/E36B_STK06460_PP_med.jpg",
            stack="SS105057",
            program="S105057",
        ),
        _program(
            "STK06947",
            "WWE Clash In Italy",
            "https://images.dstv.stream/images/vod/2026/06/01/IS20_STK06947_PP_med.jpg",
            stack="SS109004",
            program="S109004",
        ),
        _program(
            "STK02595",
            "Giro d'Italia",
            "https://images.dstv.stream/images/vod/2026/05/08/E36B_STK02595_PP_med.jpg",
            stack="SS85371",
            program="S85371",
        ),
        _program(
            "STK06063",
            "Rocket League Championship Series",
            "https://images.dstv.stream/images/vod/2025/06/07/E36B_STK06063_PP_med.jpg",
            stack="SS116814",
            program="S116814",
        ),
    ]

    golf = [
        _program(
            "STK06974",
            "the Memorial",
            "https://images.dstv.stream/images/vod/2026/06/04/IS20_STK06974_PP_med.jpg",
            stack="SS33482",
            program="S33482",
        ),
        _program(
            "STK01610",
            "Sunshine Tour",
            "https://images.dstv.stream/images/vod/2026/05/19/IS20_STK01610_PP_med.jpg",
            stack="SS35081",
            program="S35081",
        ),
        _program(
            "STK03452",
            "LIV Golf Invitational Series",
            "https://images.dstv.stream/images/vod/2026/05/07/E36B_STK03452_PP_med.jpg",
            stack="SS107448",
            program="S107448",
        ),
        _program(
            "STK02612",
            "PGA Tour The CUT",
            "https://images.dstv.stream/images/vod/2023/09/12/E36B_STK02612_PP_med.jpg",
            stack="SS99881",
            program="S99881",
        ),
    ]

    motorsport = [
        _program(
            "STK06364",
            "Hungary MotoGP",
            "https://images.dstv.stream/images/vod/2025/08/25/IS20_STK06364_PP_med.jpg",
            stack="SS33980",
            program="S33980",
        ),
        _program(
            "STK04934",
            "World Rally Championship",
            "https://images.dstv.stream/images/vod/2026/03/12/E36B_STK04934_PP_med.jpg",
            stack="SS42445",
            program="S42445",
        ),
        _program(
            "STK01957",
            "NASCAR Cup Series",
            "https://images.dstv.stream/images/vod/2024/02/05/IS20_STK01957_PP_med.jpg",
            stack="SS87192",
            program="S87192",
        ),
        _program(
            "STK02602",
            "Dakar Reveal",
            "https://images.dstv.stream/images/vod/2026/05/05/IS20_STK02602_PP_med.jpg",
            stack="SS118165",
            program="S118165",
        ),
    ]

    documentaries = [
        _program(
            "STK04890",
            "Chasing the Sun 2",
            "https://images.dstv.stream/images/vod/2025/10/21/IS20_STK04890_PP_med.jpg",
            stack="SS101848",
            program="S101848",
        ),
        _program(
            "STK02268",
            "Chasing the Sun",
            "https://images.dstv.stream/images/vod/2023/10/24/IS20_STK02268_PP_med.jpg",
            stack="SS101848",
            program="S101848",
        ),
        _program(
            "STK02381",
            "WWE Undertaker The Last Ride",
            "https://images.dstv.stream/images/vod/2026/04/26/IS20_STK02381_PP_med.jpg",
            stack="SS102784",
            program="S102784",
        ),
        _program(
            "STK05887",
            "Rewind - A Story of the Soweto Derby",
            "https://images.dstv.stream/images/vod/2026/02/22/E36B_STK05887_PP_med.jpg",
            stack="SS108601",
            program="S108601",
        ),
    ]

    wwe = [
        _program(
            "a997703e-34ad-425a-a22a-e69c606968c5",
            "WWE SmackDown LIVE",
            "https://images.dstv.stream/images/vod/2025/11/11/E36A_STK00068_PP_med.jpg",
            stack="SS94530",
            program="S94530",
        ),
        _program(
            "b7879aeb-5203-4604-91ed-e284c04c524b",
            "WWE Raw",
            "https://images.dstv.stream/images/vod/2025/11/11/IS20_STK00067_PP_med.jpg",
            stack="SS94366",
            program="S94366",
        ),
        _program(
            "STK01569",
            "WWE NXT",
            "https://images.dstv.stream/images/vod/2026/03/27/E36A_STK01569_PP_med.jpg",
            stack="SS99894",
            program="S99894",
        ),
        _program(
            "STK06846",
            "WrestleMania 2026",
            "https://images.dstv.stream/images/vod/2026/05/22/IS20_STK06846_PP_med.jpg",
            stack="SS109004",
            program="S109004",
        ),
    ]

    supersport_schools = [
        _program(
            "STK05022",
            "Football on 216",
            "https://images.dstv.stream/images/vod/2026/03/16/E36B_STK05022_PP_med.jpg",
            stack="SS114029",
            program="S114029",
        ),
        _program(
            "STK05342",
            "Rugby on 216",
            "https://images.dstv.stream/images/vod/2025/05/08/E36B_STK05342_PP_med.jpg",
            stack="SS114848",
            program="S114848",
        ),
        _program(
            "STK05754",
            "Hockey on 216",
            "https://images.dstv.stream/images/vod/2026/05/11/E36B_STK05754_PP_med.jpg",
            stack="SS116652",
            program="S116652",
        ),
        _program(
            "STK07087",
            "SuperSport Schools - Rising Stars",
            "https://images.dstv.stream/images/vod/2026/06/09/E36B_STK07087_PP_med.jpg",
            stack="SS119719",
            program="S119719",
        ),
    ]

    return {
        "page": 0,
        "page_size": 30,
        "total": 16,
        "count": 16,
        "items": [
            _section(
                "520cb3b0-d100-4b97-bb06-1360c9a04960",
                "Sport Billboard",
                "billboard",
                [hero_event],
                ["hero", "trailer"],
            ),
            _section(
                "c6fba9ad-2cdc-4984-9a81-f605cf47cd3f",
                "Sports",
                "layouts",
                categories,
                ["small_16x9", "play_in_billboard"],
            ),
            _section(
                "66ec4742-e8c3-4fbb-b635-acb336f31571",
                "FIFA World Cup 2026 Hub",
                "vod_with_layout",
                fwc_hub,
                ["poster", "play_in_billboard"],
            ),
            _section(
                "57fa44ad-662b-4184-bb2e-d83cc5ce92da",
                "Must Watch on SuperSport",
                "vod",
                must_watch,
                ["poster", "trailer", "play_in_billboard"],
            ),
            _section(
                "9a40fe69-726e-419e-a000-129c9d86d393",
                "Discover More",
                "vod_with_layout",
                discover_more,
                ["poster", "play_in_billboard"],
            ),
            _section(
                "7b32877f-3a3f-4ea0-a58b-1fc456a0c0ba",
                "Football",
                "vod_with_layout",
                football,
                ["poster", "play_in_billboard"],
            ),
            _section(
                "28f9c997-8efa-4e52-871c-40bead3507bc",
                "FIFA World Cup Build Up",
                "vod",
                fwc_hub[:4],
                ["small_16x9", "contained", "trailer", "play_in_container"],
            ),
            _section(
                "3b6ff46e-5a25-451e-b994-ab96ba2ce640",
                "Full Coverage",
                "vod",
                full_coverage,
                ["poster", "trailer", "play_in_billboard"],
            ),
            _section(
                "d5d09657-e184-4db3-ac5f-cf6972ab9831",
                "Formula One",
                "vod",
                f1_landscape,
                ["small_16x9", "contained", "trailer", "play_in_container"],
            ),
            _section(
                "97691d88-b97b-4fe8-8d80-841373d039b0",
                "Rugby",
                "vod_with_layout",
                rugby,
                ["poster", "play_in_billboard"],
            ),
            _section(
                "978b2ef5-8e26-4e4b-82c6-17f3fbe5bff4",
                "Cricket",
                "vod",
                cricket,
                ["small_16x9", "trailer", "play_in_billboard"],
            ),
            _section(
                "a5ec503e-07d4-446c-beeb-99fc7b90b1d2",
                "Golf",
                "vod_with_layout",
                golf,
                ["poster", "play_in_billboard"],
            ),
            _section(
                "33766a9c-46bb-4a56-a822-93854508dae9",
                "Motorsport",
                "vod_with_layout",
                motorsport,
                ["poster", "play_in_billboard"],
            ),
            _section(
                "8fc462d1-c0ab-4f8c-b417-1458ccc0eebe",
                "Hot Sport Documentaries",
                "vod",
                documentaries,
                ["poster", "trailer", "play_in_billboard"],
            ),
            _section(
                "d4023daf-1a92-42dd-8477-cb4bfc92bbec",
                "WWE",
                "vod_with_layout",
                wwe,
                ["poster", "play_in_billboard"],
            ),
            _section(
                "5b89ec42-7400-4422-a20c-65e6d8c0566e",
                "SuperSport Schools",
                "vod",
                supersport_schools,
                ["poster", "trailer", "play_in_billboard"],
            ),
        ],
    }


@lru_cache(maxsize=1)
def load_sport_page_fixture() -> Dict[str, Any]:
    if _FIXTURE_JSON.is_file():
        with _FIXTURE_JSON.open(encoding="utf-8") as handle:
            return json.load(handle)
    return build_sport_page_fixture()

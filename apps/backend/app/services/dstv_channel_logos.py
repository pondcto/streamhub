"""Known DStv SuperSport channel logos (public CDN)."""

from typing import Optional

# Channel tag -> 4:3 logo used on DStv EPG / Now app.
CHANNEL_LOGOS: dict[str, str] = {
    "FHD": "https://cdn.dstv.com/dstvcms/2020/09/01/SS_Logo_Grandstand_4-3_001_xlrg.png",
    "MSH": "https://cdn.dstv.com/dstvcms/2020/09/01/SS_Logo_Football_4-3_001_xlrg.png",
    "A11": "https://cdn.dstv.com/dstvcms/2020/09/01/SS_Logo_Rugby_4-3_001_xlrg.png",
    "PSH": "https://cdn.dstv.com/dstvcms/2020/09/01/SS_Logo_Premier_League_4-3_001_xlrg.png",
    "SSH": "https://cdn.dstv.com/dstvcms/2020/09/01/SS_Logo_Football_4-3_001_xlrg.png",
    "SCH": "https://cdn.dstv.com/dstvcms/2020/09/01/SS_Logo_Cricket_4-3_001_xlrg.png",
    "TEN": "https://cdn.dstv.com/dstvcms/2020/09/01/SS_Logo_Tennis_4-3_001_xlrg.png",
    "GSH": "https://cdn.dstv.com/dstvcms/2020/09/01/SS_Logo_Golf_4-3_001_xlrg.png",
    "MOT": "https://cdn.dstv.com/dstvcms/2020/09/01/SS_Logo_Motorsport_4-3_001_xlrg.png",
    "ACT": "https://cdn.dstv.com/dstvcms/2020/09/01/SS_Logo_Action_4-3_001_xlrg.png",
}


def channel_logo_for_tag(channel_tag: Optional[str]) -> Optional[str]:
    if not channel_tag:
        return None
    return CHANNEL_LOGOS.get(channel_tag.strip().upper())

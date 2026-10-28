"""Generate JukeBob's runtime manifest from the website-owned music catalog.

No media is fetched, decoded, transcoded, or loaded by this generator. Album
art derivatives and exact MP3 copies are prepared separately and checked here.
"""

import argparse
import json
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data/music.json"
OUTPUT = ROOT / "static/companion-bob/runtime/music/playlist.json"
RUNTIME = ROOT / "static/companion-bob/runtime"


def media_path(value):
    if not isinstance(value, str) or not re.fullmatch(r"music/[a-zA-Z0-9_/-]+\.(mp3|webp|png|jpg)", value):
        raise ValueError(f"Unsafe runtime music path: {value!r}")
    if ".." in value or not (RUNTIME / value).is_file():
        raise ValueError(f"Missing runtime music file: {value!r}")
    return value


def build(catalog):
    if catalog.get("version") != 1:
        raise ValueError("Unsupported music catalog version")
    albums, tracks, ids, album_ids = [], [], set(), set()
    for album in sorted(catalog["albums"], key=lambda row: row["displayOrder"]):
        album_id = album["id"]
        if not re.fullmatch(r"[a-z0-9-]+", album_id) or album_id in album_ids:
            raise ValueError("Album IDs must be unique stable slugs")
        album_ids.add(album_id)
        result = {key: album[key] for key in ("id", "title", "artist")}
        cover = album.get("cover")
        if cover:
            result["artwork"] = media_path(cover["src"])
            result["artworks"] = [
                {"src": media_path(image["src"]), "width": image["width"], "height": image["height"]}
                for image in cover["variants"]
            ]
        result["trackIds"] = []
        for number, track in enumerate(album["tracks"], 1):
            if track["number"] != number or track["id"] in ids or not re.fullmatch(r"[a-z0-9-]+", track["id"]):
                raise ValueError("Tracks must have unique IDs and consecutive album order")
            if not isinstance(track["duration"], (int, float)) or not math.isfinite(track["duration"]) or track["duration"] <= 0:
                raise ValueError("Every track needs a measured duration")
            ids.add(track["id"])
            result["trackIds"].append(track["id"])
            item = {key: track[key] for key in ("id", "title", "artist", "duration")}
            item.update(album=album["title"], albumId=album_id, src=media_path(track["src"]))
            if cover:
                item["artwork"] = result["artwork"]
            tracks.append(item)
        if not result["trackIds"]:
            raise ValueError("Albums cannot be empty")
        albums.append(result)
    if catalog["defaultTrackId"] not in ids:
        raise ValueError("Default track must exist")
    return {"version": 1, "station": catalog["station"], "defaultTrackId": catalog["defaultTrackId"], "albums": albums, "tracks": tracks}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if the committed runtime manifest is stale")
    args = parser.parse_args()
    payload = json.dumps(build(json.loads(CATALOG.read_text(encoding="utf-8"))), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != payload:
            raise SystemExit("Music runtime manifest is stale. Run scripts/generate_music_catalog.py.")
        print("Music catalog and generated runtime manifest agree.")
    else:
        OUTPUT.write_text(payload, encoding="utf-8", newline="\n")
        print(OUTPUT.relative_to(ROOT))


if __name__ == "__main__":
    main()

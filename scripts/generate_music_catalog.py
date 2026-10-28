"""Generate JukeBob's runtime manifest from the website-owned music catalog.

No media is fetched, decoded, or transcoded by this generator. Album art and
exact MP3 copies are prepared separately. Existing audio hashes are retained
when their size and any declared catalog hash agree with the prior export;
this metadata-only refresh is not an audit for same-size audio modifications.
"""

import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data/music.json"
OUTPUT = ROOT / "static/companion-bob/runtime/music/playlist.json"
RUNTIME = ROOT / "static/companion-bob/runtime"
BUILD_MANIFEST = RUNTIME / "build-manifest.json"


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


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def file_record(relative):
    payload = (RUNTIME / relative).read_bytes()
    return {"path": relative, "bytes": len(payload), "sha256": digest(payload)}


def valid_hash(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def refresh_build_manifest(previous, catalog, catalog_text, playlist_bytes):
    """Refresh catalog/art records without changing the runtime's provenance.

    Changed or new audio must have an explicit expected byte count and hash.
    Older tracks without those fields retain their verified export record.
    """
    if previous.get("version") != 1 or not previous.get("sources") or not previous.get("gameSourceCommit"):
        raise ValueError("A verified runtime build manifest is required; export the runtime first")
    source = previous.get("musicCatalogSource", {})
    if source.get("repository") != "LPeasy/outsideinprint" or source.get("path") != "data/music.json":
        raise ValueError("Runtime catalog provenance does not match this repository")
    records = {}
    for record in previous["files"]:
        relative = record.get("path", "")
        if (not isinstance(relative, str) or not relative or "\\" in relative
                or relative.startswith("/") or ":" in relative
                or any(part in ("", ".", "..") for part in relative.split("/"))
                or relative == "build-manifest.json" or relative in records
                or type(record.get("bytes")) is not int or record["bytes"] < 0
                or not valid_hash(record.get("sha256"))):
            raise ValueError("Invalid or duplicate runtime file record")
        records[relative] = copy.deepcopy(record)

    updated = {"music/playlist.json"}
    records["music/playlist.json"] = {
        "path": "music/playlist.json", "bytes": len(playlist_bytes), "sha256": digest(playlist_bytes),
    }
    for album in catalog["albums"]:
        cover = album.get("cover")
        if cover:
            for relative in {cover["src"], *(art["src"] for art in cover["variants"])}:
                media_path(relative)
                records[relative] = file_record(relative)
                updated.add(relative)
        for track in album["tracks"]:
            relative = media_path(track["src"])
            prior = records.get(relative)
            size = (RUNTIME / relative).stat().st_size
            expected_size, expected_hash = track.get("bytes"), track.get("sha256")
            if prior and size == prior["bytes"] and expected_size in (None, size) and expected_hash in (None, prior["sha256"]):
                continue
            if type(expected_size) is not int or expected_size != size or not valid_hash(expected_hash):
                raise ValueError(f"Changed audio needs verified byte/hash metadata: {relative}")
            record = file_record(relative)
            if record["sha256"] != expected_hash:
                raise ValueError(f"Audio does not match the declared hash: {relative}")
            records[relative] = record
            updated.add(relative)

    # A music-only refresh must not bless missing or changed runtime assets.
    # Their existing hashes and every source/provenance field remain untouched.
    for relative, record in records.items():
        if relative not in updated and (RUNTIME / relative).stat().st_size != record["bytes"]:
            raise ValueError(f"Runtime asset size changed; export the runtime first: {relative}")
    result = copy.deepcopy(previous)
    # Git text checkouts may use CRLF; the source binding always uses UTF-8 LF.
    result["musicCatalogSource"]["sha256"] = digest(catalog_text.replace("\r\n", "\n").replace("\r", "\n").encode("utf-8"))
    result["files"] = sorted(records.values(), key=lambda row: row["path"])
    result["totalBytes"] = sum(row["bytes"] for row in result["files"])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check the playlist and runtime catalog/art records without writing")
    args = parser.parse_args()
    catalog_text = CATALOG.read_text(encoding="utf-8")
    catalog = json.loads(catalog_text)
    payload = (json.dumps(build(catalog), ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    previous = json.loads(BUILD_MANIFEST.read_text(encoding="utf-8"))
    manifest = refresh_build_manifest(previous, catalog, catalog_text, payload)
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_bytes() != payload or previous != manifest:
            raise SystemExit("Music playlist or build-manifest catalog/art records are stale. Run scripts/generate_music_catalog.py.")
        print("Music catalog, playlist, and runtime catalog/art records agree.")
    else:
        OUTPUT.write_bytes(payload)
        BUILD_MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(OUTPUT.relative_to(ROOT))
        print(BUILD_MANIFEST.relative_to(ROOT))


if __name__ == "__main__":
    main()

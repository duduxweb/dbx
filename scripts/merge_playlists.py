#!/usr/bin/env python3
"""Build the full DBX M3U plus category-specific playlists and a compact API index."""
from collections import OrderedDict
from hashlib import sha1
import json
import re
import unicodedata
from pathlib import Path
from time import sleep
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen

BASE = "https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/"
SOURCES = (
    ("Canais.m3u8", "live"),
    ("Filmes-Series.m3u8", "vod"),
)
GROUP_RE = re.compile(r'group-title="([^"]*)"', re.IGNORECASE)


def fetch_source(name: str) -> list[str]:
    request = Request(BASE + name, headers={"User-Agent": "DBX-Playlist-Builder/1.0"})
    last_error = None
    for attempt in range(1, 4):
        try:
            with urlopen(request, timeout=180) as response:
                raw = response.read()
            return raw.decode("utf-8-sig", errors="replace").splitlines()
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt < 3:
                sleep(attempt * 5)
    raise RuntimeError(f"Could not fetch {name}: {last_error}")


def slugify(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name)
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name).strip("-")
    return slug[:70] or "sem-categoria"


def split_entries(lines: list[str]):
    entries = []
    current = []
    for line in lines:
        if line.lstrip().startswith("#EXTINF:"):
            if current:
                entries.append(current)
            current = [line]
        elif current:
            current.append(line)
            if line.strip() and not line.lstrip().startswith("#"):
                entries.append(current)
                current = []
    if current:
        entries.append(current)
    return entries


def entry_group(entry: list[str]) -> str:
    for line in entry:
        match = GROUP_RE.search(line)
        if match:
            return match.group(1).strip() or "Sem categoria"
        if line.upper().startswith("#EXTGRP:"):
            return line.split(":", 1)[1].strip() or "Sem categoria"
    return "Sem categoria"


def main() -> None:
    destination = Path("public")
    categories_dir = destination / "categories"
    categories_dir.mkdir(parents=True, exist_ok=True)

    master_lines = ["#EXTM3U"]
    groups: OrderedDict[tuple[str, str], list[list[str]]] = OrderedDict()
    for source, kind in SOURCES:
        lines = fetch_source(source)
        source_lines = [line for line in lines if line.strip() != "#EXTM3U"]
        master_lines.extend(source_lines)
        for entry in split_entries(source_lines):
            group = entry_group(entry)
            groups.setdefault((kind, group), []).append(entry)
        print(f"{source}: {sum(len(line.encode('utf-8')) + 1 for line in source_lines):,} bytes")

    master_path = destination / "playlist.m3u"
    master_path.write_text("\n".join(master_lines) + "\n", encoding="utf-8")
    print(f"Created {master_path}: {master_path.stat().st_size:,} bytes")

    used_slugs = {}
    index_categories = []
    for category_id, ((kind, group), entries) in enumerate(groups.items(), start=1):
        slug = slugify(group)
        key = (kind, group)
        if slug in used_slugs and used_slugs[slug] != key:
            slug += "-" + kind
        if slug in used_slugs and used_slugs[slug] != key:
            slug += "-" + sha1(f"{kind}:{group}".encode("utf-8")).hexdigest()[:8]
        used_slugs[slug] = key
        asset = f"category-{slug}.m3u"
        category_path = categories_dir / asset
        category_lines = ["#EXTM3U"]
        for entry in entries:
            category_lines.extend(entry)
        category_path.write_text("\n".join(category_lines) + "\n", encoding="utf-8")
        index_categories.append({
            "id": category_id,
            "name": group,
            "kind": kind,
            "slug": slug,
            "asset": asset,
            "url": f"https://github.com/duduxweb/dbx/releases/download/playlist-latest/{asset}",
            "count": len(entries),
            "bytes": category_path.stat().st_size,
        })
        print(f"{group}: {len(entries):,} entries -> {category_path.stat().st_size:,} bytes")

    index_path = destination / "categories-index.json"
    index_path.write_text(
        json.dumps({"generated_from": [name for name, _kind in SOURCES], "categories": index_categories},
                   ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"Created {index_path}: {index_path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()

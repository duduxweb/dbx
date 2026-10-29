#!/usr/bin/env python3
"""Build the full DBX M3U plus category-specific playlists and an API index."""
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
    "Canais.m3u8",
    "CanaisBR01.m3u8",
    "CanaisBR02.m3u8",
    "CanaisBR03.m3u8",
    "CanaisBR04.m3u8",
    "CanaisIPTV.m3u8",
    "Filmes-Series.m3u8",
)
GROUP_RE = re.compile(r'group-title="([^"]*)"', re.IGNORECASE)
LOGO_RE = re.compile(r'tvg-logo="([^"]*)"', re.IGNORECASE)
TVG_ID_RE = re.compile(r'tvg-id="([^"]*)"', re.IGNORECASE)


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


def entry_fields(entry: list[str]) -> dict:
    extinf = next((line for line in entry if line.lstrip().startswith("#EXTINF:")), "")
    title = extinf.rsplit(",", 1)[-1].strip() if "," in extinf else "Sem nome"
    url = next((line.strip() for line in entry if line.strip() and not line.lstrip().startswith("#")), "")
    logo = LOGO_RE.search(extinf)
    tvg_id = TVG_ID_RE.search(extinf)
    return {
        "name": title,
        "url": url,
        "logo": logo.group(1) if logo else "",
        "tvg_id": tvg_id.group(1) if tvg_id else "",
    }


def main() -> None:
    destination = Path("public")
    categories_dir = destination / "categories"
    categories_dir.mkdir(parents=True, exist_ok=True)

    master_lines = ["#EXTM3U"]
    groups: OrderedDict[str, list[list[str]]] = OrderedDict()
    for source in SOURCES:
        lines = fetch_source(source)
        source_lines = [line for line in lines if line.strip() != "#EXTM3U"]
        master_lines.extend(source_lines)
        for entry in split_entries(source_lines):
            group = entry_group(entry)
            groups.setdefault(group, []).append(entry)
        print(f"{source}: {sum(len(line.encode('utf-8')) + 1 for line in source_lines):,} bytes")

    master_path = destination / "playlist.m3u"
    master_path.write_text("\n".join(master_lines) + "\n", encoding="utf-8")
    print(f"Created {master_path}: {master_path.stat().st_size:,} bytes")

    used_slugs = {}
    index_categories = []
    for category_id, (group, entries) in enumerate(groups.items(), start=1):
        slug = slugify(group)
        if slug in used_slugs and used_slugs[slug] != group:
            slug += "-" + sha1(group.encode("utf-8")).hexdigest()[:8]
        used_slugs[slug] = group
        asset = f"category-{slug}.m3u"
        category_path = categories_dir / asset
        category_lines = ["#EXTM3U"]
        for entry in entries:
            category_lines.extend(entry)
        category_path.write_text("\n".join(category_lines) + "\n", encoding="utf-8")
        api_entries = [entry_fields(entry) for entry in entries]
        index_categories.append({
            "id": category_id,
            "name": group,
            "slug": slug,
            "asset": asset,
            "count": len(entries),
            "bytes": category_path.stat().st_size,
            "entries": api_entries,
        })
        print(f"{group}: {len(entries):,} entries -> {category_path.stat().st_size:,} bytes")

    index_path = destination / "categories-index.json"
    index_path.write_text(
        json.dumps({"generated_from": list(SOURCES), "categories": index_categories},
                   ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"Created {index_path}: {index_path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()

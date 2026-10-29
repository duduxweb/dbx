#!/usr/bin/env python3
"""Stream the current source playlists into one M3U file."""
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


def copy_source(name: str, output) -> int:
    url = BASE + name
    request = Request(url, headers={"User-Agent": "DBX-Playlist-Builder/1.0"})
    last_error = None

    for attempt in range(1, 4):
        try:
            total = 0
            with urlopen(request, timeout=180) as response:
                for line in response:
                    if line.lstrip(b"\xef\xbb\xbf").strip() == b"#EXTM3U":
                        continue
                    if not line.endswith(b"\n"):
                        line += b"\n"
                    output.write(line)
                    total += len(line)
            if total == 0:
                raise RuntimeError(f"{name} returned no playlist entries")
            return total
        except (HTTPError, URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt < 3:
                sleep(attempt * 5)

    raise RuntimeError(f"Could not fetch {name}: {last_error}")


def main() -> None:
    destination = Path("public/playlist.m3u")
    destination.parent.mkdir(parents=True, exist_ok=True)

    with destination.open("wb") as output:
        output.write(b"#EXTM3U\n")
        total_bytes = 0
        for name in SOURCES:
            size = copy_source(name, output)
            total_bytes += size
            print(f"{name}: {size:,} bytes")

    print(f"Created {destination}: {total_bytes:,} source bytes")


if __name__ == "__main__":
    main()

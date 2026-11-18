"""Cache the two exact runtime @requires (verify digests before executing them)."""

from hashlib import sha256
from pathlib import Path
from urllib.request import urlopen
import re

ROOT = Path(__file__).resolve().parents[1]


def requires(dest):
    dest.mkdir(parents=True, exist_ok=True)
    entries = re.findall(
        r"^// @require\s+(https://\S+?)#sha256=([0-9a-f]{64})$", (ROOT / "src/part1.js").read_text(), re.M
    )
    assert len(entries) == 2
    result = []
    for url, digest in entries:
        target = dest / digest
        if not target.is_file() or sha256(target.read_bytes()).hexdigest() != digest:
            with urlopen(url, timeout=30) as response:
                data = response.read()
            if sha256(data).hexdigest() != digest:
                raise ValueError("Wrong @require digest: " + url)
            target.write_bytes(data)
        result.append(target.read_bytes())
    return result

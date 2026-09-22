"""Section-aware chunking for the ingestion pipeline.

Splits extracted PDF text into pseudo-sections, then chunks each section on
paragraph boundaries with a size budget and overlap so that embeddings retain
local context.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.core.config import get_settings

_HEADING_RE = re.compile(
    r"^\s*((?:\d+\.?\s+)?(?:abstract|introduction|background|related work|methodology?|"
    r"methods|materials and methods|results?|discussion|conclusions?|references|"
    r"acknowledg(e)?ments?|appendix|evaluation|experiment(s)?|limitations|future work)\b.*)$",
    re.IGNORECASE,
)


@dataclass
class Chunk:
    section_name: str
    section_order: int
    chunk_index: int
    content: str


def split_sections(text: str) -> list[tuple[str, str]]:
    """Return [(section_name, section_text)] from raw PDF text."""
    sections: list[tuple[str, str]] = []
    current_name = "Front Matter"
    buffer: list[str] = []

    for line in text.splitlines():
        if _HEADING_RE.match(line.strip()) and len(line.strip()) < 90:
            if buffer:
                sections.append((current_name, "\n".join(buffer).strip()))
                buffer = []
            current_name = line.strip()[:200]
        else:
            buffer.append(line)

    if buffer:
        sections.append((current_name, "\n".join(buffer).strip()))

    return [(name, body) for name, body in sections if body]


def chunk_sections(
    text: str,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> list[Chunk]:
    """Split text into overlapping paragraph-boundary chunks per section."""
    settings = get_settings()
    size = chunk_size or settings.chunk_size
    overlap = chunk_overlap if chunk_overlap is not None else settings.chunk_overlap

    chunks: list[Chunk] = []
    index = 0

    for order, (section_name, section_text) in enumerate(split_sections(text)):
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", section_text) if p.strip()]
        current: list[str] = []
        current_len = 0

        for para in paragraphs:
            if len(para) > size:
                # Hard-split oversized paragraph
                if current:
                    chunks.append(Chunk(section_name, order, index, "\n".join(current)))
                    index += 1
                    current, current_len = [], 0
                for i in range(0, len(para), size - overlap):
                    piece = para[i : i + size]
                    chunks.append(Chunk(section_name, order, index, piece))
                    index += 1
                continue

            if current_len + len(para) + 1 > size and current:
                chunks.append(Chunk(section_name, order, index, "\n".join(current)))
                index += 1
                # keep tail overlap
                tail = "\n".join(current)[-overlap:]
                current, current_len = [tail] if overlap > 0 else [], len(tail)

            current.append(para)
            current_len += len(para) + 1

        if current:
            joined = "\n".join(current).strip()
            if joined:
                chunks.append(Chunk(section_name, order, index, joined))
                index += 1

    return chunks

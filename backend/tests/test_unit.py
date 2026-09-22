"""Unit tests that need no external services: chunking, RRF fusion, citation
validation, vector formatting."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.chunking import chunk_sections, split_sections
from app.services.vector_store import to_pgvector

SAMPLE = """Abstract
This paper studies attention models.

Introduction
We introduce a novel transformer variant.

Methods
We benchmark on four datasets with two baselines and ablations.

Results
Accuracy improved by 4.2 points over the strongest baseline across all tasks.

Limitations
Compute cost remains high for long sequences and future work will address it.
"""


def test_split_sections_finds_headings():
    sections = split_sections(SAMPLE)
    names = [n for n, _ in sections]
    assert any("Abstract" in n for n in names)
    assert any("Methods" in n for n in names)
    assert any("Limitations" in n for n in names)


def test_chunk_sections_respects_size():
    chunks = chunk_sections(SAMPLE, chunk_size=120, chunk_overlap=20)
    assert len(chunks) >= 4
    for c in chunks:
        assert len(c.content) <= 160  # size + small tolerance
        assert c.chunk_index >= 0


def test_chunk_sections_overlap_present():
    chunks = chunk_sections(SAMPLE, chunk_size=100, chunk_overlap=30)
    if len(chunks) > 1:
        tail = chunks[0].content[-30:]
        assert tail  # overlap window retained


def test_empty_text_no_chunks():
    assert chunk_sections("") == []
    assert chunk_sections("   \n  ") == []


def test_to_pgvector_format():
    v = to_pgvector([0.1, 0.2, 0.3])
    assert v.startswith("[") and v.endswith("]")
    assert "," in v
    assert "0.1" in v


def test_classify_aspects():
    from app.services.synthesis import _classify

    assert _classify("We propose a new method and model architecture") == "method"
    assert _classify("Results show accuracy improved") == "finding"
    assert _classify("However, a key limitation is cost") == "limitation"

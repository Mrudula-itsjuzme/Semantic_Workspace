"""Singleton embedding service.

Loads the fastembed model exactly once per process (API server and worker
alike) and guarantees the vector dimension matches settings everywhere.
"""
from __future__ import annotations

import threading
from typing import List, Sequence

from app.core.config import get_settings


class EmbeddingError(RuntimeError):
    """Raised when the embedding backend cannot produce vectors."""


class EmbeddingService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._model = None
        self._dim = get_settings().embedding_dim

    @property
    def dim(self) -> int:
        return self._dim

    @property
    def model_name(self) -> str:
        return get_settings().embedding_model

    def _load(self):
        if self._model is None:
            with self._lock:
                if self._model is None:  # double-checked locking
                    from fastembed import TextEmbedding

                    self._model = TextEmbedding(get_settings().embedding_model)
        return self._model

    def is_ready(self) -> bool:
        try:
            return self._model is not None or self._probe()
        except Exception:
            return False

    def _probe(self) -> bool:
        """Try loading without raising; used by health checks."""
        with self._lock:
            if self._model is None:
                try:
                    from fastembed import TextEmbedding

                    self._model = TextEmbedding(get_settings().embedding_model)
                except Exception:
                    return False
            return True

    def embed(self, texts: Sequence[str]) -> List[List[float]]:
        if not texts:
            return []
        model = self._load()
        vectors: List[List[float]] = []
        for vec in model.embed(list(texts)):
            v = [float(x) for x in vec]
            if len(v) != self._dim:
                raise EmbeddingError(
                    f"Embedding dim mismatch: model produced {len(v)}, expected {self._dim}"
                )
            vectors.append(v)
        return vectors

    def embed_one(self, text: str) -> List[float]:
        return self.embed([text])[0]


_embedding_service: EmbeddingService | None = None
_service_lock = threading.Lock()


def get_embedding_service() -> EmbeddingService:
    global _embedding_service
    if _embedding_service is None:
        with _service_lock:
            if _embedding_service is None:
                _embedding_service = EmbeddingService()
    return _embedding_service

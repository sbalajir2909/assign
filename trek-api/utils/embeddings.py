"""
Text embedding utility — bge-small-en-v1.5, 384-dim, L2-normalized.

The SentenceTransformer model is a module-level singleton: loaded once on
first call, reused for every subsequent embed_text() invocation.

embed_text() is intentionally synchronous.  Call sites inside async
functions should dispatch via asyncio.to_thread(embed_text, text) to avoid
blocking the event loop during CPU inference.
"""

from sentence_transformers import SentenceTransformer

_MODEL_NAME = "BAAI/bge-small-en-v1.5"
_MAX_CHARS = 1000

_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(_MODEL_NAME)
    return _model


def embed_text(text: str) -> list[float]:
    """
    Embeds text using bge-small-en-v1.5.
    Returns a Python list of 384 L2-normalized floats.
    Input is truncated to 1000 characters before encoding.
    """
    if len(text) > _MAX_CHARS:
        text = text[:_MAX_CHARS]
    embedding = _get_model().encode(text, normalize_embeddings=True)
    return embedding.tolist()

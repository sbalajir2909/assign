"""
Text embedding utility — @cf/baai/bge-small-en-v1.5 via Cloudflare AI API.
384-dim, L2-normalized output. Same model as before, zero local dependencies.

embed_text() is async — call it with `await embed_text(text)` directly.
No asyncio.to_thread wrapper is needed.

Required env vars: CF_ACCOUNT_ID, CF_API_TOKEN
"""

import os
import httpx

_MAX_CHARS = 1000
_CF_MODEL = "@cf/baai/bge-small-en-v1.5"


async def embed_text(text: str) -> list[float]:
    """
    Embeds text using Cloudflare AI (@cf/baai/bge-small-en-v1.5).
    Returns a Python list of 384 L2-normalized floats.
    Input is truncated to 1000 characters before sending.
    """
    if len(text) > _MAX_CHARS:
        text = text[:_MAX_CHARS]

    account_id = os.environ["CF_ACCOUNT_ID"]
    api_token = os.environ["CF_API_TOKEN"]
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{_CF_MODEL}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            url,
            headers={"Authorization": f"Bearer {api_token}"},
            json={"text": [text]},
        )
        response.raise_for_status()

    body = response.json()
    if not body.get("success"):
        errors = body.get("errors", [])
        raise RuntimeError(f"Cloudflare AI embedding failed: {errors}")

    return body["result"]["data"][0]

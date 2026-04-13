import os
from groq import AsyncGroq
from dotenv import load_dotenv

load_dotenv()

# ── Model names ───────────────────────────────────────────────────────────────

_GROQ_MODELS = {
    "large": "llama-3.3-70b-versatile",
    "small": "llama-3.1-8b-instant",
}

_RCAC_MODELS = {
    "large": "meta-llama/Llama-3.3-70b-Instruct",
    "small": "meta-llama/Llama-3.1-8b-Instruct",
}

# Kept for backward-compat with existing agents
MODELS = _GROQ_MODELS


def get_model_name(size: str = "large") -> str:
    """Returns the correct model name based on configured provider."""
    if os.getenv("RCAC_API_KEY"):
        env_key = f"RCAC_MODEL_{'LARGE' if size == 'large' else 'SMALL'}"
        return os.getenv(env_key, _RCAC_MODELS.get(size, _RCAC_MODELS["large"]))
    return _GROQ_MODELS.get(size, _GROQ_MODELS["large"])


def get_llm_client():
    """
    Returns an AsyncOpenAI-compatible client.
    Prefers RCAC GenAI Studio if RCAC_API_KEY is set; falls back to Groq.
    """
    from openai import AsyncOpenAI

    rcac_key = os.getenv("RCAC_API_KEY", "")
    rcac_url = os.getenv("RCAC_BASE_URL", "")

    if rcac_key and rcac_url:
        return AsyncOpenAI(base_url=rcac_url, api_key=rcac_key)

    # Groq is OpenAI-compatible
    groq_key = os.getenv("GROQ_API_KEY", "")
    return AsyncOpenAI(
        base_url="https://api.groq.com/openai/v1",
        api_key=groq_key,
    )


# ── Legacy Groq client (used by existing discovery/curriculum agents) ─────────

_groq_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY", ""))


async def complete(
    messages: list[dict],
    model_size: str = "large",
    temperature: float = 0.7,
    max_tokens: int = 4000,
    json_mode: bool = False,
) -> str:
    kwargs = {
        "model": MODELS[model_size],
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    response = await _groq_client.chat.completions.create(**kwargs)
    return response.choices[0].message.content.strip()
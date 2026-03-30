import os
from groq import AsyncGroq
from dotenv import load_dotenv

load_dotenv()

_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))

MODELS = {
    "large": "llama-3.3-70b-versatile",  # reasoning, teaching, graph building
    "small": "llama-3.1-8b-instant",      # classification, validation, scoring
}


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

    response = await _client.chat.completions.create(**kwargs)
    return response.choices[0].message.content.strip()
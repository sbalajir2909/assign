"""
Two-tier router:
1. Regex fast-path for obvious patterns (saves LLM call)
2. Small LLM classification for ambiguous input

Returns intent string used by the B2C API to decide which agent to invoke.
"""

import re
import os

FAST_PATH_RULES = [
    (r"^(next|continue|move on|skip|ok|okay|got it|i understand|sure|sounds good)$",
     "navigate_next"),
    (r"^(back|previous|go back)$",
     "navigate_back"),
    (r"^(help|what does|explain|i don.?t understand|confused|huh|what is|can you clarify)",
     "clarification_request"),
    (r"^(note|save|generate note)",
     "manual_note_request"),
]


async def route_intent(
    message: str,
    current_phase: str,
    client=None,
) -> str:
    """
    Returns intent: 'explanation' | 'clarification_request' |
                    'navigate_next' | 'navigate_back' | 'manual_note_request' | 'other'
    """
    msg_lower = message.strip().lower()

    # Fast path
    for pattern, intent in FAST_PATH_RULES:
        if re.match(pattern, msg_lower, re.IGNORECASE):
            return intent

    # If we're in awaiting_explanation phase and message is > 20 chars, treat as explanation
    if current_phase == "awaiting_explanation" and len(message.strip()) > 20:
        return "explanation"

    # LLM classification for ambiguous cases
    if client:
        try:
            from utils.model_router import get_model_name
            response = await client.chat.completions.create(
                model=get_model_name("small"),
                temperature=0.0,
                max_tokens=10,
                messages=[{
                    "role": "user",
                    "content": (
                        f"Classify this student message as one of: "
                        f"explanation, clarification_request, navigate_next, other\n\n"
                        f"Message: \"{message}\"\n"
                        f"Current phase: {current_phase}\n\n"
                        f"Return only the intent word."
                    )
                }]
            )
            return response.choices[0].message.content.strip().lower()
        except Exception:
            pass

    return "other"

import asyncio
from voice.tts.fish_tts import FishTTS


class VoiceService:
    def __init__(self):
        self.tts = FishTTS()

    async def text_to_speech(self, text: str) -> bytes:
        if not text or not text.strip():
            raise ValueError("Empty input")

        # run blocking HTTP call in a thread
        return await asyncio.to_thread(self.tts.synthesize, text)
from voice.service import VoiceService


class TTSNode:
    """
    Minimal Pipecat-compatible TTS node
    """

    def __init__(self):
        self.voice_service = VoiceService()

    async def process(self, text: str) -> bytes:
        """
        Input: text
        Output: audio bytes (can later convert to frames)
        """
        return await self.voice_service.text_to_speech(text)
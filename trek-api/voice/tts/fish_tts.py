import requests
from voice.config import FISH_AUDIO_API, TIMEOUT, DEFAULT_VOICE


class FishTTS:
    def __init__(self, api_url: str = FISH_AUDIO_API):
        self.api_url = api_url

    def synthesize(self, text: str, voice: str = DEFAULT_VOICE) -> bytes:
        payload = {
            "text": text,
            "voice": voice
        }

        try:
            response = requests.post(
                self.api_url,
                json=payload,
                timeout=TIMEOUT
            )
        except requests.exceptions.RequestException as e:
            raise Exception(f"TTS request failed: {str(e)}")

        if not response.ok:
            raise Exception(f"TTS failed: {response.text}")

        return response.content  # raw audio bytes
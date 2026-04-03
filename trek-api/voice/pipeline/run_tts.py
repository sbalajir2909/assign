import asyncio
from voice.pipeline.tts_node import TTSNode
from voice.audio import save_audio, play_audio


async def main():
    tts_node = TTSNode()

    text = "Hello Pragna, this is Pipecat using your Fish TTS."

    audio = await tts_node.process(text)

    save_audio(audio, "output.wav")
    play_audio("output.wav")


if __name__ == "__main__":
    asyncio.run(main())
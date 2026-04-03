import os


def save_audio(audio_bytes: bytes, filename: str = "output.wav"):
    with open(filename, "wb") as f:
        f.write(audio_bytes)


def play_audio(filename: str = "output.wav"):
    os.system(f"afplay {filename}")  # MacOS
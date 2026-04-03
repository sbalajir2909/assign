import { NextRequest, NextResponse } from 'next/server'
 
export async function POST(req: NextRequest) {
  try {
    // --- STEP 1: Read the text from the browser's request ---
    const { text } = await req.json()
 
    // If no text was sent, return an error
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'No text provided' },
        { status: 400 }  // 400 = "Bad Request" (the client sent something wrong)
      )
    }
 
    // --- STEP 2: Check that we have a FishAudio API key ---
    const apiKey = process.env.FISH_AUDIO_API_KEY
    if (!apiKey) {
      console.error('[TTS] FISH_AUDIO_API_KEY is not set in environment variables')
      return NextResponse.json(
        { error: 'TTS service not configured' },
        { status: 500 }  // 500 = "Server Error" (our fault, not the user's)
      )
    }
 
    // --- STEP 3: Call FishAudio's API ---
    //
    // FishAudio uses MessagePack (msgpack) format for requests, which is a
    // compact binary format (like JSON but smaller/faster). However, they
    // also accept regular JSON, which is simpler for us. We'll use JSON.
    //
    // The key parameters:
    //   - text: the words to speak
    //   - reference_id: which voice to use (we use a default English voice)
    //   - format: what audio format to return (mp3 is widely supported)
    //   - latency: "balanced" is a good middle ground between speed and quality
    //
    const response = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'model': 's2',  // s2 is Fish Audio's latest model
      },
      body: JSON.stringify({
        text: text,
        format: 'mp3',
        latency: 'balanced',
        // NOTE: We're not specifying a reference_id here, which means
        // FishAudio will use its default voice. You can change this later
        // by picking a voice from fish.audio and using its ID.
      }),
    })
 
    // --- STEP 4: Handle errors from FishAudio ---
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[TTS] FishAudio API error: ${response.status} — ${errorText}`)
      return NextResponse.json(
        { error: 'TTS generation failed' },
        { status: 502 }  // 502 = "Bad Gateway" (the upstream service failed)
      )
    }
 
    // --- STEP 5: Stream the audio bytes back to the browser ---
    //
    // FishAudio returns raw audio bytes. We pass them straight through
    // to the browser with the correct Content-Type header so the browser
    // knows it's receiving an MP3 file.
    //
    const audioBuffer = await response.arrayBuffer()
 
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',           // tells browser "this is MP3 audio"
        'Cache-Control': 'no-cache, no-store',   // don't cache (each response is unique)
      },
    })
  } catch (error) {
    console.error('[TTS] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
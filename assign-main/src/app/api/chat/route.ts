import Groq from 'groq-sdk'
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const getGroq = () => new Groq({ apiKey: process.env.GROQ_API_KEY })

function loadPrompt(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), '..', 'prompts', `${name}.txt`), 'utf-8')
}

const SPARK_PROMPT  = loadPrompt('spark')
const TREK_PROMPT   = loadPrompt('trek')
const RECALL_PROMPT = loadPrompt('recall')
const BUILD_PROMPT  = loadPrompt('build')

export async function POST(req: NextRequest) {
  const { messages, mode } = await req.json()

  const systemPrompt = mode === 'trek' ? TREK_PROMPT
    : mode === 'recall' ? RECALL_PROMPT
    : mode === 'build' ? BUILD_PROMPT
    : SPARK_PROMPT

  const completion = await getGroq().chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ],
    max_tokens: 400,
    temperature: 0.7
  })

  const reply = completion.choices[0].message.content

  return NextResponse.json({ reply })
}
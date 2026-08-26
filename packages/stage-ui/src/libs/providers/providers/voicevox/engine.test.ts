import type {
  VoicevoxEngineRequest,
  VoicevoxEngineResult,
  VoicevoxEngineTransport,
} from '@proj-airi/stage-shared/voicevox-engine'

import type { VoicevoxAudioQuery, VoicevoxSpeaker } from './engine'

import { describe, expect, it, vi } from 'vitest'

import { applyVoicevoxParameters, describeVoicevoxRefusal, fetchEngineVersion, fetchSpeakers, synthesizeSpeech } from './engine'
import { createBrowserVoicevoxEngineTransport } from './transport'

function jsonResult(value: unknown): VoicevoxEngineResult {
  return {
    body: new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer,
    contentType: 'application/json',
    status: 200,
    statusText: 'OK',
  }
}

function wavResult(bytes: number[]): VoicevoxEngineResult {
  return {
    body: new Uint8Array(bytes).buffer,
    contentType: 'audio/wav',
    status: 200,
    statusText: 'OK',
  }
}

const AUDIO_QUERY: VoicevoxAudioQuery = {
  accent_phrases: [{ moras: [] }],
  intonationScale: 1,
  outputSamplingRate: 24000,
  pitchScale: 0,
  speedScale: 1,
  volumeScale: 1,
}

function createRecordingTransport(overrides: Partial<Record<VoicevoxEngineRequest['endpoint'], VoicevoxEngineResult>> = {}) {
  const requests: VoicevoxEngineRequest[] = []
  const bodies: unknown[] = []

  const transport: VoicevoxEngineTransport = async (request) => {
    requests.push(request)
    bodies.push(request.body)

    if (overrides[request.endpoint])
      return overrides[request.endpoint]!

    switch (request.endpoint) {
      case 'audio_query':
        return jsonResult(AUDIO_QUERY)
      case 'speakers':
        return jsonResult([])
      case 'synthesis':
        return wavResult([82, 73, 70, 70])
      case 'version':
        return { body: new TextEncoder().encode('"0.24.1"').buffer as ArrayBuffer, contentType: 'application/json', status: 200, statusText: 'OK' }
    }
  }

  return { bodies, requests, transport }
}

describe('synthesizeSpeech', () => {
  it('calls audio_query and then synthesis, carrying the style id on both', async () => {
    const recorder = createRecordingTransport()

    await synthesizeSpeech('http://localhost:50021/', { styleId: '888753760', text: 'こんにちは' }, recorder.transport)

    expect(recorder.requests.map(request => request.endpoint)).toEqual(['audio_query', 'synthesis'])
    expect(recorder.requests[0].query).toEqual({ speaker: '888753760', text: 'こんにちは' })
    expect(recorder.requests[1].query).toEqual({ speaker: '888753760' })
  })

  it('sends the audio query back as the synthesis body', async () => {
    const recorder = createRecordingTransport()

    await synthesizeSpeech('http://localhost:50021/', { styleId: '3', text: 'あ' }, recorder.transport)

    expect(recorder.requests[0].body).toBeUndefined()
    expect(recorder.requests[1].body).toMatchObject({ accent_phrases: [{ moras: [] }], outputSamplingRate: 24000 })
  })

  it('writes the four controls onto the audio query and leaves the rest alone', async () => {
    const recorder = createRecordingTransport()

    await synthesizeSpeech('http://localhost:50021/', {
      parameters: { intonation: 1.4, pitch: 0.05, speed: 1.25, volume: 0.8 },
      styleId: '3',
      text: 'あ',
    }, recorder.transport)

    const body = recorder.requests[1].body as VoicevoxAudioQuery
    expect(body.speedScale).toBe(1.25)
    expect(body.pitchScale).toBe(0.05)
    expect(body.intonationScale).toBe(1.4)
    expect(body.volumeScale).toBe(0.8)
    expect(body.outputSamplingRate).toBe(24000)
  })

  it('returns the synthesis bytes unchanged', async () => {
    const recorder = createRecordingTransport({ synthesis: wavResult([82, 73, 70, 70, 1, 2, 3]) })

    const audio = await synthesizeSpeech('http://localhost:50021/', { styleId: '3', text: 'あ' }, recorder.transport)

    expect(Array.from(new Uint8Array(audio))).toEqual([82, 73, 70, 70, 1, 2, 3])
  })

  it('forwards the abort signal so a cancelled turn stops mid synthesis', async () => {
    const controller = new AbortController()
    const signals: (AbortSignal | undefined)[] = []
    const transport: VoicevoxEngineTransport = async (request, signal) => {
      signals.push(signal)
      return request.endpoint === 'audio_query' ? jsonResult(AUDIO_QUERY) : wavResult([0])
    }

    await synthesizeSpeech('http://localhost:50021/', { styleId: '3', text: 'あ' }, transport, controller.signal)

    expect(signals).toEqual([controller.signal, controller.signal])
  })

  it('explains a refusal instead of reporting a connection failure', async () => {
    const transport: VoicevoxEngineTransport = async () => ({ refusedBecause: 'host-not-allowed' })

    await expect(synthesizeSpeech('https://tts.example.com/', { styleId: '3', text: 'あ' }, transport))
      .rejects
      .toThrow(/only reaches a speech engine on this machine or on your local network/)
  })

  it('names the endpoint and the status when the engine rejects the request', async () => {
    const transport: VoicevoxEngineTransport = async () => ({
      body: new TextEncoder().encode('{"detail":"speaker not found"}').buffer as ArrayBuffer,
      contentType: 'application/json',
      status: 422,
      statusText: 'Unprocessable Entity',
    })

    await expect(synthesizeSpeech('http://localhost:50021/', { styleId: '999', text: 'あ' }, transport))
      .rejects
      .toThrow(/422 Unprocessable Entity for \/audio_query.*speaker not found/s)
  })
})

describe('applyVoicevoxParameters', () => {
  it('keeps the engine value for a control the user never touched', () => {
    const audioQuery: VoicevoxAudioQuery = { intonationScale: 1, pitchScale: 0, speedScale: 1, volumeScale: 1 }

    applyVoicevoxParameters(audioQuery, { speed: 1.5 })

    expect(audioQuery.speedScale).toBe(1.5)
    expect(audioQuery.volumeScale).toBe(1)
  })

  it('writes a zero rather than treating it as absent', () => {
    const audioQuery: VoicevoxAudioQuery = { intonationScale: 1, pitchScale: 0.1, speedScale: 1, volumeScale: 1 }

    applyVoicevoxParameters(audioQuery, { pitch: 0 })

    expect(audioQuery.pitchScale).toBe(0)
  })
})

describe('fetchSpeakers', () => {
  it('returns the characters with their styles in engine order', async () => {
    const speakers: VoicevoxSpeaker[] = [
      { name: '四国めたん', speaker_uuid: 'a', styles: [{ id: 2, name: 'ノーマル' }, { id: 0, name: 'あまあま' }] },
      { name: 'ずんだもん', speaker_uuid: 'b', styles: [{ id: 3, name: 'ノーマル' }] },
    ]
    const recorder = createRecordingTransport({ speakers: jsonResult(speakers) })

    const result = await fetchSpeakers('http://localhost:50021/', recorder.transport)

    expect(result.map(speaker => speaker.name)).toEqual(['四国めたん', 'ずんだもん'])
    expect(result[0].styles.map(style => style.id)).toEqual([2, 0])
  })

  it('reports a body that is not JSON as a wrong Base URL rather than as a parse error', async () => {
    const recorder = createRecordingTransport({
      speakers: { body: new TextEncoder().encode('<!doctype html>').buffer as ArrayBuffer, contentType: 'text/html', status: 200, statusText: 'OK' },
    })

    await expect(fetchSpeakers('http://localhost:3000/', recorder.transport))
      .rejects
      .toThrow(/points at a VOICEVOX-compatible engine/)
  })
})

describe('fetchEngineVersion', () => {
  it('strips the quotes of the bare JSON string the engine returns', async () => {
    const recorder = createRecordingTransport()

    expect(await fetchEngineVersion('http://localhost:50021/', recorder.transport)).toBe('0.24.1')
  })
})

describe('describeVoicevoxRefusal', () => {
  it('points a public address at the web surface instead of at the network', () => {
    expect(describeVoicevoxRefusal('host-not-allowed')).toContain('web version')
  })
})

describe('createBrowserVoicevoxEngineTransport', () => {
  it('posts audio_query and synthesis, and gets the rest', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { headers: { 'Content-Type': 'application/json' }, status: 200 }))
    const transport = createBrowserVoicevoxEngineTransport(fetchImpl as unknown as typeof globalThis.fetch)

    await transport({ baseUrl: 'http://localhost:50021/', endpoint: 'speakers' })
    await transport({ baseUrl: 'http://localhost:50021/', endpoint: 'audio_query', query: { speaker: '3', text: 'あ' } })

    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'GET' })
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: 'POST' })
    // Assert the parsed parameters, not the raw query string. Their order
    // follows the insertion order of the caller's object literal, which the
    // formatter reorders.
    const audioQueryUrl = new URL(String(fetchImpl.mock.calls[1][0]))
    expect(audioQueryUrl.pathname).toBe('/audio_query')
    expect(audioQueryUrl.searchParams.get('text')).toBe('あ')
    expect(audioQueryUrl.searchParams.get('speaker')).toBe('3')
  })

  it('sends the audio query as a JSON body on synthesis', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(new Uint8Array([1]), { status: 200 }))
    const transport = createBrowserVoicevoxEngineTransport(fetchImpl as unknown as typeof globalThis.fetch)

    await transport({ baseUrl: 'http://localhost:50021/', body: { speedScale: 1 }, endpoint: 'synthesis', query: { speaker: '3' } })

    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      body: '{"speedScale":1}',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
  })

  it('refuses a base URL it cannot resolve instead of throwing a parser error', async () => {
    const transport = createBrowserVoicevoxEngineTransport(vi.fn() as unknown as typeof globalThis.fetch)

    expect(await transport({ baseUrl: '', endpoint: 'version' })).toEqual({ refusedBecause: 'invalid-base-url' })
  })
})

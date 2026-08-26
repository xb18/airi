import type {
  VoicevoxEngineRefusalCode,
  VoicevoxEngineRequest,
  VoicevoxEngineResponse,
  VoicevoxEngineTransport,
} from '@proj-airi/stage-shared/voicevox-engine'

import { isVoicevoxEngineRefusal } from '@proj-airi/stage-shared/voicevox-engine'

/**
 * The synthesis plan that `/audio_query` returns and `/synthesis` consumes.
 *
 * Only the four fields this provider writes are named. Every other field, such
 * as the accent phrases and the output format, goes back to `/synthesis`
 * unchanged, so the engine keeps its own defaults.
 */
export interface VoicevoxAudioQuery {
  [field: string]: unknown
  intonationScale: number
  pitchScale: number
  speedScale: number
  volumeScale: number
}

/** One character returned by `GET /speakers`. */
export interface VoicevoxSpeaker {
  name: string
  speaker_uuid?: string
  styles: VoicevoxSpeakerStyle[]
}

/** One voice of one character. The `speaker` query parameter takes this `id`, not a character id. */
export interface VoicevoxSpeakerStyle {
  id: number
  name: string
  type?: string
}

/**
 * The four controls the settings page exposes.
 *
 * `intonation` reaches `intonationScale`. VOICEVOX reads that field as the
 * intonation, and AivisSpeech reads it as the strength of the emotion
 * expression. The wire field is the same, so only the label differs per engine.
 */
export interface VoicevoxSynthesisParameters {
  intonation?: number
  pitch?: number
  speed?: number
  volume?: number
}

/**
 * Writes the four controls onto the plan, in place.
 *
 * An absent control keeps the value the engine returned. A control set to zero
 * is written, so the check is the type and not the truthiness.
 */
export function applyVoicevoxParameters(
  audioQuery: VoicevoxAudioQuery,
  parameters: VoicevoxSynthesisParameters,
): VoicevoxAudioQuery {
  if (typeof parameters.speed === 'number')
    audioQuery.speedScale = parameters.speed
  if (typeof parameters.pitch === 'number')
    audioQuery.pitchScale = parameters.pitch
  if (typeof parameters.intonation === 'number')
    audioQuery.intonationScale = parameters.intonation
  if (typeof parameters.volume === 'number')
    audioQuery.volumeScale = parameters.volume

  return audioQuery
}

/**
 * Explains a refusal in the words the user needs to act on.
 *
 * A refusal never reaches the network. Connection advice describes the wrong
 * problem.
 */
export function describeVoicevoxRefusal(code: VoicevoxEngineRefusalCode): string {
  switch (code) {
    case 'credentials-in-url':
      return 'Remove the username and password from the Base URL. The engine API takes no credentials.'
    case 'host-not-allowed':
      return 'The desktop application only reaches a speech engine on this machine or on your local network. Use a localhost address, or the LAN address of the machine that runs the engine. A public address works on the web version instead.'
    case 'invalid-base-url':
      return 'The Base URL is not an absolute http:// or https:// address.'
    case 'unsupported-endpoint':
      // This module names only the four endpoints, so nothing reaches this
      // branch today. It keeps a later contract change from showing a blank reason.
      return 'The request was not part of the speech engine API.'
  }
}

export async function fetchEngineVersion(
  baseUrl: string,
  transport: VoicevoxEngineTransport,
  signal?: AbortSignal,
): Promise<string> {
  const response = await request(transport, { baseUrl, endpoint: 'version' }, signal)
  // `/version` answers with a bare JSON string, so the quotes are part of the body.
  return decodeText(response.body).replace(/^"|"$/g, '')
}

export async function fetchSpeakers(
  baseUrl: string,
  transport: VoicevoxEngineTransport,
  signal?: AbortSignal,
): Promise<VoicevoxSpeaker[]> {
  const response = await request(transport, { baseUrl, endpoint: 'speakers' }, signal)
  const speakers = decodeJson<VoicevoxSpeaker[]>(response, 'speakers')
  return Array.isArray(speakers) ? speakers : []
}

/**
 * Turns text into audio with two requests: `/audio_query`, then `/synthesis`.
 *
 * `/audio_query` takes the text as a query parameter, not as a body. The speech
 * pipeline passes one segment per call, so the URL stays short.
 *
 * @returns WAV bytes, at the sampling rate the engine is configured for.
 */
export async function synthesizeSpeech(
  baseUrl: string,
  options: { parameters?: VoicevoxSynthesisParameters, styleId: string, text: string },
  transport: VoicevoxEngineTransport,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const query = { speaker: options.styleId, text: options.text }
  const audioQueryResponse = await request(transport, { baseUrl, endpoint: 'audio_query', query }, signal)
  const audioQuery = applyVoicevoxParameters(
    decodeJson<VoicevoxAudioQuery>(audioQueryResponse, 'audio_query'),
    options.parameters ?? {},
  )

  const synthesisResponse = await request(
    transport,
    { baseUrl, body: audioQuery, endpoint: 'synthesis', query: { speaker: options.styleId } },
    signal,
  )

  return synthesisResponse.body
}

function decodeJson<T>(response: VoicevoxEngineResponse, endpoint: string): T {
  try {
    return JSON.parse(decodeText(response.body)) as T
  }
  catch {
    throw new Error(`Speech engine answered /${endpoint} with a body that is not JSON. Check that the Base URL points at a VOICEVOX-compatible engine.`)
  }
}

function decodeText(body: ArrayBuffer): string {
  return new TextDecoder().decode(body)
}

async function request(
  transport: VoicevoxEngineTransport,
  engineRequest: VoicevoxEngineRequest,
  signal?: AbortSignal,
): Promise<VoicevoxEngineResponse> {
  const result = await transport(engineRequest, signal)
  if (isVoicevoxEngineRefusal(result))
    throw new Error(describeVoicevoxRefusal(result.refusedBecause))

  if (result.status < 200 || result.status >= 300) {
    const detail = decodeText(result.body).trim()
    const suffix = detail ? `: ${detail.slice(0, 200)}` : ''
    throw new Error(`Speech engine answered ${result.status} ${result.statusText} for /${engineRequest.endpoint}${suffix}`)
  }

  return result
}

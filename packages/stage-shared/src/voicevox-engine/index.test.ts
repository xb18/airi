import { describe, expect, it } from 'vitest'

import {
  buildVoicevoxEngineUrl,
  createVoicevoxEngineRequestInit,
  isVoicevoxEngineEndpoint,
  normalizeVoicevoxBaseUrl,
  resolveVoicevoxEngineHostPolicy,
} from '.'

describe('buildVoicevoxEngineUrl', () => {
  it('keeps a base URL path segment when the user omits the trailing slash', () => {
    const url = buildVoicevoxEngineUrl({ baseUrl: 'http://192.168.1.4/engine', endpoint: 'speakers' })

    expect(url.toString()).toBe('http://192.168.1.4/engine/speakers')
  })

  it('resolves against the origin when the base URL has no path', () => {
    const url = buildVoicevoxEngineUrl({ baseUrl: 'http://localhost:50021', endpoint: 'version' })

    expect(url.toString()).toBe('http://localhost:50021/version')
  })

  it('carries the style id and the text as query parameters', () => {
    const url = buildVoicevoxEngineUrl({
      baseUrl: 'http://localhost:50021/',
      endpoint: 'audio_query',
      query: { speaker: '888753760', text: 'こんにちは' },
    })

    expect(url.pathname).toBe('/audio_query')
    expect(url.searchParams.get('speaker')).toBe('888753760')
    expect(url.searchParams.get('text')).toBe('こんにちは')
  })
})

describe('normalizeVoicevoxBaseUrl', () => {
  it('trims surrounding whitespace before appending the slash', () => {
    expect(normalizeVoicevoxBaseUrl('  http://localhost:10101  ')).toBe('http://localhost:10101/')
  })
})

describe('isVoicevoxEngineEndpoint', () => {
  it('rejects a path that the passthrough must not forward', () => {
    expect(isVoicevoxEngineEndpoint('synthesis_morphing')).toBe(false)
    expect(isVoicevoxEngineEndpoint('../../etc/passwd')).toBe(false)
  })

  it('accepts the four endpoints of the family contract', () => {
    expect(isVoicevoxEngineEndpoint('version')).toBe(true)
    expect(isVoicevoxEngineEndpoint('speakers')).toBe(true)
    expect(isVoicevoxEngineEndpoint('audio_query')).toBe(true)
    expect(isVoicevoxEngineEndpoint('synthesis')).toBe(true)
  })
})

describe('resolveVoicevoxEngineHostPolicy', () => {
  it('allows the default address of every engine in the family', () => {
    expect(resolveVoicevoxEngineHostPolicy('http://localhost:50021/').allowed).toBe(true)
    expect(resolveVoicevoxEngineHostPolicy('http://localhost:10101/').allowed).toBe(true)
    expect(resolveVoicevoxEngineHostPolicy('http://127.0.0.1:50032/').allowed).toBe(true)
    expect(resolveVoicevoxEngineHostPolicy('http://[::1]:50021/').allowed).toBe(true)
  })

  it('allows an engine on the local network', () => {
    expect(resolveVoicevoxEngineHostPolicy('http://192.168.1.4:50021/').allowed).toBe(true)
    expect(resolveVoicevoxEngineHostPolicy('http://10.1.2.3:50021/').allowed).toBe(true)
    expect(resolveVoicevoxEngineHostPolicy('http://172.16.0.9:50021/').allowed).toBe(true)
    expect(resolveVoicevoxEngineHostPolicy('http://tanuki.local:50021/').allowed).toBe(true)
  })

  it('refuses a public host, so the passthrough is not a general outbound request primitive', () => {
    expect(resolveVoicevoxEngineHostPolicy('https://tts.example.com/')).toEqual({
      allowed: false,
      refusedBecause: 'host-not-allowed',
    })
  })

  it('refuses a public address that only looks private', () => {
    // 172.32/12 sits outside the private block, which ends at 172.31.255.255.
    expect(resolveVoicevoxEngineHostPolicy('http://172.32.0.1:50021/')).toEqual({
      allowed: false,
      refusedBecause: 'host-not-allowed',
    })
  })

  it('refuses an IPv6 address whose text looks like a local prefix but is not one', () => {
    // A text prefix check on the serialized form accepts these. `fc::1` expands
    // to 00fc::1 and `fe8::1` to 0fe8::1. Both sit in reserved ::/8, not in
    // fc00::/7 or fe80::/10.
    expect(resolveVoicevoxEngineHostPolicy('http://[fc::1]:50021/').allowed).toBe(false)
    expect(resolveVoicevoxEngineHostPolicy('http://[fe8::1]:50021/').allowed).toBe(false)
  })

  it('allows the unique local and link-local ranges it documents', () => {
    expect(resolveVoicevoxEngineHostPolicy('http://[fd00::1]:50021/').allowed).toBe(true)
    expect(resolveVoicevoxEngineHostPolicy('http://[fe80::1]:50021/').allowed).toBe(true)
  })

  it('refuses link-local IPv4, which holds the cloud metadata address', () => {
    expect(resolveVoicevoxEngineHostPolicy('http://169.254.169.254/')).toEqual({
      allowed: false,
      refusedBecause: 'host-not-allowed',
    })
  })

  it('refuses credentials embedded in the URL', () => {
    expect(resolveVoicevoxEngineHostPolicy('http://user:secret@localhost:50021/')).toEqual({
      allowed: false,
      refusedBecause: 'credentials-in-url',
    })
  })

  it('refuses a relative URL and a non-HTTP scheme', () => {
    expect(resolveVoicevoxEngineHostPolicy('localhost:50021')).toEqual({
      allowed: false,
      refusedBecause: 'invalid-base-url',
    })
    expect(resolveVoicevoxEngineHostPolicy('file:///etc/passwd')).toEqual({
      allowed: false,
      refusedBecause: 'invalid-base-url',
    })
  })
})

describe('createVoicevoxEngineRequestInit', () => {
  it('refuses redirects on every endpoint, so both transports keep that rule', () => {
    // A followed redirect reaches a host no caller checked, on a path outside
    // VOICEVOX_ENGINE_PATHS. Both transports build their options here, so this
    // is the one place the rule has to hold.
    for (const endpoint of ['version', 'speakers', 'audio_query', 'synthesis'] as const)
      expect(createVoicevoxEngineRequestInit({ baseUrl: 'http://localhost:50021/', endpoint }).redirect).toBe('error')
  })

  it('posts the two endpoints that need it and gets the rest', () => {
    expect(createVoicevoxEngineRequestInit({ baseUrl: 'http://localhost:50021/', endpoint: 'audio_query' }).method).toBe('POST')
    expect(createVoicevoxEngineRequestInit({ baseUrl: 'http://localhost:50021/', endpoint: 'synthesis' }).method).toBe('POST')
    expect(createVoicevoxEngineRequestInit({ baseUrl: 'http://localhost:50021/', endpoint: 'version' }).method).toBe('GET')
    expect(createVoicevoxEngineRequestInit({ baseUrl: 'http://localhost:50021/', endpoint: 'speakers' }).method).toBe('GET')
  })

  it('sends no body for audio_query, whose text is sent in the query string', () => {
    const init = createVoicevoxEngineRequestInit({ baseUrl: 'http://localhost:50021/', endpoint: 'audio_query' })

    expect(init.body).toBeUndefined()
    expect(init.headers).toBeUndefined()
  })

  it('serializes the audio query as a JSON body for synthesis', () => {
    const init = createVoicevoxEngineRequestInit({ baseUrl: 'http://localhost:50021/', body: { speedScale: 1.25 }, endpoint: 'synthesis' })

    expect(init.body).toBe('{"speedScale":1.25}')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
  })
})

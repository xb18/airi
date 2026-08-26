import { afterEach, describe, expect, it, vi } from 'vitest'

import { performVoicevoxEngineRequest } from '.'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch() {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('performVoicevoxEngineRequest', () => {
  it('refuses an endpoint outside the family contract before opening a socket', async () => {
    const fetchMock = stubFetch()

    const result = await performVoicevoxEngineRequest({
      baseUrl: 'http://localhost:50021/',
      // The renderer composes no path today. A later contract change widens the
      // union, and the handler stays the place that refuses.
      endpoint: 'synthesis_morphing' as never,
    })

    expect(result).toEqual({ refusedBecause: 'unsupported-endpoint' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a public host, so the passthrough cannot reach arbitrary servers', async () => {
    const fetchMock = stubFetch()

    const result = await performVoicevoxEngineRequest({
      baseUrl: 'https://tts.example.com/',
      endpoint: 'speakers',
    })

    expect(result).toEqual({ refusedBecause: 'host-not-allowed' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses credentials in the base URL', async () => {
    const fetchMock = stubFetch()

    const result = await performVoicevoxEngineRequest({
      baseUrl: 'http://user:secret@127.0.0.1:50021/',
      endpoint: 'version',
    })

    expect(result).toEqual({ refusedBecause: 'credentials-in-url' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a missing payload rather than throwing at the IPC boundary', async () => {
    const result = await performVoicevoxEngineRequest(undefined)

    expect(result).toEqual({ refusedBecause: 'unsupported-endpoint' })
  })

  it('gets an engine on this machine and returns the response verbatim', async () => {
    const fetchMock = stubFetch()

    const result = await performVoicevoxEngineRequest({
      baseUrl: 'http://localhost:50021/',
      endpoint: 'speakers',
    })

    expect(String(fetchMock.mock.calls[0][0])).toBe('http://localhost:50021/speakers')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET' })
    expect(result).toMatchObject({ contentType: 'application/json', status: 200 })
  })

  // https://github.com/moeru-ai/airi/issues/2166
  it('refuses to follow a redirect, so both guards keep applying — Issue #2166', async () => {
    // `fetch` follows redirects by default. The host policy and the endpoint
    // table each run once, against the address the renderer supplied. A server
    // on an allowed host answers `302 Location: http://elsewhere/any`, and this
    // process then sends that request and returns its body to the renderer.
    // The redirect target escapes both checks. Any device on the same network
    // publishes a `.local` name, which is enough to reach an allowed host.
    const fetchMock = stubFetch()

    await performVoicevoxEngineRequest({ baseUrl: 'http://localhost:50021/', endpoint: 'version' })

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error' })
  })

  it('bounds a request that never answers, even when the caller sends no signal', async () => {
    const fetchMock = stubFetch()

    await performVoicevoxEngineRequest({ baseUrl: 'http://localhost:50021/', endpoint: 'version' })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(init.signal?.aborted).toBe(false)
  })

  it('aborts the engine request when the caller aborts', async () => {
    const controller = new AbortController()
    const fetchMock = stubFetch()

    await performVoicevoxEngineRequest(
      { baseUrl: 'http://localhost:50021/', endpoint: 'version' },
      controller.signal,
    )
    const init = fetchMock.mock.calls[0][1] as RequestInit
    controller.abort()

    expect(init.signal?.aborted).toBe(true)
  })

  it('posts synthesis with the audio query as its body', async () => {
    const fetchMock = stubFetch()

    await performVoicevoxEngineRequest({
      baseUrl: 'http://192.168.1.4:50021/',
      body: { speedScale: 1.25 },
      endpoint: 'synthesis',
      query: { speaker: '3' },
    })

    expect(String(fetchMock.mock.calls[0][0])).toBe('http://192.168.1.4:50021/synthesis?speaker=3')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      body: '{"speedScale":1.25}',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
  })

  it('posts audio_query with its text in the query string and no body', async () => {
    const fetchMock = stubFetch()

    await performVoicevoxEngineRequest({
      baseUrl: 'http://localhost:10101/',
      endpoint: 'audio_query',
      query: { speaker: '888753760', text: 'あ' },
    })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(String(fetchMock.mock.calls[0][0])).toContain('speaker=888753760')
  })
})

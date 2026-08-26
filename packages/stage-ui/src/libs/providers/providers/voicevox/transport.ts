import type {
  VoicevoxEngineResult,
  VoicevoxEngineTransport,
} from '@proj-airi/stage-shared/voicevox-engine'

import { buildVoicevoxEngineUrl, createVoicevoxEngineRequestInit, toVoicevoxEngineResponse } from '@proj-airi/stage-shared/voicevox-engine'

/**
 * The transport for web and mobile. It applies no host policy, because the
 * origin rules of the page already restrict where the request lands.
 *
 * @param fetchImpl Injected in tests. Defaults to the ambient `fetch`.
 */
export function createBrowserVoicevoxEngineTransport(fetchImpl?: typeof globalThis.fetch): VoicevoxEngineTransport {
  return async (request, signal): Promise<VoicevoxEngineResult> => {
    let url: URL
    try {
      url = buildVoicevoxEngineUrl(request)
    }
    catch {
      return { refusedBecause: 'invalid-base-url' }
    }

    const doFetch = fetchImpl ?? globalThis.fetch
    return toVoicevoxEngineResponse(await doFetch(url, createVoicevoxEngineRequestInit(request, signal)))
  }
}

// The desktop renderer replaces this at startup, so engine traffic goes through
// the Electron main process. A packaged renderer loads over `file://` and sends
// `Origin: null`, which every engine in the family refuses.
let registeredTransport: undefined | VoicevoxEngineTransport
let browserTransport: undefined | VoicevoxEngineTransport

export function getVoicevoxEngineTransport(): VoicevoxEngineTransport {
  if (registeredTransport)
    return registeredTransport

  browserTransport ??= createBrowserVoicevoxEngineTransport()
  return browserTransport
}

/** Registers the transport for this surface. Pass `undefined` to restore the default. */
export function setVoicevoxEngineTransport(transport: undefined | VoicevoxEngineTransport): void {
  registeredTransport = transport
}

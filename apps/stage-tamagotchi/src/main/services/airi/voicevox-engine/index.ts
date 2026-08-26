import type { VoicevoxEngineRequest, VoicevoxEngineResult } from '@proj-airi/stage-shared/voicevox-engine'
import type { Lifecycle } from 'injeca'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import {
  buildVoicevoxEngineUrl,
  createVoicevoxEngineRequestInit,
  isVoicevoxEngineEndpoint,
  resolveVoicevoxEngineHostPolicy,
  toVoicevoxEngineResponse,
} from '@proj-airi/stage-shared/voicevox-engine'
import { ipcMain } from 'electron'

import { electronVoicevoxEngineRequest } from '../../../../shared/eventa'

/**
 * Upper bound on one engine request. It applies even when the renderer sends no
 * signal of its own.
 *
 * A base URL that points at an address which drops packets holds the request
 * open for the operating system TCP timeout. The revalidation schedule then
 * starts another request every 15 seconds.
 */
const REQUEST_DEADLINE_MS = 30_000

/**
 * Registers the app-wide transport for VOICEVOX-family speech engines.
 *
 * A packaged renderer loads over `file://` and sends `Origin: null`, which every
 * engine in the family refuses under its default CORS policy. That policy does
 * not restrict this process, so the renderer forwards its requests here.
 */
export async function setupVoicevoxEngineService(options: { lifecycle: Lifecycle }) {
  const eventa = createContext(ipcMain)
  const stopHandling = defineInvokeHandler(
    eventa.context,
    electronVoicevoxEngineRequest,
    // Eventa gives the handler an AbortController when the caller passes a
    // signal. A cancelled speech turn then stops the request in this process.
    (request, handlerOptions) => performVoicevoxEngineRequest(request, handlerOptions?.abortController?.signal),
  )

  let disposal: Promise<void> | undefined
  const dispose = () => {
    disposal ??= (async () => {
      // Stop accepting work before the transport cancels the remaining invokes.
      stopHandling()
      eventa.dispose()
    })()
    return disposal
  }

  options.lifecycle.appHooks.onStop(dispose)

  return { dispose }
}

/**
 * Performs one engine request for the renderer.
 *
 * Two checks restrict what this reaches, and both refuse before a socket opens:
 *
 * - The endpoint is one of the four the family contract names. The payload
 *   carries no path, so a caller composes none.
 * - The host is this machine or the local network. No CORS policy restricts
 *   this process, so without the host check the contract lets the renderer
 *   drive requests to any host.
 *
 * The browser transport in `@proj-airi/stage-ui` applies no host policy. There
 * the origin rules of the page already restrict the request, so an engine behind a
 * public HTTPS reverse proxy keeps working on the web.
 */
export async function performVoicevoxEngineRequest(
  request: undefined | VoicevoxEngineRequest,
  signal?: AbortSignal,
): Promise<VoicevoxEngineResult> {
  if (!request || !isVoicevoxEngineEndpoint(request.endpoint))
    return { refusedBecause: 'unsupported-endpoint' }

  const policy = resolveVoicevoxEngineHostPolicy(request.baseUrl ?? '')
  if (!policy.allowed)
    return { refusedBecause: policy.refusedBecause }

  // Both checks above run once, against the address the renderer supplied. The
  // redirect rule that keeps them meaningful lives in the shared request init.
  const url = buildVoicevoxEngineUrl(request)
  return toVoicevoxEngineResponse(await fetch(url, createVoicevoxEngineRequestInit(request, withRequestDeadline(signal))))
}

function withRequestDeadline(signal?: AbortSignal): AbortSignal {
  const deadline = AbortSignal.timeout(REQUEST_DEADLINE_MS)
  return signal ? AbortSignal.any([signal, deadline]) : deadline
}

/**
 * The wire contract for VOICEVOX-family speech engines.
 *
 * These definitions live in a neutral package because the Electron main process
 * uses them too. A packaged renderer loads over `file://` and sends
 * `Origin: null`, which the engines refuse, so the main process makes the
 * request instead.
 */

export type VoicevoxEngineEndpoint = 'audio_query' | 'speakers' | 'synthesis' | 'version'

/**
 * Maps an endpoint onto its path.
 *
 * The Electron passthrough resolves paths only through this table. A free-form
 * path in the contract lets the renderer drive any request from the main
 * process, which no CORS policy restricts.
 */
export const VOICEVOX_ENGINE_PATHS = {
  audio_query: 'audio_query',
  speakers: 'speakers',
  synthesis: 'synthesis',
  version: 'version',
} as const satisfies Record<VoicevoxEngineEndpoint, string>

export interface VoicevoxEngineRefusal {
  refusedBecause: VoicevoxEngineRefusalCode
}

/** Why a transport declined to make a request. {@link resolveVoicevoxEngineHostPolicy} decides most of these. */
export type VoicevoxEngineRefusalCode
  = | 'credentials-in-url'
    | 'host-not-allowed'
    | 'invalid-base-url'
    | 'unsupported-endpoint'

export interface VoicevoxEngineRequest {
  baseUrl: string
  /** JSON request body. Only `synthesis` sends one. */
  body?: unknown
  endpoint: VoicevoxEngineEndpoint
  query?: Record<string, string>
}

/** A response that reached the engine. A non-2xx status is still a response. */
export interface VoicevoxEngineResponse {
  body: ArrayBuffer
  contentType: string
  status: number
  statusText: string
}

/**
 * A refusal is a value, not a thrown error. Electron IPC does not
 * carry an error subclass across the process boundary.
 */
export type VoicevoxEngineResult = VoicevoxEngineRefusal | VoicevoxEngineResponse

export type VoicevoxEngineTransport = (
  request: VoicevoxEngineRequest,
  signal?: AbortSignal,
) => Promise<VoicevoxEngineResult>

/**
 * The endpoints that use POST. `audio_query` sends no body: its text and style
 * id are sent as query parameters.
 */
const POST_ENDPOINTS = new Set<string>(['audio_query', 'synthesis'])

export function isVoicevoxEnginePostEndpoint(endpoint: VoicevoxEngineEndpoint): boolean {
  return POST_ENDPOINTS.has(endpoint)
}

/**
 * Builds the `fetch` options for one engine request.
 *
 * Every transport goes through here, so the redirect rule holds on all of them.
 * A followed redirect carries the request to a host the caller never checked, on
 * a path outside {@link VOICEVOX_ENGINE_PATHS}. No engine in the family
 * redirects, so refusing one costs nothing.
 */
export function createVoicevoxEngineRequestInit(
  request: VoicevoxEngineRequest,
  signal?: AbortSignal,
): RequestInit {
  return {
    method: isVoicevoxEnginePostEndpoint(request.endpoint) ? 'POST' : 'GET',
    redirect: 'error',
    signal,
    ...(request.body === undefined
      ? {}
      : { body: JSON.stringify(request.body), headers: { 'Content-Type': 'application/json' } }),
  }
}

/**
 * Maps one `Response` onto the shape a transport returns.
 *
 * An ArrayBuffer crosses Electron IPC through structured clone, so the WAV bytes
 * need no encoding step on either side.
 */
export async function toVoicevoxEngineResponse(response: Response): Promise<VoicevoxEngineResponse> {
  return {
    body: await response.arrayBuffer(),
    contentType: response.headers.get('content-type') ?? '',
    status: response.status,
    statusText: response.statusText,
  }
}

export function isVoicevoxEngineEndpoint(value: unknown): value is VoicevoxEngineEndpoint {
  return typeof value === 'string' && Object.hasOwn(VOICEVOX_ENGINE_PATHS, value)
}

export function isVoicevoxEngineRefusal(result: VoicevoxEngineResult): result is VoicevoxEngineRefusal {
  return 'refusedBecause' in result
}

/**
 * Appends a trailing slash so that a base URL with a path segment keeps it.
 *
 * @example
 * normalizeVoicevoxBaseUrl('http://localhost:50021')
 * // => 'http://localhost:50021/'
 *
 * @example
 * normalizeVoicevoxBaseUrl('http://example.internal/engine')
 * // => 'http://example.internal/engine/'
 */
export function normalizeVoicevoxBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

// The engines listen on plain HTTP. A reverse proxy in front of one serves
// HTTPS, so both schemes are accepted.
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * Throws when the base URL is not absolute. A caller that must not throw checks
 * the URL with {@link resolveVoicevoxEngineHostPolicy} first.
 */
export function buildVoicevoxEngineUrl(request: VoicevoxEngineRequest): URL {
  const url = new URL(VOICEVOX_ENGINE_PATHS[request.endpoint], normalizeVoicevoxBaseUrl(request.baseUrl))
  for (const [key, value] of Object.entries(request.query ?? {}))
    url.searchParams.set(key, value)

  return url
}

/**
 * Applies the host policy of the Electron passthrough.
 *
 * No CORS policy restricts the main process, so this decides how far the
 * renderer reaches through it. A speech engine runs on this machine or on the
 * local network. Nothing else has to be reachable.
 *
 * The browser transport does not apply this policy. There the origin rules of
 * the page already restrict the request, and an engine behind a public HTTPS
 * reverse proxy keeps working on the web surface.
 *
 * A base URL is also refused when the scheme is not http(s), or when it carries
 * a username or a password.
 *
 * @example
 * resolveVoicevoxEngineHostPolicy('http://localhost:50021/')
 * // => { allowed: true }
 *
 * @example
 * resolveVoicevoxEngineHostPolicy('https://tts.example.com/')
 * // => { allowed: false, refusedBecause: 'host-not-allowed' }
 */
export function resolveVoicevoxEngineHostPolicy(
  baseUrl: string,
): { allowed: false, refusedBecause: VoicevoxEngineRefusalCode } | { allowed: true } {
  let url: URL
  try {
    url = new URL(normalizeVoicevoxBaseUrl(baseUrl))
  }
  catch {
    return { allowed: false, refusedBecause: 'invalid-base-url' }
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol))
    return { allowed: false, refusedBecause: 'invalid-base-url' }

  if (url.username || url.password)
    return { allowed: false, refusedBecause: 'credentials-in-url' }

  if (!isLocalHostname(url.hostname))
    return { allowed: false, refusedBecause: 'host-not-allowed' }

  return { allowed: true }
}

/**
 * Reports whether a hostname names this machine or the local network.
 *
 * A public hostname is refused even when it resolves to a private address
 * today. The name and the address it resolves to differ later.
 *
 * `localhost` and the mDNS `.local` suffix pass, although both go through a
 * resolver. Users name a machine on their own network this way, and refusing
 * them removes the LAN case this policy exists to allow. Any device on the local
 * link publishes a `.local` name, which is why both transports refuse
 * redirects.
 */
function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()

  if (host === 'localhost' || host.endsWith('.localhost'))
    return true

  if (host.endsWith('.local'))
    return true

  // The WHATWG URL parser keeps the brackets of an IPv6 literal in `hostname`.
  if (host.startsWith('[') && host.endsWith(']'))
    return isLocalIpv6(host.slice(1, -1))

  const ipv4 = parseIpv4(host)
  return ipv4 ? isLocalIpv4(ipv4) : false
}

function isLocalIpv4(octets: number[]): boolean {
  const [first, second] = octets

  // Link-local 169.254/16 is absent on purpose. No engine is addressed there,
  // and the range contains the cloud metadata endpoint at 169.254.169.254.
  if (first === 127 || first === 10)
    return true
  if (first === 172 && second >= 16 && second <= 31)
    return true

  return first === 192 && second === 168
}

function isLocalIpv6(address: string): boolean {
  const host = address.toLowerCase()
  if (host === '::1')
    return true

  // Compare the first hextet as a number, not as text. The URL parser drops
  // leading zeroes, so a text prefix check accepts `fc::1`. That address has the
  // first hextet 0x00fc, and sits in reserved ::/8, not in fc00::/7.
  const firstGroup = host.startsWith('::') ? '0' : host.split(':')[0] ?? ''
  if (!/^[0-9a-f]{1,4}$/.test(firstGroup))
    return false

  const firstHextet = Number.parseInt(firstGroup, 16)

  // Unique local addresses fc00::/7.
  if (firstHextet >= 0xFC00 && firstHextet <= 0xFDFF)
    return true

  // Link-local addresses fe80::/10.
  return firstHextet >= 0xFE80 && firstHextet <= 0xFEBF
}

function parseIpv4(host: string): number[] | undefined {
  const parts = host.split('.')
  if (parts.length !== 4)
    return undefined

  const octets = parts.map(part => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN))
  return octets.every(octet => octet >= 0 && octet <= 255) ? octets : undefined
}

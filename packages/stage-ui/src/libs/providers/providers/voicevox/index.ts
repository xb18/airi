import { defineVoicevoxFamilyProvider } from './define'

export { applyVoicevoxParameters, describeVoicevoxRefusal, fetchEngineVersion, fetchSpeakers, synthesizeSpeech } from './engine'
export type { VoicevoxAudioQuery, VoicevoxSpeaker, VoicevoxSpeakerStyle, VoicevoxSynthesisParameters } from './engine'
export {
  createBrowserVoicevoxEngineTransport,
  getVoicevoxEngineTransport,
  setVoicevoxEngineTransport,
} from './transport'

export const providerVoicevox = defineVoicevoxFamilyProvider({
  defaultBaseUrl: 'http://localhost:50021/',
  description: 'voicevox.hiroshiba.jp',
  id: 'voicevox',
  name: 'VOICEVOX',
})

export const providerAivisSpeech = defineVoicevoxFamilyProvider({
  defaultBaseUrl: 'http://localhost:10101/',
  description: 'aivis-project.com',
  id: 'aivis-speech',
  name: 'AivisSpeech',
})

// COEIROINK, SHAREVOX, LMROID, ITVOICE and VOICEVOX Nemo implement the same API.
// Only the COEIROINK v2 port has a primary source, so this entry ships no
// default. A wrong port makes the engine look broken.
export const providerVoicevoxCompatible = defineVoicevoxFamilyProvider({
  defaultBaseUrl: '',
  description: 'COEIROINK, SHAREVOX, LMROID, ITVOICE, VOICEVOX Nemo',
  id: 'voicevox-compatible',
  name: 'VOICEVOX-compatible engine',
})

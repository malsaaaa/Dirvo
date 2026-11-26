export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'mistral'
  | 'xai'
  | 'deepseek'
  | 'groq'
  | 'openrouter'
  | 'ollama'
  | 'custom'

/** How Dirvo talks to a provider. Most services copy the OpenAI format. */
export type Protocol = 'anthropic' | 'openai' | 'gemini'

/** 'none': no key needed (local models). 'optional': used if you save one. */
export type KeyMode = 'required' | 'optional' | 'none'

export interface ProviderInfo {
  id: ProviderId
  label: string
  protocol: Protocol
  keyMode: KeyMode
  defaultModel: string
  defaultBaseUrl: string
  /** Local servers (Ollama, LM Studio) have an address you can change. Hosted services do not. */
  baseUrlEditable: boolean
  keyPlaceholder: string
  /** OpenAI's newer models want max_completion_tokens; most others still use max_tokens. */
  tokenParam: 'max_tokens' | 'max_completion_tokens'
}

// Default model names are best guesses at small, cheap, current models. Model names change often,
// so every provider's model can be edited in Settings.
export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    protocol: 'anthropic',
    keyMode: 'required',
    defaultModel: 'claude-haiku-5-5',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    baseUrlEditable: false,
    keyPlaceholder: 'sk-ant-…',
    tokenParam: 'max_tokens'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    protocol: 'openai',
    keyMode: 'required',
    defaultModel: 'gpt-4o-mini',
    defaultBaseUrl: 'https://api.openai.com/v1',
    baseUrlEditable: false,
    keyPlaceholder: 'sk-…',
    tokenParam: 'max_completion_tokens'
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    protocol: 'gemini',
    keyMode: 'required',
    defaultModel: 'gemini-2.5-flash',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    baseUrlEditable: false,
    keyPlaceholder: 'AIza…',
    tokenParam: 'max_tokens'
  },
  {
    id: 'mistral',
    label: 'Mistral',
    protocol: 'openai',
    keyMode: 'required',
    defaultModel: 'mistral-small-latest',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    baseUrlEditable: false,
    keyPlaceholder: 'API key',
    tokenParam: 'max_tokens'
  },
  {
    id: 'xai',
    label: 'xAI (Grok)',
    protocol: 'openai',
    keyMode: 'required',
    defaultModel: 'grok-3-mini',
    defaultBaseUrl: 'https://api.x.ai/v1',
    baseUrlEditable: false,
    keyPlaceholder: 'xai-…',
    tokenParam: 'max_tokens'
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    protocol: 'openai',
    keyMode: 'required',
    defaultModel: 'deepseek-chat',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    baseUrlEditable: false,
    keyPlaceholder: 'sk-…',
    tokenParam: 'max_tokens'
  },
  {
    id: 'groq',
    label: 'Groq',
    protocol: 'openai',
    keyMode: 'required',
    defaultModel: 'llama-3.3-70b-versatile',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    baseUrlEditable: false,
    keyPlaceholder: 'gsk_…',
    tokenParam: 'max_tokens'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    protocol: 'openai',
    keyMode: 'required',
    defaultModel: 'openai/gpt-4o-mini',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    baseUrlEditable: false,
    keyPlaceholder: 'sk-or-…',
    tokenParam: 'max_tokens'
  },
  {
    id: 'ollama',
    label: 'Ollama (runs on this PC)',
    protocol: 'openai',
    keyMode: 'none',
    defaultModel: 'llama3.1',
    defaultBaseUrl: 'http://localhost:11434/v1',
    baseUrlEditable: true,
    keyPlaceholder: '',
    tokenParam: 'max_tokens'
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    protocol: 'openai',
    keyMode: 'optional',
    defaultModel: 'local-model',
    defaultBaseUrl: 'http://localhost:1234/v1',
    baseUrlEditable: true,
    keyPlaceholder: 'API key (if the server needs one)',
    tokenParam: 'max_tokens'
  }
]

export const DEFAULT_PROVIDER: ProviderId = 'anthropic'

export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id)
}

export function isProviderId(id: unknown): id is ProviderId {
  return typeof id === 'string' && PROVIDERS.some((p) => p.id === id)
}

/** "localhost", "127.0.0.1" and "[::1]" only. */
export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase()
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1'
}

/** True when the address points at this PC, so nothing leaves it. */
export function isLoopbackUrl(url: string): boolean {
  try {
    return isLoopbackHost(new URL(url).hostname)
  } catch {
    return false
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

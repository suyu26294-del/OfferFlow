export const LLM_STORAGE_KEY = 'offerflow_llm_config'

export function getStoredLlmConfig() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(LLM_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return {
      provider: parsed.llmProvider || parsed.provider || '',
      apiKey: parsed.llmApiKey || parsed.apiKey || '',
      baseUrl: parsed.llmBaseUrl || parsed.baseUrl || '',
      model: parsed.llmModel || parsed.model || '',
    }
  } catch {
    return {}
  }
}

export function llmHeadersFromStorage() {
  const config = getStoredLlmConfig()
  const headers = {}
  if (config.provider) headers['x-llm-provider'] = config.provider
  if (config.apiKey) headers['x-llm-api-key'] = config.apiKey
  if (config.baseUrl) headers['x-llm-base-url'] = config.baseUrl
  if (config.model) headers['x-llm-model'] = config.model
  return headers
}

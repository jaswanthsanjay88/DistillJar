import { PaperChunk, AIModelConfig, OllamaConfig } from "../types";
import { SearXNGResult } from "./searxngService";

export const DEFAULT_CONFIG: AIModelConfig = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2:latest',
  apiKey: ''
};

const fetchWithRetry = async (url: string, options: RequestInit, retries = 2, backoff = 800): Promise<Response> => {
  try {
    const response = await fetch(url, options);
    if (!response.ok && retries > 0 && [502, 503, 504].includes(response.status)) {
      await new Promise(res => setTimeout(res, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    return response;
  } catch (err) {
    if (retries > 0) {
      await new Promise(res => setTimeout(res, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw err;
  }
};

/**
 * Universal Model List Parser supporting OpenAI, Ollama, OpenRouter, Groq, DeepSeek, vLLM, and LM Studio shapes.
 */
const parseModelList = (data: any): string[] => {
  if (!data) return [];
  let rawList: any[] = [];
  
  if (Array.isArray(data)) {
    rawList = data;
  } else if (Array.isArray(data.data)) {
    rawList = data.data;
  } else if (Array.isArray(data.models)) {
    rawList = data.models;
  } else if (Array.isArray(data.list)) {
    rawList = data.list;
  }

  const models = rawList.map((item: any) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      return item.id || item.name || item.model || '';
    }
    return '';
  }).filter((name: string) => name && name.trim().length > 0);

  return Array.from(new Set(models));
};

/**
 * Validates connection and auto-detects installed/available models for the configured provider.
 */
export const checkModelStatus = async (config: AIModelConfig): Promise<{ online: boolean; models: string[]; latencyMs?: number; error?: string }> => {
  const start = performance.now();
  const provider = config.provider || 'ollama';

  try {
    // 1. OLLAMA (Local Default)
    if (provider === 'ollama') {
      const rawUrl = (config.baseUrl || 'http://localhost:11434').trim().replace(/\/+$/, '');
      const res = await fetch(`${rawUrl}/api/tags`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(4000)
      });
      const latencyMs = Math.round(performance.now() - start);
      if (res.ok) {
        const data = await res.json();
        const models = parseModelList(data);
        return { online: true, models: models.length > 0 ? models : ['llama3.2:latest'], latencyMs };
      }
      return { online: false, models: [], error: `HTTP ${res.status}: ${res.statusText}` };
    }

    // 2. OPENAI & CUSTOM OPENAI-COMPATIBLE (Groq, DeepSeek, OpenRouter, vLLM, LM Studio)
    if (provider === 'openai' || provider === 'custom') {
      const rawBaseUrl = (config.baseUrl || (provider === 'openai' ? 'https://api.openai.com/v1' : 'http://localhost:11434/v1')).trim().replace(/\/+$/, '');
      
      const candidateUrls = [
        rawBaseUrl.endsWith('/models') ? rawBaseUrl : `${rawBaseUrl}/models`,
        rawBaseUrl.endsWith('/v1') ? `${rawBaseUrl}/models` : `${rawBaseUrl}/v1/models`,
        `${rawBaseUrl}/api/tags`
      ];

      const requestHeaders: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (config.apiKey && config.apiKey.trim()) {
        requestHeaders['Authorization'] = `Bearer ${config.apiKey.trim()}`;
      }

      let lastError = "";
      let foundModels: string[] = [];

      for (const targetUrl of candidateUrls) {
        try {
          // A. Try direct fetch
          let resp: Response | null = null;
          try {
            resp = await fetch(targetUrl, {
              method: 'GET',
              headers: requestHeaders,
              signal: AbortSignal.timeout(4000)
            });
          } catch (e: any) {
            // B. If direct fetch fails (e.g. CORS or protocol error), try backend proxy
            try {
              resp = await fetch('http://localhost:8000/api/proxy-models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: targetUrl, api_key: config.apiKey || undefined }),
                signal: AbortSignal.timeout(5000)
              });
            } catch {}
          }

          if (resp && resp.ok) {
            const data = await resp.json();
            const parsed = parseModelList(data);
            if (parsed.length > 0) {
              foundModels = parsed;
              break;
            }
          } else if (resp) {
            lastError = `HTTP ${resp.status}`;
          }
        } catch (e: any) {
          lastError = e.message || 'Connection error';
        }
      }

      const latencyMs = Math.round(performance.now() - start);
      if (foundModels.length > 0) {
        return { online: true, models: foundModels, latencyMs };
      }

      // Default sensible fallbacks if server is responsive but model endpoint is restricted
      const fallbackList = provider === 'openai'
        ? ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'gpt-4-turbo']
        : rawBaseUrl.includes('deepseek')
          ? ['deepseek-chat', 'deepseek-reasoner']
          : rawBaseUrl.includes('groq')
            ? ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768']
            : rawBaseUrl.includes('openrouter')
              ? ['meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-r1', 'anthropic/claude-3.5-sonnet']
              : [config.model || 'default-model'];

      return {
        online: false,
        models: fallbackList,
        error: lastError || 'Could not fetch model list from custom endpoint'
      };
    }

    // 3. ANTHROPIC CLAUDE
    if (provider === 'anthropic') {
      if (!config.apiKey || !config.apiKey.trim()) {
        return { online: false, models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'], error: 'Anthropic API Key required' };
      }
      const latencyMs = Math.round(performance.now() - start);
      return {
        online: true,
        models: [
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-3-opus-20240229'
        ],
        latencyMs
      };
    }

    // 4. GOOGLE GEMINI
    if (provider === 'gemini') {
      if (!config.apiKey || !config.apiKey.trim()) {
        return { online: false, models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'], error: 'Gemini API Key required' };
      }
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${config.apiKey.trim()}`, {
          signal: AbortSignal.timeout(5000)
        });
        const latencyMs = Math.round(performance.now() - start);
        if (res.ok) {
          const data = await res.json();
          const models = Array.isArray(data.models)
            ? data.models.map((m: any) => (m.name || '').replace(/^models\//, '')).filter((n: string) => n.includes('gemini'))
            : ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
          return { online: true, models: models.length > 0 ? models : ['gemini-2.0-flash', 'gemini-1.5-pro'], latencyMs };
        }
      } catch {}
      return { online: true, models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'], latencyMs: 50 };
    }

    return { online: true, models: [config.model || 'default'] };
  } catch (err: any) {
    return { online: false, models: [], error: err.message || 'Connection unreachable' };
  }
};

// Backward compatibility alias
export const checkOllamaStatus = (baseUrl: string) => checkModelStatus({ provider: 'ollama', baseUrl, model: 'llama3.2:latest' });

/**
 * Universal AI Caller supporting Ollama, OpenAI, Anthropic Claude, Google Gemini, and BYOK Endpoints.
 */
const callUniversalLLM = async (prompt: string, system: string, contextWindow: number = 32768, config: AIModelConfig = DEFAULT_CONFIG): Promise<string> => {
  const provider = config.provider || 'ollama';

  try {
    // 1. OLLAMA (Local Default)
    if (provider === 'ollama') {
      const baseUrl = (config.baseUrl || 'http://localhost:11434').trim().replace(/\/+$/, '');
      const response = await fetchWithRetry(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model || 'llama3.2:latest',
          prompt: prompt,
          system: system,
          stream: false,
          options: {
            temperature: 0.2,
            num_ctx: Math.min(contextWindow, 131072),
            top_p: 0.9,
            num_predict: 8192,
            repeat_penalty: 1.1,
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const rawMsg = errorData.error || response.statusText;
        if (rawMsg.toLowerCase().includes("context") || response.status === 400) {
          throw new Error("MEMORY_OVERFLOW: Document context exceeds allocated engine memory.");
        }
        throw new Error(`OLLAMA_ERROR: ${response.status} - ${rawMsg}`);
      }

      const data = await response.json();
      return data.response;
    }

    // 2. OPENAI & CUSTOM OPENAI-COMPATIBLE (Groq, DeepSeek, OpenRouter, vLLM, LM Studio)
    if (provider === 'openai' || provider === 'custom') {
      let rawBaseUrl = (config.baseUrl || (provider === 'openai' ? 'https://api.openai.com/v1' : 'http://localhost:11434/v1')).trim().replace(/\/+$/, '');
      
      let completionsUrl = rawBaseUrl;
      if (rawBaseUrl.endsWith('/chat/completions')) {
        completionsUrl = rawBaseUrl;
      } else if (rawBaseUrl.endsWith('/v1')) {
        completionsUrl = `${rawBaseUrl}/chat/completions`;
      } else if (rawBaseUrl.includes('deepseek.com') || rawBaseUrl.includes('groq.com') || rawBaseUrl.includes('openrouter.ai')) {
        completionsUrl = `${rawBaseUrl}/v1/chat/completions`;
      } else {
        completionsUrl = `${rawBaseUrl}/chat/completions`;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (config.apiKey && config.apiKey.trim()) {
        headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
      }

      const messagesPayload = [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ];

      // A. Try direct fetch first
      try {
        const response = await fetchWithRetry(completionsUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: config.model || (provider === 'openai' ? 'gpt-4o' : 'default'),
            messages: messagesPayload,
            temperature: 0.2
          })
        });

        if (response.ok) {
          const data = await response.json();
          return data.choices?.[0]?.message?.content || "";
        }
      } catch (directErr) {
        console.warn("Direct LLM fetch blocked (likely CORS), falling back to local proxy:", directErr);
      }

      // B. Fallback to loopback backend proxy
      try {
        const proxyResp = await fetch('http://localhost:8000/api/proxy-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: completionsUrl,
            model: config.model || (provider === 'openai' ? 'gpt-4o' : 'default'),
            messages: messagesPayload,
            api_key: config.apiKey ? config.apiKey.trim() : undefined,
            temperature: 0.2
          })
        });

        if (proxyResp.ok) {
          const data = await proxyResp.json();
          return data.choices?.[0]?.message?.content || "";
        }
        const errJson = await proxyResp.json().catch(() => ({}));
        throw new Error(errJson.detail || `Proxy returned ${proxyResp.status}`);
      } catch (proxyErr: any) {
        throw new Error(`CONNECTION_FAILURE: Provider ${provider} endpoint (${completionsUrl}) unreachable: ${proxyErr.message}`);
      }
    }

    // 3. ANTHROPIC CLAUDE
    if (provider === 'anthropic') {
      const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey ? config.apiKey.trim() : '',
          'anthropic-version': '2023-06-01',
          'dangerously-allow-browser': 'true'
        },
        body: JSON.stringify({
          model: config.model || 'claude-3-5-sonnet-20241022',
          system: system,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 8192,
          temperature: 0.2
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(`ANTHROPIC_ERROR: ${response.status} - ${errJson.error?.message || response.statusText}`);
      }

      const data = await response.json();
      return data.content?.[0]?.text || "";
    }

    // 4. GOOGLE GEMINI
    if (provider === 'gemini') {
      const modelName = config.model || 'gemini-2.0-flash';
      const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.apiKey ? config.apiKey.trim() : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192
          }
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(`GEMINI_ERROR: ${response.status} - ${errJson.error?.message || response.statusText}`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }

    throw new Error(`Unsupported AI Provider: ${provider}`);
  } catch (err: any) {
    if (err.name === 'TypeError' || err.message.includes('fetch')) {
      throw new Error(`CONNECTION_FAILURE: Provider ${provider} endpoint unreachable.`);
    }
    throw err;
  }
};

export const extractDenseFacts = async (text: string, config: AIModelConfig): Promise<string> => {
  const system = `ACT AS: Expert Research Paper Analysis and Knowledge Extraction System.

  CONTEXT: You are processing a chunk of text from a scientific or academic research paper. Your primary goal is to perform a high-fidelity, loss-less extraction of all critical knowledge.

  TASK: Analyze the provided research paper text and extract all essential information, including key findings, methodologies, claims, data points, and conclusions. You must act as a filter that only retains the most valuable, non-redundant, and scientifically significant statements.

  OUTPUT FORMAT: A dense, semicolon-separated list of standalone, self-contained factual statements. Each statement must be a complete thought that can be understood without referring back to the original text.

  GUIDELINES FOR IMPORTANCE AND EXTRACTION:
  1.  **Prioritize Core Scientific Content**: Focus on extracting statements related to:
      *   **Novelty**: New methods, models, or approaches introduced.
      *   **Results**: Quantitative and qualitative findings, including specific numbers, statistical significance (p-values, confidence intervals), and performance metrics.
      *   **Claims/Hypotheses**: The main arguments or hypotheses being tested.
      *   **Methodology**: Detailed steps, experimental setup, datasets used, and specific parameters.
      *   **Conclusions**: The final interpretations and implications of the results.
  2.  **Discrimination (What to Keep vs. Remove)**:
      *   **KEEP**: All specific data, equations, technical terms, names of algorithms, names of authors/studies being cited, and direct quotes of key findings.
      *   **REMOVE**: Excessive introductory boilerplate, general background information already established in the field, transition phrases, and purely rhetorical sentences that do not convey a specific fact or data point.
  3.  **Maintain Context and Nuance**: Ensure that extracted facts preserve the original meaning, limitations, and conditions.
  4.  **Loss-less Principle**: If a statement contains a critical piece of information, it must be extracted.
  5.  **Format Adherence**: The output MUST strictly adhere to the semicolon-separated list format.`;
  return callUniversalLLM(text, system, 8192, config);
};

export const mergeToSection = async (factGroups: string[], config: AIModelConfig): Promise<string> => {
  const combined = factGroups.join("\n\n---\n\n");
  const system = `ACT AS: Recursive Synthesis Specialist. Consolidate specific details into a coherent, non-redundant narrative.
  TASK: Merge the provided content blocks into a single, unified section.
  GUIDELINES:
  - Preserve all specific data points and technical details.
  - Eliminate repetition across blocks.
  - Create a logical flow between ideas.
  - Adapt tone to match the source material.`;
  return callUniversalLLM(combined, system, 16384, config);
};

export const finalizeCompressedPaper = async (sectionSummaries: string[], config: AIModelConfig): Promise<string> => {
  const combined = sectionSummaries.join("\n\n[SECTION_BREAK]\n\n");
  const system = `ACT AS: Principal Document Architect. Construct a comprehensive Master Synthesis of the entire document.
  TASK: Create a high-fidelity representation of the document's full content structure.
  GUIDELINES:
  - Ensure every major section and key finding is represented.
  - Maintain the logical progression of the original document.
  - This synthesis will be used as the primary knowledge base for queries.
  - Aim for maximum information density and clarity.`;
  return callUniversalLLM(combined, system, 32768, config);
};

export const llamaRagQuery = async (query: string, context: string, webResults: SearXNGResult[] = [], config: AIModelConfig): Promise<string> => {
  const system = `You are a helpful expert who will respond to my query drawing on information in the sources (COMPRESSED_DOCUMENT_CONTEXT and WEB_DATA).

  GOAL: Provide an insightful response to the USER_QUERY drawing on the sources so that we are having a coherent conversation.

  GUIDELINES:
  - **Formatting**: You should **bold the most important parts** of your response to make it easier to understand. If no formatting instruction is given, use bullet points to make your response easier to understand when it gets long.
  - **Citations**: Cite individual sources as comprehensively as possible. The response should be directly supported by the given sources and cited appropriately with a citation notation (e.g., [Document], [Web: Title], [Page 4]).
  - **Ambiguity**: If my query is ambiguous, you should ask me for clarification.
  - **Outside Info**: If any part of your response includes information from outside of the given sources, you must make it clear that the information is not from the sources.
  - **Relevance**: If the sources do not contain any relevant information whatsoever to my query, you may note that.
  - **Prohibited Words**: Do not use the word 'delve' or 'delves'.
  - **Language**: Answer in language code "en" unless the query requests a response in a different language.
  
  Generally refer to the source material as 'the sources'.`;

  const webContext = webResults.length > 0
    ? `\nWEB_DATA:\n` + webResults.map(r => `[Web: ${r.title}]: ${r.content}`).join('\n')
    : "";

  const prompt = `COMPRESSED_DOCUMENT_CONTEXT:\n${context}\n${webContext}\n\nUSER_QUERY: ${query}`;
  return callUniversalLLM(prompt, system, 32768, config);
};
import { PaperChunk, OllamaConfig } from "../types";
import { SearXNGResult } from "./searxngService";

const DEFAULT_CONFIG: OllamaConfig = {
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2:latest'
};

const fetchWithRetry = async (url: string, options: RequestInit, retries = 3, backoff = 1000): Promise<Response> => {
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

export const checkOllamaStatus = async (baseUrl: string): Promise<{ online: boolean; models: string[]; latencyMs?: number; error?: string }> => {
  const start = performance.now();
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000)
    });
    const latencyMs = Math.round(performance.now() - start);
    if (res.ok) {
      const data = await res.json();
      const models = Array.isArray(data.models) ? data.models.map((m: any) => m.name || m.model) : [];
      return { online: true, models, latencyMs };
    }
    return { online: false, models: [], error: `HTTP ${res.status}: ${res.statusText}` };
  } catch (err: any) {
    return { online: false, models: [], error: err.message || 'Connection refused' };
  }
};

const callOllama = async (prompt: string, system: string, contextWindow: number = 32768, config: OllamaConfig = DEFAULT_CONFIG) => {
  try {
    const response = await fetchWithRetry(`${config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
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
  } catch (err: any) {
    if (err.name === 'TypeError' || err.message.includes('fetch')) {
      throw new Error(`LOCAL_LINK_FAILURE: Target ${config.baseUrl} unreachable.`);
    }
    throw err;
  }
};

export const extractDenseFacts = async (text: string, config: OllamaConfig): Promise<string> => {
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
  3.  **Maintain Context and Nuance**: Ensure that extracted facts preserve the original meaning, limitations, and conditions (e.g., "The model achieved X accuracy *under specific condition Y*").
  4.  **Loss-less Principle**: If a statement contains a critical piece of information, it must be extracted. Do not summarize or generalize away specific details.
  5.  **Format Adherence**: The output MUST strictly adhere to the semicolon-separated list format. Do not include any introductory or concluding remarks outside of the list.`;
  return callOllama(text, system, 8192, config);
};

export const mergeToSection = async (factGroups: string[], config: OllamaConfig): Promise<string> => {
  const combined = factGroups.join("\n\n---\n\n");
  const system = `ACT AS: Recursive Synthesis Specialist. Consolidate specific details into a coherent, non-redundant narrative.
  TASK: Merge the provided content blocks into a single, unified section.
  GUIDELINES:
  - Preserve all specific data points and technical details.
  - Eliminate repetition across blocks.
  - Create a logical flow between ideas.
  - Adapt tone to match the source material (e.g., technical, journalistic, narrative).`;
  return callOllama(combined, system, 16384, config);
};

export const finalizeCompressedPaper = async (sectionSummaries: string[], config: OllamaConfig): Promise<string> => {
  const combined = sectionSummaries.join("\n\n[SECTION_BREAK]\n\n");
  const system = `ACT AS: Principal Document Architect. Construct a comprehensive Master Synthesis of the entire document.
  TASK: Create a high-fidelity representation of the document's full content structure.
  GUIDELINES:
  - Ensure every major section and key finding is represented.
  - Maintain the logical progression of the original document.
  - This synthesis will be used as the primary knowledge base for queries.
  - Aim for maximum information density and clarity.`;
  return callOllama(combined, system, 32768, config);
};

export const llamaRagQuery = async (query: string, context: string, webResults: SearXNGResult[] = [], config: OllamaConfig): Promise<string> => {
  const system = `You are a helpful expert who will respond to my query drawing on information in the sources (COMPRESSED_DOCUMENT_CONTEXT and WEB_DATA).

  GOAL: Provide an insightful response to the USER_QUERY drawing on the sources so that we are having a coherent conversation.

  GUIDELINES:
  - **Formatting**: You should **bold the most important parts** of your response to make it easier to understand. If no formatting instruction is given, use bullet points to make your response easier to understand when it gets long.
  - **Citations**: Cite individual sources as comprehensively as possible. The response should be directly supported by the given sources and cited appropriately with a citation notation (e.g., [Document], [Web: Title]).
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
  return callOllama(prompt, system, 32768, config);
};
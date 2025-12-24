// Use Vite proxy to avoid CORS issues
const SEARXNG_URL = '/api/search';

export interface SearXNGResult {
  title: string;
  content: string;
  url: string;
}

const fetchWithRetry = async (url: string, retries = 2, backoff = 500): Promise<Response> => {
  try {
    const response = await fetch(url);
    if (!response.ok && retries > 0) {
      await new Promise(res => setTimeout(res, backoff));
      return fetchWithRetry(url, retries - 1, backoff * 2);
    }
    return response;
  } catch (err) {
    if (retries > 0) {
      await new Promise(res => setTimeout(res, backoff));
      return fetchWithRetry(url, retries - 1, backoff * 2);
    }
    throw err;
  }
};

export const searchExternal = async (query: string): Promise<SearXNGResult[]> => {
  try {
    const response = await fetchWithRetry(`${SEARXNG_URL}?q=${encodeURIComponent(query)}&format=json`);
    if (!response.ok) throw new Error("SEARXNG_SERVICE_DOWN");

    const data = await response.json();
    return (data.results || []).slice(0, 5).map((r: any) => ({
      title: r.title,
      content: r.content,
      url: r.url
    }));
  } catch (error) {
    console.warn("Web search unavailable. Make sure SearXNG is running on port 4000:", error);
    return []; // Gracefully return empty results
  }
};

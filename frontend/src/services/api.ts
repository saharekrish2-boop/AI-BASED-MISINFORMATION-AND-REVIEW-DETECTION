// Centralized API service - all backend communication goes through this module.
import type {
  Analytics,
  GeneralAnalysisResult,
  Health,
  HistoryItem,
  HistoryQuery,
  HistoryResponse,
  ModelInfo,
  NewsAnalysisResult,
  ReviewAnalysisResult,
  Stats,
  TrainResponse,
} from "@/types";

const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// API key (required by the sensitive endpoints - see README "Security Notes")
// Resolution order: key saved in this browser, then the build-time VITE_API_KEY.
// ---------------------------------------------------------------------------
const API_KEY_STORAGE_KEY = "truthlens-api-key";

export function getStoredApiKey(): string {
  try {
    return (localStorage.getItem(API_KEY_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function getActiveApiKey(): string {
  return (getStoredApiKey() || import.meta.env.VITE_API_KEY || "").trim();
}

export function setStoredApiKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch {
    // storage unavailable (private mode) - the env var still applies
  }
}

export function hasActiveApiKey(): boolean {
  return getActiveApiKey().length > 0;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = getActiveApiKey();
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
        ...(init?.headers || {}),
      },
      ...init,
    });
  } catch {
    throw new ApiError(
      "Cannot reach the TruthLens API. Make sure the backend is running.",
      0
    );
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    try {
      const body = await response.json();
      if (typeof body?.detail === "string") {
        message = body.detail;
      } else if (Array.isArray(body?.detail)) {
        // FastAPI default validation errors
        const first = body.detail[0];
        message = first?.msg ? `${first.msg}` : message;
      }
    } catch {
      // ignore body parse errors
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") search.set(k, String(v));
  });
  const s = search.toString();
  return s ? `?${s}` : "";
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export function analyzeNews(payload: {
  headline: string;
  content: string;
  source_url?: string;
}): Promise<NewsAnalysisResult> {
  return request<NewsAnalysisResult>("/api/news/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function analyzeReview(payload: {
  review_text: string;
  product_name?: string;
  rating?: number;
  verified_purchase?: boolean;
}): Promise<ReviewAnalysisResult> {
  return request<ReviewAnalysisResult>("/api/reviews/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getStats(): Promise<Stats> {
  return request<Stats>("/api/stats");
}

export function getHistory(query: HistoryQuery = {}): Promise<HistoryResponse> {
  return request<HistoryResponse>(
    `/api/history${qs({
      type: query.type,
      prediction: query.prediction,
      q: query.q,
      sort: query.sort,
      page: query.page,
      page_size: query.page_size,
    })}`
  );
}

export function getHistoryItem(id: number): Promise<HistoryItem> {
  return request<HistoryItem>(`/api/history/${id}`);
}

export function deleteHistoryItem(id: number): Promise<{ deleted: number }> {
  return request<{ deleted: number }>(`/api/history/${id}`, { method: "DELETE" });
}

export function clearHistory(): Promise<{ deleted: number }> {
  return request<{ deleted: number }>("/api/history", { method: "DELETE" });
}

export function getAnalytics(): Promise<Analytics> {
  return request<Analytics>("/api/analytics");
}

export function getHealth(): Promise<Health> {
  return request<Health>("/api/health");
}

export function getModelInfo(): Promise<ModelInfo[]> {
  return request<ModelInfo[]>("/api/models/info");
}

export function trainModels(model: "all" | "news" | "reviews" | "general" = "all"): Promise<TrainResponse> {
  return request<TrainResponse>("/api/models/train", {
    method: "POST",
    body: JSON.stringify({ model }),
  });
}

export function analyzeGeneral(payload: {
  content: string;
  content_type?: "post" | "blog" | "description" | "article";
}): Promise<GeneralAnalysisResult> {
  return request<GeneralAnalysisResult>("/api/content/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface FetchedArticle {
  url: string;
  headline: string;
  content: string;
  kind?: "article" | "video";
  source_type?: "article" | "video";
  is_video?: boolean;
}

export function fetchArticleFromUrl(url: string): Promise<FetchedArticle> {
  return request<FetchedArticle>("/api/news/fetch-url", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function analyzeNewsUrl(url: string): Promise<NewsAnalysisResult> {
  return request<NewsAnalysisResult>("/api/news/analyze-url", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export const API_BASE_URL = API_URL;

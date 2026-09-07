// Shared API types for TruthLens AI

export type Severity = "high" | "medium" | "low" | "positive" | "info";
export type Prediction = "real" | "misinformative" | "genuine" | "suspicious";
export type Sentiment = "positive" | "neutral" | "negative";
export type AnalysisType = "news" | "review";

export interface Signal {
  id: string;
  title: string;
  description: string;
  severity: Severity;
}

export interface TextStats {
  word_count: number;
  char_count: number;
  sentence_count: number;
  avg_word_length: number;
  exclamation_count: number;
  question_count: number;
  all_caps_ratio: number;
  unique_word_ratio: number;
}

export interface NewsAnalysisResult {
  id: number;
  prediction: "real" | "misinformative";
  confidence: number;
  model: string;
  processing_time_ms: number;
  signals: Signal[];
  text_stats: TextStats;
  timestamp: string;
  word_count: number;
  disclaimer: string;
  headline: string;
  sentiment: Sentiment;
  source_url: string | null;
}

export interface ReviewAnalysisResult {
  id: number;
  prediction: "genuine" | "suspicious";
  confidence: number;
  model: string;
  processing_time_ms: number;
  signals: Signal[];
  text_stats: TextStats;
  timestamp: string;
  word_count: number;
  disclaimer: string;
  product_name: string | null;
  rating: number | null;
  verified_purchase: boolean | null;
  sentiment: Sentiment;
}

export interface ModelMetricsSummary {
  trained: boolean;
  accuracy: number | null;
  demo_data: boolean;
  last_trained: string | null;
  algorithm: string | null;
}

export interface Stats {
  total_analyses: number;
  news_count: number;
  review_count: number;
  suspicious_count: number;
  misinformative_count: number;
  fake_review_count: number;
  real_count: number;
  genuine_count: number;
  avg_confidence: number | null;
  detection_accuracy: number | null;
  news_model: ModelMetricsSummary;
  review_model: ModelMetricsSummary;
}

export interface Health {
  status: "ok" | "degraded";
  version: string;
  database: boolean;
  news_model: boolean;
  review_model: boolean;
  analysis_engine: boolean;
  timestamp: string;
}

export interface HistoryItem {
  id: number;
  type: AnalysisType;
  headline: string | null;
  input_text: string;
  source_url: string | null;
  product_name: string | null;
  rating: number | null;
  verified_purchase: boolean | null;
  prediction: Prediction;
  confidence: number;
  sentiment: Sentiment | null;
  model_name: string;
  processing_time: number;
  signals: Signal[];
  text_stats: TextStats | null;
  word_count: number;
  char_count: number;
  created_at: string;
}

export interface HistoryResponse {
  items: HistoryItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface HistoryQuery {
  type?: string;
  prediction?: string;
  q?: string;
  sort?: "newest" | "oldest" | "confidence";
  page?: number;
  page_size?: number;
}

export interface Analytics {
  has_data: boolean;
  total: number;
  news_results: { real: number; misinformative: number };
  review_results: { genuine: number; suspicious: number };
  type_counts: { news: number; review: number };
  confidence_buckets: { range: string; count: number }[];
  daily_volume: { date: string; short: string; news: number; review: number; total: number }[];
  sentiment_distribution: { positive: number; neutral: number; negative: number };
  suspicious_rate: number;
  daily_suspicious_rate: { date: string; short: string; rate: number; flagged: number; total: number }[];
}

export interface ModelInfo {
  key: "news" | "reviews";
  name: string;
  algorithm: string;
  vectorizer: string;
  classifier: string;
  trained: boolean;
  demo_data: boolean;
  training_samples: number | null;
  test_samples: number | null;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  confusion_matrix: number[][] | null;
  labels: string[] | null;
  last_trained: string | null;
  data_source: string | null;
}

export interface TrainResponse {
  success: boolean;
  message: string;
  news: Record<string, unknown> | null;
  reviews: Record<string, unknown> | null;
  elapsed_ms: number;
}

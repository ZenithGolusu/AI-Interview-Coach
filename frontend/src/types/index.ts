// Core types for the AI Interview Coach application

export interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

// ─── Interview Types ────────────────────────────────────────────────────────

export type InterviewMode =
  | 'general'
  | 'resume_based'
  | 'jd_based'
  | 'resume_jd'
  | 'hr'
  | 'technical';

export type ExperienceLevel = 'fresher' | 'junior' | 'mid' | 'senior';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type InterviewStatus = 'setup' | 'in_progress' | 'completed' | 'abandoned';
export type AnswerMode = 'voice' | 'text';
export type VoiceGender = 'male' | 'female';

export interface InterviewConfig {
  mode: InterviewMode;
  experience_level: ExperienceLevel;
  difficulty: Difficulty;
  duration_minutes: 10 | 20 | 30;
  target_role: string;
  language: string;
  voice_gender: VoiceGender;
  enable_followup: boolean;
  feedback_mode: 'each' | 'final';
  resume_id?: string;
  job_description_id?: string;
}

export interface Interview {
  id: string;
  mode: InterviewMode;
  experience_level: ExperienceLevel;
  difficulty: Difficulty;
  duration_minutes: number;
  target_role: string;
  language: string;
  voice_gender: VoiceGender;
  enable_followup: boolean;
  feedback_mode: string;
  status: InterviewStatus;
  current_question_index: number;
  resume_id?: string;
  job_description_id?: string;
  started_at?: string;
  ended_at?: string;
  created_at: string;
}

// ─── Question & Answer Types ────────────────────────────────────────────────

export interface Answer {
  id: string;
  text: string;
  answer_mode: AnswerMode;
  duration_seconds?: number;
  evaluation?: AnswerEvaluation;
}

export interface Question {
  id: string;
  text: string;
  category: string;
  topic?: string;
  difficulty_level: Difficulty;
  sequence_number: number;
  is_followup: boolean;
  audio_url?: string;
  answer?: Answer;
}

export interface AnswerEvaluation {
  id: string;
  technical_accuracy: number;
  relevance: number;
  clarity: number;
  completeness: number;
  communication: number;
  overall_score: number;
  strengths?: string[];
  improvements?: string[];
  missing_concepts?: string[];
  suggestions?: string[];
  example_answer?: string;
}

export interface SubmitAnswerRequest {
  question_id: string;
  interview_id: string;
  text: string;
  answer_mode: AnswerMode;
  duration_seconds?: number;
  thinking_time_seconds?: number;
}

export interface NextQuestionResponse {
  question?: Question;
  evaluation?: AnswerEvaluation;
  interview_complete: boolean;
  remaining_time_seconds?: number;
}

// ─── Resume & JD Types ──────────────────────────────────────────────────────

export interface Resume {
  id: string;
  filename: string;
  file_size_bytes: number;
  parsed_data?: Record<string, any>;
  is_processed: boolean;
  created_at: string;
}

export interface JobDescription {
  id: string;
  raw_text: string;
  parsed_data?: Record<string, any>;
  is_processed: boolean;
  created_at: string;
}

// ─── Report Types ───────────────────────────────────────────────────────────

export interface InterviewReport {
  id: string;
  interview_id: string;
  overall_score: number;
  technical_score: number;
  communication_score: number;
  clarity_score: number;
  relevance_score: number;
  completeness_score: number;
  strong_topics?: string[];
  weak_topics?: string[];
  missing_concepts?: string[];
  recommendations?: string[];
  preparation_plan?: {
    immediate: string[];
    short_term: string[];
    long_term: string[];
  };
  total_questions: number;
  voice_answers_count: number;
  text_answers_count: number;
  actual_duration_seconds?: number;
  pdf_path?: string;
  created_at: string;
}

// ─── Dashboard Types ─────────────────────────────────────────────────────────

export interface RecentInterviewItem {
  id: string;
  target_role: string;
  mode: InterviewMode;
  difficulty: Difficulty;
  overall_score?: number;
  status: InterviewStatus;
  created_at: string;
  duration_minutes: number;
}

export interface ScoreTrendPoint {
  date: string;
  overall_score: number;
  interview_id: string;
}

export type CategoryStatus = 'exceptional' | 'proficient' | 'needs_focus';

export interface CategoryAnalysis {
  category: string;
  label: string;
  average_score: number;
  benchmark_score: number;
  status: CategoryStatus;
  description: string;
  strengths: string[];
  improvements: string[];
  recommendations: string[];
}

export interface CategoryAverages {
  technical: number;
  communication: number;
  clarity: number;
  relevance: number;
  completeness: number;
}

export interface DashboardStats {
  total_interviews: number;
  completed_interviews: number;
  average_score: number;
  total_voice_answers: number;
  total_text_answers: number;
  strongest_topics: string[];
  weakest_topics: string[];
  recent_interviews: RecentInterviewItem[];
  score_trend: ScoreTrendPoint[];
  category_averages: CategoryAverages;
  category_analysis: CategoryAnalysis[];
}

export interface InterviewHistoryItem {
  id: string;
  target_role: string;
  mode: InterviewMode;
  difficulty: Difficulty;
  experience_level: ExperienceLevel;
  duration_minutes: number;
  status: InterviewStatus;
  overall_score?: number;
  total_questions?: number;
  voice_answers_count?: number;
  text_answers_count?: number;
  created_at: string;
  ended_at?: string;
}

// ─── Live Interview State (Frontend) ────────────────────────────────────────

export type LiveAnswerMode = 'voice' | 'text';

export interface LiveInterviewState {
  interview: Interview | null;
  currentQuestion: Question | null;
  answerMode: LiveAnswerMode;
  isRecording: boolean;
  isProcessingAudio: boolean;
  isSpeaking: boolean;
  transcript: string;
  elapsedSeconds: number;
  isComplete: boolean;
  lastEvaluation: AnswerEvaluation | null;
  questionHistory: Question[];
}

import axios from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import type {
  AuthTokens,
  User,
  Interview,
  InterviewConfig,
  Question,
  SubmitAnswerRequest,
  NextQuestionResponse,
  Resume,
  JobDescription,
  InterviewReport,
  DashboardStats,
  InterviewHistoryItem,
} from '@/types';

const BASE_URL = '/api/v1';

// ─── Axios Instance ──────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000, // 60s for long AI operations
});

// ─── Request Interceptor: Attach JWT ─────────────────────────────────────────

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response Interceptor: Handle token refresh ──────────────────────────────

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const resp = await axios.post(`${BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });
        const { access_token, refresh_token } = resp.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        original.headers.Authorization = `Bearer ${access_token}`;
        return api(original);
      } catch {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth API ─────────────────────────────────────────────────────────────────

export const authApi = {
  register: (data: { email: string; password: string; full_name: string }) =>
    api.post<AuthTokens>('/auth/register', data).then((r) => r.data),

  login: (data: { email: string; password: string }) =>
    api.post<AuthTokens>('/auth/login', data).then((r) => r.data),

  refresh: (refreshToken: string) =>
    api.post<AuthTokens>('/auth/refresh', { refresh_token: refreshToken }).then((r) => r.data),
};

// ─── Resume API ───────────────────────────────────────────────────────────────

export const resumeApi = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<Resume>('/resumes/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      })
      .then((r) => r.data);
  },
  list: () => api.get<Resume[]>('/resumes/').then((r) => r.data),
  get: (id: string) => api.get<Resume>(`/resumes/${id}`).then((r) => r.data),
  delete: (id: string) => api.delete(`/resumes/${id}`),
};

// ─── Job Description API ──────────────────────────────────────────────────────

export const jdApi = {
  create: (raw_text: string) =>
    api.post<JobDescription>('/job-descriptions/', { raw_text }).then((r) => r.data),
  list: () => api.get<JobDescription[]>('/job-descriptions/').then((r) => r.data),
  get: (id: string) => api.get<JobDescription>(`/job-descriptions/${id}`).then((r) => r.data),
};

// ─── Interview API ────────────────────────────────────────────────────────────

export const interviewApi = {
  create: (config: InterviewConfig) =>
    api.post<Interview>('/interviews/', config).then((r) => r.data),

  start: (interviewId: string) =>
    api
      .post<{ interview: Interview; first_question: Question }>(`/interviews/${interviewId}/start`)
      .then((r) => r.data),

  submitAnswer: (data: SubmitAnswerRequest) =>
    api.post<NextQuestionResponse>('/interviews/submit-answer', data).then((r) => r.data),

  end: (interviewId: string) =>
    api.post<InterviewReport>(`/interviews/${interviewId}/end`).then((r) => r.data),

  abandon: (interviewId: string) =>
    api.post<Interview>(`/interviews/${interviewId}/abandon`).then((r) => r.data),

  get: (id: string) => api.get<Interview>(`/interviews/${id}`).then((r) => r.data),

  getQuestions: (id: string) =>
    api.get<Question[]>(`/interviews/${id}/questions`).then((r) => r.data),

  getReport: (id: string) =>
    api.get<InterviewReport>(`/interviews/${id}/report`).then((r) => r.data),
};

// ─── Speech API ───────────────────────────────────────────────────────────────

export const speechApi = {
  transcribe: async (audioBlob: Blob, language = 'en'): Promise<{ transcript: string; duration?: number }> => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('language', language);
    const r = await api.post('/speech/transcribe', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    });
    return r.data;
  },

  synthesize: async (text: string, voiceGender: 'male' | 'female', questionId?: string): Promise<ArrayBuffer> => {
    const r = await api.post(
      '/speech/synthesize',
      { text, voice_gender: voiceGender, question_id: questionId },
      { responseType: 'arraybuffer', timeout: 30000 }
    );
    return r.data;
  },
};

// ─── Dashboard API ────────────────────────────────────────────────────────────

export const dashboardApi = {
  getStats: () => api.get<DashboardStats>('/dashboard/stats').then((r) => r.data),
  getHistory: (page = 1, limit = 20) =>
    api.get<InterviewHistoryItem[]>(`/dashboard/history?page=${page}&limit=${limit}`).then((r) => r.data),
};

export default api;

import { create } from 'zustand';
import type { Interview, Question, AnswerEvaluation, LiveAnswerMode } from '@/types';

interface InterviewState {
  // Interview data
  interview: Interview | null;
  currentQuestion: Question | null;
  questionHistory: Question[];

  // Answer mode — resets to 'voice' after each question submission
  answerMode: LiveAnswerMode;

  // Voice state
  isRecording: boolean;
  isProcessingAudio: boolean;
  transcript: string;
  audioDuration: number;

  // AI speaking state
  isSpeaking: boolean;
  isLoadingQuestion: boolean;

  // Timer
  elapsedSeconds: number;

  // Completion
  isComplete: boolean;
  lastEvaluation: AnswerEvaluation | null;

  // Actions
  setInterview: (interview: Interview) => void;
  setCurrentQuestion: (question: Question) => void;
  setAnswerMode: (mode: LiveAnswerMode) => void;
  resetAnswerMode: () => void; // Always resets to 'voice'
  setRecording: (recording: boolean) => void;
  setProcessingAudio: (processing: boolean) => void;
  setTranscript: (transcript: string) => void;
  setAudioDuration: (duration: number) => void;
  setSpeaking: (speaking: boolean) => void;
  setLoadingQuestion: (loading: boolean) => void;
  setElapsed: (seconds: number) => void;
  setComplete: (complete: boolean) => void;
  setLastEvaluation: (evaluation: AnswerEvaluation | null) => void;
  reset: () => void;
}

const initialState = {
  interview: null,
  currentQuestion: null,
  questionHistory: [],
  answerMode: 'voice' as LiveAnswerMode,
  isRecording: false,
  isProcessingAudio: false,
  transcript: '',
  audioDuration: 0,
  isSpeaking: false,
  isLoadingQuestion: false,
  elapsedSeconds: 0,
  isComplete: false,
  lastEvaluation: null,
};

export const useInterviewStore = create<InterviewState>((set) => ({
  ...initialState,

  setInterview: (interview) => set({ interview }),

  setCurrentQuestion: (question) =>
    set((state) => ({
      currentQuestion: question,
      questionHistory: [...state.questionHistory, question],
      // Preserve the user's chosen answerMode so text mode persists across questions
      answerMode: state.answerMode,
      transcript: '',
      isRecording: false,
      isProcessingAudio: false,
    })),

  setAnswerMode: (mode) => set({ answerMode: mode }),

  // Explicitly reset to voice (called after answer submission)
  resetAnswerMode: () => set({ answerMode: 'voice', transcript: '' }),

  setRecording: (isRecording) => set({ isRecording }),
  setProcessingAudio: (isProcessingAudio) => set({ isProcessingAudio }),
  setTranscript: (transcript) => set({ transcript }),
  setAudioDuration: (audioDuration) => set({ audioDuration }),
  setSpeaking: (isSpeaking) => set({ isSpeaking }),
  setLoadingQuestion: (isLoadingQuestion) => set({ isLoadingQuestion }),
  setElapsed: (elapsedSeconds) => set({ elapsedSeconds }),
  setComplete: (isComplete) => set({ isComplete }),
  setLastEvaluation: (lastEvaluation) => set({ lastEvaluation }),

  reset: () => set(initialState),
}));

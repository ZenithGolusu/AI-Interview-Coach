import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Mic,
  Square,
  Type,
  Send,
  Loader2,
  Volume2,
  VolumeX,
  Sparkles,
  Zap,
  RotateCcw,
  Radio,
  CheckCircle2,
  MessageSquare,
  Clock,
  AlertTriangle,
  XCircle,
  FileCheck,
  LogOut,
  X,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { interviewApi, speechApi } from '@/services/api';
import { useInterviewStore } from '@/stores/interviewStore';
import { useLiveSpeech } from '@/hooks/useLiveSpeech';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function LiveInterview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Local UI states
  const [textAnswer, setTextAnswer] = useState('');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isAutoFlowEnabled, setIsAutoFlowEnabled] = useState(true);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  // Question & response timing trackers
  const questionPresentedAtRef = useRef<number>(Date.now());
  const firstSpokenAtRef = useRef<number | null>(null);
  const isFinishedRef = useRef(false);

  const {
    interview,
    currentQuestion,
    answerMode,
    isProcessingAudio,
    setInterview,
    setCurrentQuestion,
    setAnswerMode,
    resetAnswerMode,
    setProcessingAudio,
    setComplete,
    reset: resetInterviewStore,
  } = useInterviewStore();

  // Forward ref for submitting answer
  const submitAnswerRef = useRef<(text: string) => void>(() => {});

  // Live Speech Recognition with silence detection & live streaming text
  const {
    isListening,
    liveTranscript,
    interimTranscript,
    combinedTranscript,
    audioLevel,
    silenceCountdown,
    startListening,
    stopListening,
    resetTranscript,
  } = useLiveSpeech({
    silenceTimeoutMs: 2000,
    autoSubmitOnSilence: isAutoFlowEnabled,
    onTranscriptComplete: (finalText) => {
      if (finalText && finalText.trim().length > 3) {
        submitAnswerRef.current(finalText.trim());
      }
    },
  });

  // Track the exact moment user starts speaking or typing
  useEffect(() => {
    if (combinedTranscript.trim().length > 0 && !firstSpokenAtRef.current) {
      firstSpokenAtRef.current = Date.now();
    }
  }, [combinedTranscript]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setTextAnswer(val);
    if (val.trim().length > 0 && !firstSpokenAtRef.current) {
      firstSpokenAtRef.current = Date.now();
    }
  };

  // Reset interview session state whenever the interview ID changes
  useEffect(() => {
    isFinishedRef.current = false;
    setTimeRemainingSeconds(null);
    setTextAnswer('');
    setIsEnding(false);
    resetTranscript();
    resetInterviewStore();
  }, [id]);

  // Load Interview and Start initial question (or resume existing on refresh!)
  const {
    data: interviewData,
    isLoading: isStarting,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['interview-start', id],
    queryFn: () => interviewApi.start(id!),
    enabled: !!id,
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });

  // ─── Persistent Countdown Timer ─────────────────────────────────────────────
  useEffect(() => {
    if (!interview || interview.id !== id) return;

    const totalSeconds = (interview.duration_minutes || 20) * 60;
    const startTimeMs = interview.started_at
      ? new Date(interview.started_at).getTime()
      : Date.now();

    const updateTimer = () => {
      if (isFinishedRef.current) return;
      const elapsedSeconds = Math.max(0, (Date.now() - startTimeMs) / 1000);
      const remaining = Math.max(0, Math.floor(totalSeconds - elapsedSeconds));
      setTimeRemainingSeconds(remaining);

      // Auto-end interview when time limit is reached
      if (remaining <= 0 && !isFinishedRef.current) {
        isFinishedRef.current = true;
        toast('⏳ Time limit reached! Generating performance report...', { icon: '⏰' });
        interviewApi.end(interview.id).finally(() => {
          resetInterviewStore();
          navigate(`/report/${interview.id}`);
        });
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [interview, id, navigate, resetInterviewStore]);

  // Format seconds to MM:SS
  const formatTime = (seconds: number | null) => {
    if (seconds === null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Stop all speech & audio playback
  const stopAllAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsAiSpeaking(false);
  }, []);

  // When AI finishes speaking, auto-start listening (hands-free auto-flow mode)
  const onAiFinishedSpeaking = useCallback(() => {
    setIsAiSpeaking(false);
    // Only auto-start mic in voice mode — don't interrupt text mode users
    if (isAutoFlowEnabled && answerMode === 'voice' && !isFinishedRef.current) {
      setTimeout(() => {
        resetTranscript();
        startListening().catch(() => {
          console.warn('Microphone autoplay was not allowed without user interaction');
        });
      }, 350);
    }
  }, [isAutoFlowEnabled, answerMode, resetTranscript, startListening]);

  // Browser Native Speech Fallback
  const playBrowserSpeech = useCallback(
    (text: string, voiceGender: 'male' | 'female') => {
      if (!('speechSynthesis' in window) || isFinishedRef.current) {
        onAiFinishedSpeaking();
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const matchedVoice = voices.find((v) =>
        voiceGender === 'female'
          ? /female|samantha|zira|karen|victoria|moira/i.test(v.name)
          : /male|david|alex|george|daniel/i.test(v.name)
      );
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onend = () => onAiFinishedSpeaking();
      utterance.onerror = () => onAiFinishedSpeaking();

      setIsAiSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [onAiFinishedSpeaking]
  );

  // Play Question Voice Audio
  const playQuestionAudio = useCallback(
    async (text: string, voiceGender: 'male' | 'female') => {
      if (isAudioMuted || isFinishedRef.current) {
        onAiFinishedSpeaking();
        return;
      }

      stopListening();
      setIsAiSpeaking(true);

      try {
        const audioBuffer = await speechApi.synthesize(text, voiceGender);
        if (audioBuffer && audioBuffer.byteLength > 0) {
          const blob = new Blob([audioBuffer], { type: 'audio/wav' });
          const url = URL.createObjectURL(blob);

          if (audioRef.current) {
            audioRef.current.src = url;
            audioRef.current
              .play()
              .then(() => {
                setIsAiSpeaking(true);
              })
              .catch(() => {
                playBrowserSpeech(text, voiceGender);
              });

            audioRef.current.onended = () => {
              onAiFinishedSpeaking();
            };
            audioRef.current.onerror = () => {
              playBrowserSpeech(text, voiceGender);
            };
          }
        } else {
          playBrowserSpeech(text, voiceGender);
        }
      } catch {
        playBrowserSpeech(text, voiceGender);
      }
    },
    [isAudioMuted, onAiFinishedSpeaking, playBrowserSpeech, stopListening]
  );

  // Submit Answer Mutation
  const submitAnswerMutation = useMutation({
    mutationFn: interviewApi.submitAnswer,
    onSuccess: (data) => {
      setTextAnswer('');
      resetTranscript();
      // Only reset back to voice if user was in voice mode — preserve text mode across questions
      if (answerMode !== 'text') {
        resetAnswerMode();
      }
      setProcessingAudio(false);

      if (data.interview_complete) {
        isFinishedRef.current = true;
        setComplete(true);
        stopAllAudio();
        stopListening();
        resetInterviewStore();
        toast.success('🎉 Interview completed! Generating report...');
        navigate(`/report/${id}`);
      } else if (data.question) {
        questionPresentedAtRef.current = Date.now();
        firstSpokenAtRef.current = null;

        setCurrentQuestion(data.question);
        if (!isAudioMuted) {
          playQuestionAudio(
            data.question.text,
            (interview?.voice_gender as 'male' | 'female') || 'female'
          );
        } else {
          onAiFinishedSpeaking();
        }
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to evaluate answer');
      setProcessingAudio(false);
    },
  });

  // Function to submit answer with precise thinking and duration metrics
  submitAnswerRef.current = (textToSubmit: string) => {
    if (!textToSubmit || !textToSubmit.trim() || !currentQuestion || isFinishedRef.current) return;
    stopListening();
    stopAllAudio();
    setProcessingAudio(true);

    const now = Date.now();
    const thinkingTimeSeconds = firstSpokenAtRef.current
      ? Math.max(0.5, (firstSpokenAtRef.current - questionPresentedAtRef.current) / 1000)
      : Math.max(0.5, (now - questionPresentedAtRef.current) / 1000);

    const durationSeconds = firstSpokenAtRef.current
      ? Math.max(1.0, (now - firstSpokenAtRef.current) / 1000)
      : 5.0;

    submitAnswerMutation.mutate({
      interview_id: id!,
      question_id: currentQuestion.id,
      text: textToSubmit.trim(),
      answer_mode: 'voice',
      duration_seconds: durationSeconds,
      thinking_time_seconds: thinkingTimeSeconds,
    });
  };

  // Initial Question Setup (or resumption on refresh)
  useEffect(() => {
    if (interviewData && id && interviewData.interview.id === id) {
      setInterview(interviewData.interview);
      if (interviewData.first_question) {
        questionPresentedAtRef.current = Date.now();
        firstSpokenAtRef.current = null;

        setCurrentQuestion(interviewData.first_question);
        playQuestionAudio(
          interviewData.first_question.text,
          (interviewData.interview.voice_gender as 'male' | 'female') || 'female'
        );
      }
    }
  }, [interviewData, id, playQuestionAudio, setCurrentQuestion, setInterview]);

  // Clean up on component unmount / navigate away
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!isFinishedRef.current && id) {
        // Discard session via keepalive fetch if browser tab is closing or reloading
        const token = localStorage.getItem('access_token');
        fetch(`/api/v1/interviews/${id}/abandon`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          keepalive: true,
        }).catch(() => {});
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      stopAllAudio();
      stopListening();
      if (!isFinishedRef.current && id) {
        interviewApi.abandon(id).catch(() => {});
      }
      resetInterviewStore();
    };
  }, [id, stopAllAudio, stopListening, resetInterviewStore]);

  // Handle End Interview (Complete & get report)
  const handleCompleteEarly = async () => {
    if (!id || isEnding) return;
    try {
      setIsEnding(true);
      isFinishedRef.current = true;
      stopAllAudio();
      stopListening();
      toast.loading('Analyzing answers and building your report...', { id: 'ending-report' });
      await interviewApi.end(id);
      resetInterviewStore();
      toast.success('Interview report ready!', { id: 'ending-report' });
      navigate(`/report/${id}`);
    } catch {
      toast.error('Failed to generate report', { id: 'ending-report' });
      setIsEnding(false);
    }
  };

  // Handle Abandon / Discard Interview
  const handleAbandonInterview = async () => {
    if (!id || isEnding) return;
    try {
      setIsEnding(true);
      isFinishedRef.current = true;
      stopAllAudio();
      stopListening();
      await interviewApi.abandon(id);
      resetInterviewStore();
      toast('Interview abandoned and discarded. It will not affect your score.', { icon: '🗑️' });
      navigate('/dashboard');
    } catch {
      toast.error('Failed to exit interview');
      setIsEnding(false);
    }
  };

  // Handle Manual Mic Click Toggle
  const handleMicToggle = async () => {
    if (isAiSpeaking) {
      stopAllAudio();
      resetTranscript();
      try {
        await startListening();
      } catch {
        toast.error('Microphone access denied. Please allow mic permissions.');
      }
      return;
    }

    if (isListening) {
      stopListening();
      const text = combinedTranscript.trim();
      if (text.length > 0) {
        submitAnswerRef.current(text);
      }
    } else {
      resetTranscript();
      try {
        await startListening();
      } catch {
        toast.error('Microphone access denied. Please allow mic permissions.');
      }
    }
  };

  // Handle Text Submission
  const handleTextSubmit = () => {
    if (!textAnswer.trim() || !currentQuestion || isFinishedRef.current) return;
    stopListening();
    stopAllAudio();
    setProcessingAudio(true);

    const now = Date.now();
    const thinkingTimeSeconds = firstSpokenAtRef.current
      ? Math.max(0.5, (firstSpokenAtRef.current - questionPresentedAtRef.current) / 1000)
      : 2.0;
    const durationSeconds = firstSpokenAtRef.current
      ? Math.max(1.0, (now - firstSpokenAtRef.current) / 1000)
      : 8.0;

    submitAnswerMutation.mutate({
      interview_id: id!,
      question_id: currentQuestion.id,
      text: textAnswer.trim(),
      answer_mode: 'text',
      duration_seconds: durationSeconds,
      thinking_time_seconds: thinkingTimeSeconds,
    });
  };

  // ─── Error state: quota / API failure ─────────────────────────────────────
  const errorDetail = (error as any)?.response?.data?.detail ?? (error as any)?.detail;
  const isQuotaError =
    (error as any)?.response?.status === 429 ||
    (typeof errorDetail === 'object' && errorDetail?.code === 'quota_exceeded') ||
    (typeof errorDetail === 'string' && errorDetail.toLowerCase().includes('quota'));

  if (isError) {
    return (
      <div className="flex flex-col h-full items-center justify-center min-h-[70vh] text-center px-4">
        <div className="w-16 h-16 rounded-2xl bg-surface-800 border border-rose-500/30 flex items-center justify-center mb-5 text-rose-400 shadow-lg shadow-rose-500/10">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-display font-bold text-white mb-2">
          {isQuotaError ? 'Daily AI Quota Reached' : 'Failed to Start Interview'}
        </h2>
        <p className="text-sm text-slate-400 mb-1 max-w-sm leading-relaxed">
          {isQuotaError
            ? 'Your AI API daily credits are exhausted or insufficient for a full session. The quota resets every 24 hours.'
            : 'There was a problem connecting to the AI. Please check your connection and try again.'}
        </p>
        {isQuotaError && (
          <p className="text-xs text-amber-400/80 mb-6 max-w-sm">
            💡 Tip: If you just started a long interview, your remaining credits may not cover a 20–30 min session. Try again tomorrow or upgrade your API plan.
          </p>
        )}
        <div className="flex gap-3 mt-2">
          <Button onClick={() => refetch()} className="bg-brand-600 hover:bg-brand-500 gap-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </Button>
          <Button variant="outline" asChild>
            <Link to="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isStarting || !currentQuestion) {
    return (
      <div className="flex flex-col h-full items-center justify-center min-h-[70vh] text-center px-4">
        <div className="relative mb-6">
          <div className="w-16 h-16 rounded-full border-4 border-brand-500/20 border-t-brand-500 animate-spin" />
          <Sparkles className="w-6 h-6 text-brand-400 absolute inset-0 m-auto animate-pulse" />
        </div>
        <h2 className="text-xl text-white font-display font-medium mb-2">
          Preparing Your Interview Session...
        </h2>
        <p className="text-sm text-slate-400 mb-1">Generating adaptive questions tailored to your profile</p>
        <p className="text-xs text-slate-600 mt-3">This typically takes 5–15 seconds</p>
      </div>
    );
  }

  const isEvaluating = isProcessingAudio || submitAnswerMutation.isPending;

  // Timer warning thresholds
  const isTimeLow = timeRemainingSeconds !== null && timeRemainingSeconds < 300;
  const isTimeCritical = timeRemainingSeconds !== null && timeRemainingSeconds < 60;

  return (
    <div className="flex flex-col min-h-screen bg-surface-950 p-4 lg:p-8 relative selection:bg-brand-500 selection:text-white">
      <audio ref={audioRef} className="hidden" />

      {/* ─── Header Navigation Bar ────────────────────────────────────────────── */}
      <header className="flex justify-between items-center mb-6 bg-surface-900/60 backdrop-blur-xl p-4 rounded-2xl border border-surface-200/10 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-accent-violet flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Radio className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-display font-bold text-white tracking-wide">
                {interview?.target_role}
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                Live Session
              </span>
            </div>
            <p className="text-xs text-slate-400 capitalize">
              {interview?.mode.replace('_', ' ')} • {interview?.difficulty} Level
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* ─── Persistent Live Countdown Timer ────────────────────────────── */}
          <div
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-mono font-bold tracking-wider border transition-all duration-300 ${
              isTimeCritical
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 animate-pulse shadow-lg shadow-rose-500/20'
                : isTimeLow
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                : 'bg-surface-800/90 border-surface-700/80 text-brand-300 shadow-sm'
            }`}
            title="Interview time remaining (persists across page reloads)"
          >
            {isTimeCritical ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-bounce" />
            ) : (
              <Clock className="w-3.5 h-3.5 text-brand-400" />
            )}
            <span>{formatTime(timeRemainingSeconds)}</span>
          </div>

          {/* Hands-free Auto-flow Toggle */}
          <button
            onClick={() => setIsAutoFlowEnabled(!isAutoFlowEnabled)}
            className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border ${
              isAutoFlowEnabled
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-sm shadow-emerald-500/10'
                : 'bg-surface-800 border-surface-700 text-slate-400'
            }`}
            title="When active, AI listens and submits automatically when you finish speaking"
          >
            <Zap className={`w-3.5 h-3.5 ${isAutoFlowEnabled ? 'text-emerald-400 animate-pulse' : ''}`} />
            <span>{isAutoFlowEnabled ? 'Auto-Flow: On' : 'Auto-Flow: Off'}</span>
          </button>

          {/* Replay Question Button */}
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white text-xs gap-1.5"
            onClick={() => {
              if (currentQuestion) {
                playQuestionAudio(
                  currentQuestion.text,
                  (interview?.voice_gender as 'male' | 'female') || 'female'
                );
              }
            }}
            disabled={isAiSpeaking || isEvaluating}
            title="Replay question audio"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Replay</span>
          </Button>

          {/* Mute Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const nextMuted = !isAudioMuted;
              setIsAudioMuted(nextMuted);
              if (nextMuted) {
                stopAllAudio();
              }
            }}
            className="rounded-full hover:bg-surface-800"
          >
            {isAudioMuted ? (
              <VolumeX className="w-4 h-4 text-slate-500" />
            ) : (
              <Volume2 className="w-4 h-4 text-brand-400" />
            )}
          </Button>

          {/* ─── End / Exit Interview Button ──────────────────────────────────── */}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowExitModal(true)}
            className="bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 rounded-full text-xs font-semibold px-3 h-8 gap-1.5 transition-all shadow-sm"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>End Session</span>
          </Button>
        </div>
      </header>

      {/* ─── Main Content Grid ────────────────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center max-w-6xl mx-auto w-full">
        {/* ─── Left Side: AI Interactive Orb & Visualizer ─────────────────── */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center space-y-6">
          <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
            {/* Outer Ripple Wave 1 (AI Speaking) */}
            {isAiSpeaking && (
              <>
                <div
                  className="absolute inset-0 bg-brand-500/20 rounded-full animate-ping pointer-events-none"
                  style={{ animationDuration: '2.4s' }}
                />
                <div
                  className="absolute inset-6 bg-accent-violet/25 rounded-full animate-ping pointer-events-none"
                  style={{ animationDuration: '1.8s', animationDelay: '0.3s' }}
                />
              </>
            )}

            {/* Outer Ripple Wave 2 (Candidate Speaking / Live Audio Reactive) */}
            {isListening && audioLevel > 5 && (
              <div
                className="absolute inset-0 rounded-full bg-emerald-500/20 transition-all duration-75 pointer-events-none"
                style={{
                  transform: `scale(${1 + Math.min(0.35, audioLevel / 200)})`,
                  opacity: Math.min(0.6, audioLevel / 100 + 0.1),
                }}
              />
            )}

            {/* Main Interactive AI Orb */}
            <button
              onClick={handleMicToggle}
              disabled={isEvaluating}
              className={`relative z-10 w-48 h-48 sm:w-56 sm:h-56 rounded-full p-1.5 shadow-2xl transition-all duration-500 flex items-center justify-center cursor-pointer group focus:outline-none ${
                isEvaluating
                  ? 'bg-gradient-to-tr from-amber-500 via-brand-500 to-purple-600 animate-spin glow-brand'
                  : isListening
                  ? 'bg-gradient-to-tr from-emerald-400 via-teal-500 to-cyan-400 shadow-emerald-500/30 shadow-2xl scale-105'
                  : isAiSpeaking
                  ? 'bg-gradient-to-tr from-brand-500 via-accent-violet to-purple-600 glow-brand scale-105 animate-pulse'
                  : 'bg-gradient-to-tr from-surface-700 via-surface-800 to-surface-700 hover:scale-102 hover:border-brand-500/50'
              }`}
            >
              {/* Inner Orb Core */}
              <div className="w-full h-full bg-surface-950 rounded-full flex flex-col items-center justify-center overflow-hidden relative border border-white/10 shadow-inner">
                {/* Background ambient glow inside orb */}
                <div
                  className={`absolute inset-0 transition-opacity duration-500 ${
                    isListening
                      ? 'bg-radial from-emerald-500/25 to-transparent'
                      : isAiSpeaking
                      ? 'bg-radial from-brand-500/30 to-transparent'
                      : 'bg-radial from-brand-500/10 to-transparent'
                  }`}
                />

                {/* Orb Icon and Live Indicator */}
                <div className="relative z-10 flex flex-col items-center">
                  {isEvaluating ? (
                    <>
                      <Loader2 className="w-12 h-12 text-amber-400 animate-spin mb-2" />
                      <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                        Evaluating...
                      </span>
                    </>
                  ) : isListening ? (
                    <>
                      <Mic className="w-12 h-12 text-emerald-400 animate-bounce mb-2" />
                      <span className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">
                        Listening...
                      </span>
                      <span className="text-[10px] text-slate-400 mt-0.5">
                        {silenceCountdown !== null
                          ? `Sending in ${silenceCountdown}s...`
                          : 'Speak naturally'}
                      </span>
                    </>
                  ) : isAiSpeaking ? (
                    <>
                      <Volume2 className="w-12 h-12 text-brand-300 animate-pulse mb-2" />
                      <span className="text-xs font-semibold text-brand-300 uppercase tracking-wider">
                        AI Speaking...
                      </span>
                      <span className="text-[10px] text-slate-400 mt-0.5">Tap to interrupt</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-12 h-12 text-slate-400 group-hover:text-brand-400 transition-colors mb-2" />
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Tap to Speak
                      </span>
                    </>
                  )}
                </div>
              </div>
            </button>
          </div>

          {/* Dynamic Audio Visualizer Waves */}
          <div className="flex items-center justify-center gap-1.5 h-8">
            {[...Array(9)].map((_, i) => {
              const heightMultiplier = isListening
                ? Math.max(4, Math.min(32, (audioLevel / 100) * 32 * (0.5 + Math.sin(i * 0.8) * 0.5)))
                : isAiSpeaking
                ? 12 + Math.sin(i + Date.now() / 200) * 10
                : 4;

              return (
                <div
                  key={i}
                  className={`w-1.5 rounded-full transition-all duration-75 ${
                    isListening
                      ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                      : isAiSpeaking
                      ? 'bg-brand-400 shadow-sm shadow-brand-400/50'
                      : 'bg-surface-800'
                  }`}
                  style={{ height: `${heightMultiplier}px` }}
                />
              );
            })}
          </div>

          {/* Quick Action Button under Orb */}
          {isListening && combinedTranscript.length > 0 && (
            <Button
              size="sm"
              onClick={() => submitAnswerRef.current(combinedTranscript)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs px-5 py-2 rounded-full shadow-lg shadow-emerald-500/20 animate-fade-in flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Done Speaking (Submit Answer)
            </Button>
          )}
        </div>

        {/* ─── Right Side: Question & Live Streaming Transcript ───────────────── */}
        <div className="lg:col-span-7 flex flex-col space-y-6 w-full">
          {/* Question Card */}
          <Card className="border-brand-500/30 bg-surface-900/80 backdrop-blur-xl shadow-xl shadow-brand-500/5 rounded-2xl overflow-hidden">
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Question {currentQuestion.sequence_number}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-surface-800 text-slate-300 font-medium capitalize">
                  {currentQuestion.category || 'Technical'}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-display font-medium text-white leading-relaxed">
                {currentQuestion.text}
              </h2>
            </CardContent>
          </Card>

          {/* Interaction Area */}
          <div className="bg-surface-900/60 backdrop-blur-xl border border-surface-200/10 rounded-2xl p-6 relative overflow-hidden transition-all duration-300">
            {/* Mode Switcher */}
            <div className="flex justify-between items-center mb-4">
              <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                {answerMode === 'voice' ? (
                  <>
                    <Radio className="w-3.5 h-3.5 text-emerald-400" />
                    Live Speech Feed
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-3.5 h-3.5 text-brand-400" />
                    Text Input Mode
                  </>
                )}
              </span>

              <Button
                variant="ghost"
                size="sm"
                className="text-slate-400 hover:text-white text-xs gap-1.5 h-8"
                onClick={() => {
                  stopListening();
                  setAnswerMode(answerMode === 'voice' ? 'text' : 'voice');
                }}
                disabled={isEvaluating}
              >
                {answerMode === 'voice' ? (
                  <>
                    <Type className="w-3.5 h-3.5" /> Type Answer
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5" /> Switch to Voice (Live)
                  </>
                )}
              </Button>
            </div>

            {/* ─── LIVE VOICE STREAMING TRANSCRIPT BOX ───────────────────────── */}
            {answerMode === 'voice' && (
              <div className="flex flex-col space-y-4">
                <div className="min-h-[140px] max-h-[220px] overflow-y-auto rounded-xl border border-surface-700/60 bg-surface-950/70 p-4 relative">
                  {combinedTranscript ? (
                    <div className="text-slate-100 text-base leading-relaxed">
                      <span>{liveTranscript}</span>
                      {interimTranscript && (
                        <span className="text-cyan-400 italic"> {interimTranscript}</span>
                      )}
                      {isListening && (
                        <span className="inline-block w-2 h-4 ml-1 bg-cyan-400 animate-pulse align-middle" />
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full min-h-[100px] text-center text-slate-500">
                      {isListening ? (
                        <>
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping mb-2" />
                          <p className="text-sm text-emerald-300 font-medium">
                            Listening... Speak your answer clearly
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            Your speech will transcribe right here in real time
                          </p>
                        </>
                      ) : isAiSpeaking ? (
                        <>
                          <p className="text-sm text-brand-300 font-medium animate-pulse">
                            AI is speaking the question...
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            Microphone will open automatically when AI finishes
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-slate-400">
                            Tap the microphone orb to start answering
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Voice Status & Countdown Bar */}
                <div className="flex items-center justify-between text-xs px-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isListening
                          ? 'bg-emerald-400 animate-pulse'
                          : isAiSpeaking
                          ? 'bg-brand-400 animate-pulse'
                          : 'bg-slate-600'
                      }`}
                    />
                    <span className="text-slate-400">
                      {isEvaluating
                        ? 'AI is analyzing your answer...'
                        : isListening
                        ? silenceCountdown !== null
                          ? `Silence detected • Auto-submitting in ${silenceCountdown}s...`
                          : 'Listening live...'
                        : isAiSpeaking
                        ? 'AI Interviewer speaking'
                        : 'Ready to speak'}
                    </span>
                  </div>

                  {isListening && combinedTranscript.length > 0 && (
                    <button
                      onClick={() => submitAnswerRef.current(combinedTranscript)}
                      className="text-emerald-400 hover:text-emerald-300 font-semibold underline cursor-pointer"
                    >
                      Submit Now
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ─── TEXT MODE INPUT ───────────────────────────────────────────── */}
            {answerMode === 'text' && (
              <div className="flex flex-col space-y-4">
                <textarea
                  className="w-full h-36 rounded-xl border border-surface-200/10 bg-surface-950 p-4 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none placeholder:text-slate-500"
                  placeholder="Type your detailed interview answer here..."
                  value={textAnswer}
                  onChange={handleTextChange}
                  disabled={isEvaluating}
                />
                <Button
                  className="w-full bg-brand-600 hover:bg-brand-500 text-white font-medium"
                  onClick={handleTextSubmit}
                  disabled={!textAnswer.trim() || isEvaluating}
                >
                  {isEvaluating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Evaluating Answer...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" /> Submit Answer
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── End / Exit Interview Confirmation Modal ──────────────────────────── */}
      {showExitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-surface-900 border border-surface-700/80 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative">
            <button
              onClick={() => setShowExitModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-full hover:bg-surface-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center">
                <LogOut className="w-6 h-6 text-brand-400" />
              </div>
              <div>
                <h3 className="text-xl font-display font-bold text-white">End Interview Session?</h3>
                <p className="text-xs text-slate-400">Choose how you would like to proceed</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed mb-6">
              You can finish your interview early and generate a report based on answers submitted so
              far, or completely discard and abandon this session.
            </p>

            <div className="flex flex-col space-y-3">
              {/* Option 1: Complete & Get Report */}
              <button
                onClick={handleCompleteEarly}
                disabled={isEnding}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-brand-600 hover:bg-brand-500 text-white text-left font-medium transition-all shadow-lg shadow-brand-500/20 group"
              >
                <div className="flex items-center gap-3">
                  <FileCheck className="w-5 h-5 text-brand-200" />
                  <div>
                    <div className="text-sm font-semibold">Finish & Generate Report</div>
                    <div className="text-xs text-brand-100/80 font-normal">
                      Evaluate answers given so far & view your score
                    </div>
                  </div>
                </div>
                {isEnding && <Loader2 className="w-4 h-4 animate-spin" />}
              </button>

              {/* Option 2: Abandon & Discard */}
              <button
                onClick={handleAbandonInterview}
                disabled={isEnding}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-left font-medium transition-all group"
              >
                <div className="flex items-center gap-3">
                  <XCircle className="w-5 h-5 text-rose-400" />
                  <div>
                    <div className="text-sm font-semibold text-rose-300">Abandon & Discard Session</div>
                    <div className="text-xs text-rose-400/80 font-normal">
                      Discard interview. It will NOT affect your score or stats.
                    </div>
                  </div>
                </div>
                {isEnding && <Loader2 className="w-4 h-4 animate-spin" />}
              </button>

              {/* Cancel Button */}
              <Button
                variant="ghost"
                onClick={() => setShowExitModal(false)}
                disabled={isEnding}
                className="w-full text-slate-400 hover:text-white mt-1"
              >
                Resume Interview
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

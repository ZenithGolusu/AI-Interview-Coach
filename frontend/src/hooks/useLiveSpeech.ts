import { useState, useRef, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { speechApi } from '@/services/api';

interface UseLiveSpeechOptions {
  onTranscriptComplete?: (finalText: string) => void;
  silenceTimeoutMs?: number;
  autoSubmitOnSilence?: boolean;
}

interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export function useLiveSpeech(options: UseLiveSpeechOptions = {}) {
  const {
    onTranscriptComplete,
    silenceTimeoutMs = 3500, // 3.5s natural pause threshold
    autoSubmitOnSilence = true,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0); // 0 - 100
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);

  // References
  const recognitionRef = useRef<any>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveAnimRef = useRef<number | null>(null);

  // Fallback MediaRecorder references
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fallbackStreamRef = useRef<MediaStream | null>(null);

  const transcriptBufferRef = useRef<string>('');
  const isListeningRef = useRef(false);
  const hasSpokenRef = useRef(false);
  const restartCountRef = useRef(0);
  const lastRestartTimeRef = useRef(0);
  const onCompleteRef = useRef(onTranscriptComplete);

  useEffect(() => {
    onCompleteRef.current = onTranscriptComplete;
  }, [onTranscriptComplete]);

  // Clean all silence timers
  const clearSilenceTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setSilenceCountdown(null);
  }, []);

  // Submit transcript when silence threshold is reached
  const triggerSilenceSubmit = useCallback(() => {
    clearSilenceTimers();
    const fullText = transcriptBufferRef.current.trim();
    if (fullText.length > 3 && onCompleteRef.current) {
      stopListening();
      onCompleteRef.current(fullText);
    }
  }, [clearSilenceTimers]);

  // Reset silence timer on new speech
  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimers();

    if (!autoSubmitOnSilence || !hasSpokenRef.current) return;
    if (transcriptBufferRef.current.trim().length < 5) return;

    let remainingMs = silenceTimeoutMs;
    setSilenceCountdown(Math.ceil(remainingMs / 1000));

    countdownIntervalRef.current = setInterval(() => {
      remainingMs -= 200;
      if (remainingMs <= 0) {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      } else {
        setSilenceCountdown(Math.max(1, Math.ceil(remainingMs / 1000)));
      }
    }, 200);

    silenceTimerRef.current = setTimeout(() => {
      triggerSilenceSubmit();
    }, silenceTimeoutMs);
  }, [autoSubmitOnSilence, silenceTimeoutMs, clearSilenceTimers, triggerSilenceSubmit]);

  // Simulated visual wave animation while listening (avoids mic contention with AudioContext)
  const startSimulatedWaves = useCallback(() => {
    let tick = 0;
    const animate = () => {
      if (!isListeningRef.current) {
        setAudioLevel(0);
        return;
      }
      tick += 0.15;
      // If user has interim text, show higher energy wave, else gentle idling wave
      const base = hasSpokenRef.current ? 45 : 20;
      const variation = Math.sin(tick) * 20 + Math.cos(tick * 1.5) * 15;
      setAudioLevel(Math.max(10, Math.min(85, Math.round(base + variation))));
      waveAnimRef.current = requestAnimationFrame(animate);
    };
    waveAnimRef.current = requestAnimationFrame(animate);
  }, []);

  const stopSimulatedWaves = useCallback(() => {
    if (waveAnimRef.current) {
      cancelAnimationFrame(waveAnimRef.current);
      waveAnimRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Stop listening helper
  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    clearSilenceTimers();
    stopSimulatedWaves();

    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    // Stop fallback MediaRecorder if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (fallbackStreamRef.current) {
      fallbackStreamRef.current.getTracks().forEach((track) => track.stop());
      fallbackStreamRef.current = null;
    }
  }, [clearSilenceTimers, stopSimulatedWaves]);

  // Start listening
  const startListening = useCallback(async () => {
    if (isListeningRef.current) return;

    // Reset transcripts and buffer
    setLiveTranscript('');
    setInterimTranscript('');
    transcriptBufferRef.current = '';
    hasSpokenRef.current = false;
    clearSilenceTimers();
    restartCountRef.current = 0;

    const win = window as IWindow;
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    // ── Primary Path: Web Speech API (No getUserMedia hardware contention!) ──
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;

        // On mobile iOS Safari, continuous=true can cause premature stops or glitches.
        // We set continuous=true for desktop, but handle onend restarts cleanly for all platforms.
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        recognition.continuous = !isMobile;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        recognition.onresult = (event: any) => {
          let interim = '';
          let newlyFinal = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0]?.transcript || '';
            if (event.results[i].isFinal) {
              newlyFinal += transcript + ' ';
            } else {
              interim += transcript;
            }
          }

          if (newlyFinal.length > 0) {
            transcriptBufferRef.current = (transcriptBufferRef.current + ' ' + newlyFinal).trim();
            setLiveTranscript(transcriptBufferRef.current);
            hasSpokenRef.current = true;
          }

          setInterimTranscript(interim);

          if (interim.length > 0 || newlyFinal.length > 0) {
            hasSpokenRef.current = true;
            resetSilenceTimer();
          }
        };

        recognition.onerror = (event: any) => {
          const err = event.error;
          // Normal harmless errors
          if (err === 'no-speech' || err === 'aborted') {
            return;
          }

          console.warn('Speech recognition warning:', err);

          if (err === 'not-allowed' || err === 'service-not-allowed') {
            stopListening();
            toast.error('Microphone permission denied. Please allow microphone in browser settings.');
            return;
          }

          if (err === 'audio-capture') {
            stopListening();
            toast.error('Microphone capture error. Please check your mic connection.');
            return;
          }
        };

        recognition.onend = () => {
          // Check if we should restart recognition
          if (!isListeningRef.current) return;

          const now = Date.now();
          if (now - lastRestartTimeRef.current < 2000) {
            restartCountRef.current += 1;
          } else {
            restartCountRef.current = 1;
          }
          lastRestartTimeRef.current = now;

          // Prevent rapid spin loops (max 5 restarts in 2 seconds)
          if (restartCountRef.current > 5) {
            console.warn('Speech recognition restarting too rapidly. Pausing.');
            return;
          }

          // Debounced restart (350ms delay keeps mobile browsers happy and prevents stutter)
          if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
          restartTimerRef.current = setTimeout(() => {
            if (isListeningRef.current && recognitionRef.current) {
              try {
                recognition.start();
              } catch (e) {
                // Ignore if already started
              }
            }
          }, 350);
        };

        isListeningRef.current = true;
        setIsListening(true);
        startSimulatedWaves();
        recognition.start();
        return;
      } catch (err: any) {
        console.warn('SpeechRecognition failed to start, falling back to MediaRecorder:', err);
      }
    }

    // ── Fallback Path: MediaRecorder + Whisper API ─────────────────────────────
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      fallbackStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length > 0) {
          const type = mediaRecorder.mimeType || 'audio/webm';
          const audioBlob = new Blob(audioChunksRef.current, { type });
          if (audioBlob.size > 2000) {
            try {
              setIsTranscribingAudio(true);
              const result = await speechApi.transcribe(audioBlob);
              if (result && result.transcript) {
                transcriptBufferRef.current = result.transcript.trim();
                setLiveTranscript(result.transcript.trim());
                if (onCompleteRef.current) {
                  onCompleteRef.current(result.transcript.trim());
                }
              }
            } catch (transcribeErr) {
              console.error('Transcription fallback error:', transcribeErr);
            } finally {
              setIsTranscribingAudio(false);
            }
          }
        }
      };

      mediaRecorder.start(250);
      isListeningRef.current = true;
      setIsListening(true);
      startSimulatedWaves();
    } catch (err: any) {
      isListeningRef.current = false;
      setIsListening(false);
      stopSimulatedWaves();
      console.error('Failed to access microphone for recording:', err);
      toast.error('Could not access microphone. Please check permissions.');
      throw err;
    }
  }, [clearSilenceTimers, resetSilenceTimer, startSimulatedWaves, stopSimulatedWaves, stopListening]);

  const resetTranscript = useCallback(() => {
    setLiveTranscript('');
    setInterimTranscript('');
    transcriptBufferRef.current = '';
    hasSpokenRef.current = false;
    clearSilenceTimers();
  }, [clearSilenceTimers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isListening,
    liveTranscript,
    interimTranscript,
    combinedTranscript: (liveTranscript + (interimTranscript ? ' ' + interimTranscript : '')).trim(),
    audioLevel,
    silenceCountdown,
    isTranscribingAudio,
    startListening,
    stopListening,
    resetTranscript,
  };
}

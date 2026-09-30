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
    silenceTimeoutMs = 3500,
    autoSubmitOnSilence = false,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0); // 0 - 100
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);

  // References
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // MediaRecorder + AudioContext references
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const transcriptBufferRef = useRef<string>('');
  const isListeningRef = useRef(false);
  const hasSpokenRef = useRef(false);
  const onCompleteRef = useRef(onTranscriptComplete);

  useEffect(() => {
    onCompleteRef.current = onTranscriptComplete;
  }, [onTranscriptComplete]);

  // Audio level analyzer using Web Audio API on the stream
  const startAudioMeter = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateMeter = () => {
        if (!analyserRef.current || !isListeningRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const level = Math.min(100, Math.round((average / 128) * 100));
        setAudioLevel(level);

        if (level > 15) {
          hasSpokenRef.current = true;
        }

        animFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();
    } catch (err) {
      console.warn('Audio metering unavailable:', err);
    }
  }, []);

  const stopAudioMeter = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

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

  // Stop listening without auto-submitting
  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    clearSilenceTimers();
    stopAudioMeter();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, [clearSilenceTimers, stopAudioMeter]);

  // Stop listening AND transcribe/submit answer
  const stopListeningAndSubmit = useCallback(async () => {
    if (!isListeningRef.current) return;
    isListeningRef.current = false;
    setIsListening(false);
    clearSilenceTimers();
    stopAudioMeter();

    // 1. If we already have live text from Web Speech API on Desktop
    const currentLiveText = (transcriptBufferRef.current || liveTranscript).trim();
    if (currentLiveText.length > 3) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      if (onCompleteRef.current) {
        onCompleteRef.current(currentLiveText);
      }
      return;
    }

    // 2. Stop SpeechRecognition if active
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }

    // 3. Stop MediaRecorder and transcribe with Groq Whisper
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      const recorder = mediaRecorderRef.current;
      
      const audioPromise = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          const type = recorder.mimeType || (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm');
          const audioBlob = new Blob(audioChunksRef.current, { type });
          resolve(audioBlob);
        };
      });

      try {
        recorder.stop();
        const audioBlob = await audioPromise;

        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }

        if (audioBlob.size > 1000) {
          setIsTranscribingAudio(true);
          const result = await speechApi.transcribe(audioBlob);
          const text = result?.transcript?.trim() || '';

          if (text.length > 0) {
            setLiveTranscript(text);
            transcriptBufferRef.current = text;
            if (onCompleteRef.current) {
              onCompleteRef.current(text);
            }
          } else {
            toast.error('Could not catch your answer. Please tap Speak and try again.');
          }
        }
      } catch (err: any) {
        console.error('Transcription error:', err);
        toast.error('Failed to transcribe audio. Please try again or switch to text mode.');
      } finally {
        setIsTranscribingAudio(false);
      }
    } else {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    }
  }, [clearSilenceTimers, liveTranscript, stopAudioMeter]);

  // Start listening
  const startListening = useCallback(async () => {
    if (isListeningRef.current) return;

    setLiveTranscript('');
    setInterimTranscript('');
    transcriptBufferRef.current = '';
    hasSpokenRef.current = false;
    clearSilenceTimers();
    audioChunksRef.current = [];

    const isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent) || window.innerWidth < 768;

    try {
      // ── Step 1: Open Microphone Stream (Works stably on ALL mobile & desktop browsers) ──
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      mediaStreamRef.current = stream;
      isListeningRef.current = true;
      setIsListening(true);
      startAudioMeter(stream);

      // ── Step 2: Initialize MediaRecorder for steady, non-flickering capture ──
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

      mediaRecorder.start(250);

      // ── Step 3: On Desktop Chrome/Edge ONLY, optionally run Web Speech for live text ──
      const win = window as IWindow;
      const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

      // DO NOT run Web Speech on mobile — it causes Android/iOS status-bar mic cycling
      if (!isMobile && SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognitionRef.current = recognition;
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';

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
            }
          };

          recognition.onerror = () => {
            // Harmless; MediaRecorder handles the actual audio recording reliably
          };

          recognition.onend = () => {
            // Never loop-restart automatically
          };

          recognition.start();
        } catch {
          // If desktop SpeechRecognition fails to start, MediaRecorder + Whisper handles it
        }
      }

      // ── Step 4: Silence detector (only if autoSubmitOnSilence is enabled) ──
      if (autoSubmitOnSilence) {
        let silentSeconds = 0;
        const silenceInterval = setInterval(() => {
          if (!isListeningRef.current) {
            clearInterval(silenceInterval);
            return;
          }
          if (hasSpokenRef.current) {
            if (audioLevel < 10) {
              silentSeconds += 0.5;
              const remaining = Math.max(0, Math.ceil((silenceTimeoutMs / 1000) - silentSeconds));
              setSilenceCountdown(remaining);
              if (silentSeconds * 1000 >= silenceTimeoutMs) {
                clearInterval(silenceInterval);
                stopListeningAndSubmit();
              }
            } else {
              silentSeconds = 0;
              setSilenceCountdown(null);
            }
          }
        }, 500);
      }
    } catch (err: any) {
      isListeningRef.current = false;
      setIsListening(false);
      stopAudioMeter();
      console.error('Failed to open microphone:', err);
      toast.error('Microphone permission denied. Please allow mic in browser settings.');
      throw err;
    }
  }, [audioLevel, autoSubmitOnSilence, clearSilenceTimers, silenceTimeoutMs, startAudioMeter, stopAudioMeter, stopListeningAndSubmit]);

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
    stopListeningAndSubmit,
    resetTranscript,
  };
}

import { useState, useRef, useEffect, useCallback } from 'react';

interface UseLiveSpeechOptions {
  onTranscriptComplete?: (finalText: string) => void;
  silenceTimeoutMs?: number;
  autoSubmitOnSilence?: boolean;
}

// Extend Window interface for Web Speech API
interface IWindow extends Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}

export function useLiveSpeech(options: UseLiveSpeechOptions = {}) {
  const {
    onTranscriptComplete,
    silenceTimeoutMs = 1800,
    autoSubmitOnSilence = true,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0); // 0 - 100 volume level
  const [silenceCountdown, setSilenceCountdown] = useState<number | null>(null);

  // References
  const recognitionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptBufferRef = useRef<string>('');
  const isListeningRef = useRef(false);
  const hasSpokenRef = useRef(false);
  const onCompleteRef = useRef(onTranscriptComplete);

  useEffect(() => {
    onCompleteRef.current = onTranscriptComplete;
  }, [onTranscriptComplete]);

  // Audio level analyzer using Web Audio API
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
        // Normalize to 0-100 scale
        const level = Math.min(100, Math.round((average / 128) * 100));
        setAudioLevel(level);

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
    setAudioLevel(0);
  }, []);

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

  // Trigger submission when silence threshold is reached
  const triggerSilenceSubmit = useCallback(() => {
    clearSilenceTimers();
    const fullText = transcriptBufferRef.current.trim();
    if (fullText.length > 0 && onCompleteRef.current) {
      stopListening();
      onCompleteRef.current(fullText);
    }
  }, [clearSilenceTimers]);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimers();

    if (!autoSubmitOnSilence || !hasSpokenRef.current) return;

    // Start a 1.8s countdown
    let remainingMs = silenceTimeoutMs;
    setSilenceCountdown(Math.ceil(remainingMs / 1000));

    countdownIntervalRef.current = setInterval(() => {
      remainingMs -= 200;
      if (remainingMs <= 0) {
        clearInterval(countdownIntervalRef.current!);
        countdownIntervalRef.current = null;
      } else {
        setSilenceCountdown(Math.max(1, Math.ceil(remainingMs / 1000)));
      }
    }, 200);

    silenceTimerRef.current = setTimeout(() => {
      triggerSilenceSubmit();
    }, silenceTimeoutMs);
  }, [autoSubmitOnSilence, silenceTimeoutMs, clearSilenceTimers, triggerSilenceSubmit]);

  const startListening = useCallback(async () => {
    if (isListeningRef.current) return;

    // Reset transcripts and buffer
    setLiveTranscript('');
    setInterimTranscript('');
    transcriptBufferRef.current = '';
    hasSpokenRef.current = false;
    clearSilenceTimers();

    try {
      // 1. Get Microphone stream for volume metering
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      isListeningRef.current = true;
      setIsListening(true);
      startAudioMeter(stream);

      // 2. Initialize Speech Recognition
      const win = window as IWindow;
      const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition;

      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let interim = '';
          let final = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              final += transcript + ' ';
            } else {
              interim += transcript;
            }
          }

          if (final.length > 0) {
            transcriptBufferRef.current = (transcriptBufferRef.current + ' ' + final).trim();
            setLiveTranscript(transcriptBufferRef.current);
            hasSpokenRef.current = true;
          }

          setInterimTranscript(interim);

          if (interim.length > 0 || final.length > 0) {
            hasSpokenRef.current = true;
            // Reset silence countdown every time new speech is heard
            resetSilenceTimer();
          }
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition error:', event.error);
          if (event.error === 'no-speech') {
            // Keep listening if no speech yet
            return;
          }
        };

        recognition.onend = () => {
          // If still marked as listening (e.g. continuous recognition auto-restart)
          if (isListeningRef.current) {
            try {
              recognition.start();
            } catch {
              // ignore if already started
            }
          }
        };

        recognition.start();
      }
    } catch (error) {
      console.error('Failed to start speech listening:', error);
      setIsListening(false);
      isListeningRef.current = false;
      throw error;
    }
  }, [startAudioMeter, resetSilenceTimer, clearSilenceTimers]);

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    clearSilenceTimers();
    stopAudioMeter();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, [clearSilenceTimers, stopAudioMeter]);

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
    startListening,
    stopListening,
    resetTranscript,
  };
}

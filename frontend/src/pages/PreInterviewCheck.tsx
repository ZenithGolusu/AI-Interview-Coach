import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Mic,
  MicOff,
  Wifi,
  Maximize,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ChevronRight,
  Shield,
  Clock,
  MessageSquare,
  Volume2,
  BookOpen,
  RefreshCw,
  Minimize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/* ─── Types ─────────────────────────────────────────────────── */

type CheckStatus = 'idle' | 'checking' | 'passed' | 'failed' | 'skipped';

interface CheckItem {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  errorMsg?: string;
  required: boolean;
}

/* ─── Helpers ────────────────────────────────────────────────── */

async function checkMicrophone(): Promise<{ ok: boolean; error?: string }> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true };
  } catch (e: any) {
    if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
      return { ok: false, error: 'Microphone permission denied. Allow mic access in your browser settings.' };
    }
    if (e.name === 'NotFoundError') {
      return { ok: false, error: 'No microphone found. Please connect a microphone and try again.' };
    }
    return { ok: false, error: `Microphone error: ${e.message}` };
  }
}

async function checkNetwork(): Promise<{ ok: boolean; speedMbps: number; error?: string }> {
  try {
    const startTime = Date.now();
    const response = await fetch(
      `https://httpbin.org/bytes/102400?_=${Date.now()}`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) }
    );
    await response.blob();
    const durationMs = Date.now() - startTime;
    const speedMbps = (102400 * 8) / (durationMs / 1000) / 1_000_000;
    const ok = speedMbps >= 0.5;
    return {
      ok,
      speedMbps,
      error: ok ? undefined : `Network too slow (${speedMbps.toFixed(2)} Mbps). Minimum 0.5 Mbps required.`,
    };
  } catch {
    if (navigator.onLine) {
      return { ok: true, speedMbps: 1 };
    }
    return { ok: false, speedMbps: 0, error: 'No internet connection detected.' };
  }
}

function requestFullscreen(): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const el = document.documentElement;
    if (document.fullscreenElement) {
      resolve({ ok: true });
      return;
    }
    el.requestFullscreen?.()
      .then(() => resolve({ ok: true }))
      .catch(() =>
        resolve({ ok: false, error: 'Full-screen was blocked. You can still proceed; we recommend full-screen for best experience.' })
      );
  });
}

const INITIAL_CHECKS: CheckItem[] = [
  {
    id: 'mic',
    label: 'Microphone Access',
    description: 'Required for voice answers',
    status: 'idle',
    required: true,
  },
  {
    id: 'network',
    label: 'Network Speed',
    description: 'Stable internet needed for AI responses',
    status: 'idle',
    required: false,
  },
  {
    id: 'fullscreen',
    label: 'Full-Screen Mode',
    description: 'Recommended for a distraction-free interview',
    status: 'idle',
    required: false,
  },
];

export default function PreInterviewCheck() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [checks, setChecks] = useState<CheckItem[]>(INITIAL_CHECKS);
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [networkSpeed, setNetworkSpeed] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const setCheck = useCallback((checkId: string, patch: Partial<CheckItem>) => {
    setChecks((prev) => prev.map((c) => (c.id === checkId ? { ...c, ...patch } : c)));
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      if (hasRun) {
        setCheck('fullscreen', {
          status: isFs ? 'passed' : 'failed',
          errorMsg: isFs ? undefined : 'Full-screen mode exited.'
        });
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [setCheck, hasRun]);

  useEffect(() => {
    let permissionStatus: PermissionStatus | null = null;
    const watchMic = async () => {
      try {
        permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        permissionStatus.onchange = async () => {
          if (permissionStatus?.state === 'granted') {
            setCheck('mic', { status: 'checking' });
            const mic = await checkMicrophone();
            setCheck('mic', { status: mic.ok ? 'passed' : 'failed', errorMsg: mic.error });
          } else if (permissionStatus?.state === 'denied') {
            setCheck('mic', { status: 'failed', errorMsg: 'Microphone permission denied.' });
          }
        };
      } catch (e) {
        // ignore if browser doesn't support permissions API
      }
    };
    watchMic();
    return () => {
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, [setCheck]);

  const runChecks = useCallback(async () => {
    setIsRunning(true);
    setHasRun(false);
    setChecks(INITIAL_CHECKS.map((c) => ({ ...c, status: 'idle' as CheckStatus })));

    setCheck('mic', { status: 'checking' });
    const mic = await checkMicrophone();
    setCheck('mic', { status: mic.ok ? 'passed' : 'failed', errorMsg: mic.error });

    setCheck('network', { status: 'checking' });
    const net = await checkNetwork();
    setNetworkSpeed(net.speedMbps);
    setCheck('network', { status: net.ok ? 'passed' : 'failed', errorMsg: net.error });

    setCheck('fullscreen', { status: 'checking' });
    const fs = await requestFullscreen();
    setIsFullscreen(!!document.fullscreenElement);
    setCheck('fullscreen', { status: !!document.fullscreenElement ? 'passed' : 'failed', errorMsg: !!document.fullscreenElement ? undefined : 'Not in full-screen mode' });

    setIsRunning(false);
    setHasRun(true);
  }, [setCheck]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  const requiredChecksFailed = checks.some((c) => c.required && c.status === 'failed');
  const allDone = checks.every((c) => c.status !== 'idle' && c.status !== 'checking');
  const canStart = allDone && !requiredChecksFailed && agreed && !isRunning;

  const handleStart = () => {
    if (!id) return;
    navigate(`/interview/${id}`);
  };

  const StatusIcon = ({ status }: { status: CheckStatus }) => {
    if (status === 'checking') return <Loader2 className="w-5 h-5 text-brand-400 animate-spin" />;
    if (status === 'passed') return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    if (status === 'failed') return <XCircle className="w-5 h-5 text-rose-400" />;
    if (status === 'skipped') return <AlertTriangle className="w-5 h-5 text-amber-400" />;
    return <div className="w-5 h-5 rounded-full border-2 border-surface-600" />;
  };

  const rowIconColor = (status: CheckStatus) => {
    if (status === 'passed') return 'text-emerald-400';
    if (status === 'failed') return 'text-rose-400';
    if (status === 'skipped') return 'text-amber-400';
    if (status === 'checking') return 'text-brand-400';
    return 'text-slate-500';
  };

  const rowBg = (status: CheckStatus) => {
    if (status === 'passed') return 'border-emerald-500/30 bg-emerald-500/5';
    if (status === 'failed') return 'border-rose-500/30 bg-rose-500/5';
    if (status === 'skipped') return 'border-amber-500/30 bg-amber-500/5';
    if (status === 'checking') return 'border-brand-500/30 bg-brand-500/5';
    return 'border-surface-700/50 bg-surface-900/30';
  };

  const instructions = [
    { icon: <Volume2 className="w-4 h-4" />, color: 'text-brand-400', bg: 'bg-brand-500/10 border-brand-500/20', title: 'Voice Answers', desc: 'Click the microphone orb to speak. Silence detection auto-submits your answer. Switch to text mode anytime.' },
    { icon: <MessageSquare className="w-4 h-4" />, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20', title: 'Text Answers', desc: 'Click "Type Answer" to switch modes. Your mode preference is preserved across all questions.' },
    { icon: <Clock className="w-4 h-4" />, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', title: 'Time Limit', desc: 'A countdown timer runs throughout. Answer all questions before time runs out — shown in the header.' },
    { icon: <Shield className="w-4 h-4" />, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', title: 'Honest Answers', desc: 'Answer as you would in a real interview. The AI evaluates depth, accuracy, clarity and communication skills.' },
    { icon: <RefreshCw className="w-4 h-4" />, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20', title: 'Adaptive AI', desc: 'Questions adapt to your performance. Strong answers lead to harder questions; weaker ones get follow-ups.' },
    { icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-pink-400', bg: 'bg-pink-500/10 border-pink-500/20', title: 'Detailed Report', desc: 'A full performance report with scores, strengths, weak areas, and a personalized study plan is generated.' },
  ];

  return (
    <div className="min-h-screen bg-surface-950 flex items-start justify-center p-4 sm:p-8 pb-16">
      <div className="w-full max-w-3xl space-y-6">

        {/* Header */}
        <div className="text-center pt-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500/20 to-accent-violet/20 border border-brand-500/30 mb-4 shadow-lg shadow-brand-500/10">
            <Shield className="w-8 h-8 text-brand-400" />
          </div>
          <h1 className="text-3xl font-display font-bold text-white mb-2">Pre-Interview Check</h1>
          <p className="text-slate-400 max-w-md mx-auto text-sm">
            Before we begin, let's verify your setup is ready for a smooth interview experience.
          </p>
        </div>

        {/* System Checks */}
        <div className="bg-surface-900/60 backdrop-blur-xl border border-surface-700/60 rounded-2xl p-6 space-y-3 shadow-xl">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Wifi className="w-4 h-4 text-brand-400" />
              System Requirements
            </h2>
            {hasRun && (
              <button
                onClick={runChecks}
                disabled={isRunning}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
                Re-run checks
              </button>
            )}
          </div>

          {checks.map((check) => (
            <div key={check.id} className={`flex items-start gap-4 p-4 rounded-xl border transition-all duration-300 ${rowBg(check.status)}`}>
              {/* Row icon */}
              <div className={`mt-0.5 flex-shrink-0 ${rowIconColor(check.status)}`}>
                {check.id === 'mic' && <Mic className="w-5 h-5" />}
                {check.id === 'network' && <Wifi className="w-5 h-5" />}
                {check.id === 'fullscreen' && (isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize className="w-5 h-5" />)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-sm font-semibold text-slate-100">{check.label}</span>
                  {check.required ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/20 font-medium">Required</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-800 text-slate-500 border border-surface-700 font-medium">Recommended</span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {check.status === 'checking' ? 'Checking...' : check.description}
                </p>
                {check.id === 'network' && check.status === 'passed' && networkSpeed !== null && (
                  <p className="text-xs text-emerald-400 mt-1">✓ Speed: {networkSpeed.toFixed(1)} Mbps</p>
                )}
                {check.id === 'fullscreen' && check.status === 'skipped' && !isFullscreen && (
                  <button onClick={() => document.documentElement.requestFullscreen?.()} className="text-xs text-amber-400 underline mt-1 hover:text-amber-300">
                    Click here to enter full-screen
                  </button>
                )}
                {check.status === 'failed' && check.errorMsg && (
                  <p className="text-xs text-rose-400 mt-1">{check.errorMsg}</p>
                )}
                {check.status === 'skipped' && check.errorMsg && (
                  <p className="text-xs text-amber-400/80 mt-1">{check.errorMsg}</p>
                )}
              </div>

              <div className="flex-shrink-0 mt-0.5">
                <StatusIcon status={check.status} />
              </div>
            </div>
          ))}

          {/* Mic blocked banner */}
          {hasRun && requiredChecksFailed && (
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 mt-2">
              <MicOff className="w-5 h-5 text-rose-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-rose-300">Microphone access required</p>
                <p className="text-xs text-rose-400/80 mt-0.5">
                  Go to browser settings → Site permissions → Microphone → Allow for this site, then click Re-run checks.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-surface-900/60 backdrop-blur-xl border border-surface-700/60 rounded-2xl p-6 shadow-xl">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-4">
            <BookOpen className="w-4 h-4 text-brand-400" />
            Interview Instructions
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {instructions.map((item, i) => (
              <div key={i} className={`flex items-start gap-3 p-3.5 rounded-xl border ${item.bg}`}>
                <div className={`mt-0.5 flex-shrink-0 ${item.color}`}>{item.icon}</div>
                <div>
                  <p className={`text-sm font-semibold mb-0.5 ${item.color}`}>{item.title}</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-3.5 rounded-xl bg-surface-800/60 border border-surface-700/40">
            <p className="text-xs text-slate-400 leading-relaxed">
              <span className="text-slate-200 font-medium">💡 Pro tips: </span>
              Find a quiet place, speak clearly at a natural pace, take a few seconds to gather your thoughts, and structure behavioral answers using Situation → Action → Result.
            </p>
          </div>
        </div>

        {/* Agreement + Start */}
        <div className="bg-surface-900/60 backdrop-blur-xl border border-surface-700/60 rounded-2xl p-6 shadow-xl">
          <label className="flex items-start gap-3 cursor-pointer group mb-5 select-none">
            <div className="relative mt-0.5 flex-shrink-0">
              <input
                id="agree-checkbox"
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="peer sr-only"
              />
              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${agreed ? 'bg-brand-500 border-brand-500 shadow-lg shadow-brand-500/30' : 'border-surface-600 bg-surface-800 group-hover:border-brand-500/50'}`}>
                {agreed && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-sm text-slate-300 leading-relaxed">
              I have read and understood all instructions above. I confirm that I am in a suitable environment,
              my microphone is working, and I am ready to begin. I agree to answer all questions honestly and
              to the best of my ability.
            </span>
          </label>

          {hasRun && (
            <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
              {!requiredChecksFailed ? (
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> System ready
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-rose-400">
                  <XCircle className="w-3.5 h-3.5" /> Fix microphone access first
                </span>
              )}
              <span className="text-surface-700">|</span>
              {agreed ? (
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Agreement confirmed
                </span>
              ) : (
                <span className="text-amber-400">☑ Check the box above to continue</span>
              )}
            </div>
          )}

          <Button
            id="start-interview-btn"
            onClick={handleStart}
            disabled={!canStart}
            size="lg"
            className={`w-full h-14 text-base font-bold rounded-xl transition-all duration-300 ${
              canStart
                ? 'bg-gradient-to-r from-brand-600 to-accent-violet hover:from-brand-500 hover:to-purple-500 shadow-lg shadow-brand-500/25 hover:shadow-brand-500/40 hover:scale-[1.01]'
                : 'bg-surface-800 border border-surface-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isRunning ? (
              <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Running system checks...</>
            ) : (
              <>Begin Interview <ChevronRight className="w-5 h-5 ml-2" /></>
            )}
          </Button>

          {!canStart && !isRunning && hasRun && (
            <p className="text-center text-xs text-slate-500 mt-3">
              {requiredChecksFailed ? '🎙️ Grant microphone access to unlock the Start button' : '☑️ Check the agreement box above to continue'}
            </p>
          )}
        </div>

      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import {
  Trophy, Target, Clock, MessageSquare, TrendingUp,
  BrainCircuit, AlertCircle, Play, FileText, RefreshCw,
  CheckCircle2, Zap, Shield, Layers, X, ArrowRight, History,
} from 'lucide-react';

import { dashboardApi } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import type { DashboardStats, CategoryAnalysis } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, {
  color: string; barBg: string; bg: string; border: string; gradFrom: string; gradTo: string; icon: React.ReactNode;
}> = {
  technical:     { color: 'text-blue-400',    barBg: 'bg-blue-500',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    gradFrom: 'from-blue-600/20',    gradTo: 'to-blue-900/5',    icon: <Shield    className="w-5 h-5" /> },
  communication: { color: 'text-violet-400',  barBg: 'bg-violet-500',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  gradFrom: 'from-violet-600/20',  gradTo: 'to-violet-900/5',  icon: <MessageSquare className="w-5 h-5" /> },
  clarity:       { color: 'text-teal-400',    barBg: 'bg-teal-500',    bg: 'bg-teal-500/10',    border: 'border-teal-500/20',    gradFrom: 'from-teal-600/20',    gradTo: 'to-teal-900/5',    icon: <Zap      className="w-5 h-5" /> },
  relevance:     { color: 'text-amber-400',   barBg: 'bg-amber-500',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   gradFrom: 'from-amber-600/20',   gradTo: 'to-amber-900/5',   icon: <Target   className="w-5 h-5" /> },
  completeness:  { color: 'text-emerald-400', barBg: 'bg-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', gradFrom: 'from-emerald-600/20', gradTo: 'to-emerald-900/5', icon: <Layers   className="w-5 h-5" /> },
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  exceptional: { label: 'Exceptional', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  proficient:  { label: 'Proficient',  cls: 'bg-amber-500/15   text-amber-400   border-amber-500/30' },
  needs_focus: { label: 'Needs Focus', cls: 'bg-rose-500/15    text-rose-400    border-rose-500/30' },
};

// ─── Category Modal ───────────────────────────────────────────────────────────

function CategoryModal({ cat, onClose }: { cat: CategoryAnalysis; onClose: () => void }) {
  const meta  = CATEGORY_META[cat.category] ?? CATEGORY_META.technical;
  const badge = STATUS_BADGE[cat.status]    ?? STATUS_BADGE.needs_focus;
  const pct   = Math.min(100, (cat.average_score / 10) * 100);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className={`relative w-full max-w-lg bg-surface-900 border ${meta.border} rounded-2xl shadow-2xl overflow-hidden animate-scale-in`}
        onClick={e => e.stopPropagation()}
      >
        {/* Gradient top stripe */}
        <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${meta.gradFrom.replace('/20', '')} ${meta.gradTo.replace('/5', '')}`} />

        {/* Header */}
        <div className={`flex items-center justify-between p-6 bg-gradient-to-br ${meta.gradFrom} ${meta.gradTo}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${meta.bg} ${meta.border} border ${meta.color}`}>
              {meta.icon}
            </div>
            <div>
              <h2 className="text-lg font-display font-bold text-white">{cat.label}</h2>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wider ${badge.cls}`}>
                {badge.label}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Score bar */}
          <div>
            <div className="flex items-end justify-between mb-2">
              <span className={`text-4xl font-bold font-display ${meta.color}`}>
                {cat.average_score > 0 ? cat.average_score.toFixed(1) : '—'}
              </span>
              <span className="text-sm text-slate-500 pb-1">out of 10</span>
            </div>
            <div className="h-2 w-full bg-surface-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${meta.barBg}`}
                style={{ width: cat.average_score > 0 ? `${pct}%` : '0%' }}
              />
            </div>
            <p className="text-sm text-slate-400 mt-3 leading-relaxed">{cat.description}</p>
          </div>

          {/* Strengths */}
          {cat.strengths.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> What's Working
              </h4>
              <ul className="space-y-1.5">
                {cat.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300 bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-3 py-2">
                    <span className="text-emerald-400 mt-0.5 shrink-0">✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Improvements */}
          {cat.improvements.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> Where to Improve
              </h4>
              <ul className="space-y-1.5">
                {cat.improvements.map((imp, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300 bg-rose-500/5 border border-rose-500/10 rounded-lg px-3 py-2">
                    <span className="text-rose-400 mt-0.5 shrink-0">•</span>
                    <span>{imp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {cat.recommendations.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" /> Recommendations
              </h4>
              <ul className="space-y-1.5">
                {cat.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-300 bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2">
                    <span className="text-amber-400 mt-0.5 shrink-0">→</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* No data */}
          {cat.average_score === 0 && (
            <p className="text-sm text-slate-500 italic text-center py-4">
              Complete more interviews to generate feedback for this category.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Category Card (click to open modal) ─────────────────────────────────────

function CategoryCard({ cat, onClick }: { cat: CategoryAnalysis; onClick: () => void }) {
  const meta  = CATEGORY_META[cat.category] ?? CATEGORY_META.technical;
  const badge = STATUS_BADGE[cat.status]    ?? STATUS_BADGE.needs_focus;
  const pct   = Math.min(100, (cat.average_score / 10) * 100);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl border ${meta.border} bg-surface-900/70 hover:bg-surface-900 p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg cursor-pointer group`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg ${meta.bg} ${meta.border} border ${meta.color}`}>
            {meta.icon}
          </div>
          <span className="font-semibold text-slate-200 text-sm">{cat.label}</span>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wider ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {/* Score + bar */}
      <div>
        <div className="flex items-end justify-between mb-1.5">
          <span className={`text-2xl font-bold font-display ${meta.color}`}>
            {cat.average_score > 0 ? cat.average_score.toFixed(1) : '—'}
          </span>
          <span className="text-xs text-slate-500">/10</span>
        </div>
        <div className="h-1.5 w-full bg-surface-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${meta.barBg}`}
            style={{ width: cat.average_score > 0 ? `${pct}%` : '0%' }}
          />
        </div>
      </div>

      {/* Tap hint */}
      <p className={`mt-3 text-[11px] ${meta.color} opacity-0 group-hover:opacity-80 transition-opacity flex items-center gap-1`}>
        Click for detailed feedback <ArrowRight className="w-3 h-3" />
      </p>
    </button>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuthStore();
  const [activeModal, setActiveModal] = useState<CategoryAnalysis | null>(null);

  const { data: stats, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardApi.getStats,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 rounded-full border-2 border-brand-500 border-t-transparent animate-spin mb-4" />
          <div className="h-4 w-32 bg-surface-800 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  const safeStats: DashboardStats = stats || {
    total_interviews: 0, completed_interviews: 0, average_score: 0,
    total_voice_answers: 0, total_text_answers: 0,
    strongest_topics: [], weakest_topics: [],
    recent_interviews: [], score_trend: [],
    category_averages: { technical: 0, communication: 0, clarity: 0, relevance: 0, completeness: 0 },
    category_analysis: [],
  };

  const {
    score_trend, strongest_topics, weakest_topics,
    recent_interviews, category_analysis, category_averages,
    completed_interviews,
  } = safeStats;

  const avgScore      = safeStats.average_score;
  const practiceHours = Math.floor((completed_interviews * 20) / 60);
  const practiceMins  = (completed_interviews * 20) % 60;
  const avgScoreFmt   = avgScore > 0
    ? (avgScore <= 10 ? `${avgScore.toFixed(1)}/10` : `${Math.round(avgScore)}/100`)
    : '0/10';

  const maxScore   = Math.max(...score_trend.map(p => p.overall_score || 0), 0);
  const yDomainMax = maxScore > 10 ? 100 : 10;

  const radarData = [
    { subject: 'Technical',     score: category_averages.technical },
    { subject: 'Communication', score: category_averages.communication },
    { subject: 'Clarity',       score: category_averages.clarity },
    { subject: 'Relevance',     score: category_averages.relevance },
    { subject: 'Completeness',  score: category_averages.completeness },
  ];
  const hasRadarData = radarData.some(d => d.score > 0);
  const userName = user?.full_name?.trim()?.split(' ')[0] || 'there';

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-8">

      {/* Modal */}
      {activeModal && (
        <CategoryModal cat={activeModal} onClose={() => setActiveModal(null)} />
      )}

      {/* Error notice */}
      {isError && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
            <span>Could not connect to the backend — showing cached data.</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()}
            className="border-amber-500/30 text-amber-300 hover:bg-amber-500/20 gap-1.5 self-start sm:self-auto cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </Button>
        </div>
      )}

      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-white mb-2">
            Welcome back, {userName}! 👋
          </h1>
          <p className="text-slate-400">Your interview performance overview — all interviews combined.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link to="/documents"><FileText className="w-4 h-4 mr-2" />Manage Documents</Link>
          </Button>
          <Button asChild>
            <Link to="/setup"><Play className="w-4 h-4 mr-2 fill-current" />New Interview</Link>
          </Button>
        </div>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Average Score"    value={avgScoreFmt}                   icon={<Trophy        className="w-5 h-5 text-amber-400"   />} trend={completed_interviews > 0 ? 5 : undefined} />
        <MetricCard title="Total Interviews" value={completed_interviews}           icon={<Target        className="w-5 h-5 text-brand-400"   />} />
        <MetricCard title="Voice Answers"    value={safeStats.total_voice_answers}  icon={<MessageSquare className="w-5 h-5 text-violet-400" />} />
        <MetricCard title="Practice Time"    value={`${practiceHours}h ${practiceMins}m`} icon={<Clock  className="w-5 h-5 text-teal-400"   />} />
      </div>

      {/* Score Trend + Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-surface-200/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-brand-400" /> Overall Score Trend
            </CardTitle>
            <CardDescription>Your overall score across completed interviews, chronologically.</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ height: 300 }}>
              {score_trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={score_trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} domain={[0, yDomainMax]} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                    <Line type="monotone" dataKey="overall_score" name="Score" stroke="#6080ff" strokeWidth={3}
                      dot={{ r: 4, fill: '#6080ff', strokeWidth: 0 }}
                      activeDot={{ r: 6, fill: '#8b5cf6', stroke: '#fff', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500">
                  <TrendingUp className="w-12 h-12 mb-2 opacity-20" />
                  <p className="text-sm">Complete more interviews to see your trend.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-surface-200/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BrainCircuit className="w-5 h-5 text-violet-400" /> Skill Radar
            </CardTitle>
            <CardDescription>Average scores across all 5 skill categories.</CardDescription>
          </CardHeader>
          <CardContent>
            <div style={{ height: 250 }}>
              {hasRadarData ? (
                <ResponsiveContainer width="100%" height={250}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.07)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fill: '#64748b', fontSize: 9 }} tickCount={3} />
                    <Radar name="Score" dataKey="score" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} strokeWidth={2} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500">
                  <BrainCircuit className="w-10 h-10 mb-2 opacity-20" />
                  <p className="text-xs">No data yet</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Analytics */}
      <div>
        <div className="mb-4">
          <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-violet-400" /> Performance Analytics by Category
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Aggregated scores across all completed interviews. Click any card for detailed feedback.
          </p>
        </div>

        {category_analysis.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {category_analysis.map(cat => (
              <CategoryCard key={cat.category} cat={cat} onClick={() => setActiveModal(cat)} />
            ))}
          </div>
        ) : (
          <Card className="border-surface-200/10">
            <CardContent className="py-10 text-center text-slate-500">
              <BrainCircuit className="w-10 h-10 mb-3 opacity-20 mx-auto" />
              <p className="text-sm">Complete at least one interview to see your category analytics.</p>
              <Button asChild className="mt-4"><Link to="/setup">Start an Interview</Link></Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Strong / Weak Topics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-surface-200/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-emerald-400" /> Strongest Topics
            </CardTitle>
          </CardHeader>
          <CardContent>
            {strongest_topics.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {strongest_topics.map(t => (
                  <span key={t} className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">{t}</span>
                ))}
              </div>
            ) : <p className="text-xs text-slate-500">No data available yet.</p>}
          </CardContent>
        </Card>

        <Card className="border-surface-200/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400" /> Needs Improvement
            </CardTitle>
          </CardHeader>
          <CardContent>
            {weakest_topics.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {weakest_topics.map(t => (
                  <span key={t} className="px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-400 text-xs font-medium border border-rose-500/20">{t}</span>
                ))}
              </div>
            ) : <p className="text-xs text-slate-500">No data available yet.</p>}
          </CardContent>
        </Card>
      </div>

      {/* Recent Interviews */}
      <Card className="border-surface-200/10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Interviews</CardTitle>
            <Link
              to="/history"
              className="flex items-center gap-1.5 text-sm font-medium text-brand-400 hover:text-brand-300 transition-colors group"
            >
              <History className="w-4 h-4" />
              View More
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-400 uppercase bg-surface-900/50">
                <tr>
                  <th className="px-4 py-3 font-medium rounded-tl-lg">Role</th>
                  <th className="px-4 py-3 font-medium">Mode</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium rounded-tr-lg">Action</th>
                </tr>
              </thead>
              <tbody>
                {recent_interviews.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No interviews completed yet.</td>
                  </tr>
                )}
                {recent_interviews.map(iv => (
                  <tr key={iv.id} className="border-b border-surface-200/5 hover:bg-surface-800/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-200">{iv.target_role || 'General'}</td>
                    <td className="px-4 py-3 capitalize text-slate-400">{iv.mode ? iv.mode.replace('_', ' ') : 'General'}</td>
                    <td className="px-4 py-3">
                      {iv.overall_score != null ? (
                        <span className={`font-semibold ${
                          iv.overall_score >= 8 || iv.overall_score >= 80 ? 'text-emerald-400' :
                          iv.overall_score >= 6 || iv.overall_score >= 60 ? 'text-amber-400' : 'text-rose-400'
                        }`}>
                          {iv.overall_score <= 10 ? `${iv.overall_score}/10` : `${iv.overall_score}/100`}
                        </span>
                      ) : <span className="text-slate-500">N/A</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {iv.created_at ? new Date(iv.created_at).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-4 py-3">
                      {iv.status === 'completed' ? (
                        <Link to={`/report/${iv.id}`} className="text-brand-400 hover:text-brand-300 font-medium text-xs">
                          View Report &rarr;
                        </Link>
                      ) : (
                        <span className="text-slate-500 text-xs italic">
                          {iv.status === 'in_progress' ? 'In Progress' : 'Discarded'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({ title, value, icon, trend }: {
  title: string; value: string | number; icon: React.ReactNode; trend?: number;
}) {
  return (
    <Card className="border-surface-200/10">
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm font-medium text-slate-400 mb-1">{title}</p>
            <h3 className="text-2xl font-bold text-white">{value}</h3>
          </div>
          <div className="p-2 rounded-xl bg-surface-800 border border-surface-200/10">{icon}</div>
        </div>
        {trend !== undefined && (
          <div className="mt-4 flex items-center text-xs">
            <span className={trend >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{trend > 0 ? '+' : ''}{trend}%</span>
            <span className="text-slate-500 ml-2">vs last month</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

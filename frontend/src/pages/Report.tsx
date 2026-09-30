import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Download,
  Trophy,
  Target,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Lightbulb,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Mic,
  Type,
  Clock,
  Check,
  HelpCircle,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

import { interviewApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Report() {
  const { id } = useParams<{ id: string }>();
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});

  const toggleQuestion = (qId: string) => {
    setExpandedQuestions((prev) => ({
      ...prev,
      [qId]: !prev[qId],
    }));
  };

  const expandAll = () => {
    if (!questions) return;
    const allExpanded: Record<string, boolean> = {};
    questions.forEach((q) => {
      allExpanded[q.id] = true;
    });
    setExpandedQuestions(allExpanded);
  };

  const collapseAll = () => {
    setExpandedQuestions({});
  };

  const {
    data: report,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['report', id],
    queryFn: () => interviewApi.getReport(id!),
    enabled: !!id,
    retry: 2,
  });

  const { data: questions } = useQuery({
    queryKey: ['interview-questions', id],
    queryFn: () => interviewApi.getQuestions(id!),
    enabled: !!id,
  });

  const handleDownloadPdf = async () => {
    const element = document.getElementById('report-content');
    if (!element) return;

    // Expand all before downloading PDF
    expandAll();

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#080c16',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Interview_Report_${id?.slice(0, 8)}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
    }
  };

  // Loading State
  if (isLoading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[70vh]">
        <div className="relative mb-6">
          <div className="w-16 h-16 rounded-full border-4 border-brand-500/20 border-t-brand-500 animate-spin" />
          <Sparkles className="w-6 h-6 text-brand-400 absolute inset-0 m-auto animate-pulse" />
        </div>
        <h2 className="text-xl text-white font-display font-medium mb-2">
          Generating Performance Report...
        </h2>
        <p className="text-sm text-slate-400">
          Synthesizing AI evaluation, technical accuracy, and tailored feedback
        </p>
      </div>
    );
  }

  // Error / Not Found State
  if (isError || !report) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[70vh] text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-surface-800 border border-surface-700 flex items-center justify-center mb-4 text-rose-400">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-display font-bold text-white mb-2">
          Report Not Ready Yet
        </h2>
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          The interview report is being processed or was not found. If this session just ended, please retry.
        </p>
        <div className="flex gap-3">
          <Button onClick={() => refetch()} className="bg-brand-600 hover:bg-brand-500 gap-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </Button>
          <Button asChild variant="outline">
            <Link to="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Normalize score to 0-100 percentage for circular progress
  const scorePercent = Math.min(100, Math.max(0, report.overall_score <= 10 ? report.overall_score * 10 : report.overall_score));

  // Extract preparation plan safely
  const immediatePlan = Array.isArray(report.preparation_plan?.immediate)
    ? report.preparation_plan.immediate
    : [];

  const shortTermPlan = Array.isArray(report.preparation_plan?.short_term)
    ? report.preparation_plan.short_term
    : [];

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <Button variant="ghost" asChild className="text-slate-400 hover:text-white">
          <Link to="/dashboard">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Link>
        </Button>
        <Button
          onClick={handleDownloadPdf}
          variant="outline"
          className="border-brand-500/40 text-brand-300 hover:bg-brand-500/10 gap-2"
        >
          <Download className="w-4 h-4" />
          Download PDF
        </Button>
      </div>

      <div id="report-content" className="space-y-8 bg-surface-950 p-6 rounded-3xl border border-surface-200/10 shadow-2xl">
        {/* Main Score Banner */}
        <Card className="border border-brand-500/30 bg-gradient-to-br from-brand-950/80 via-surface-900 to-violet-950/60 shadow-2xl relative overflow-hidden rounded-2xl">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Trophy className="w-48 h-48 text-white" />
          </div>
          <CardContent className="p-8 relative z-10 flex flex-col md:flex-row items-center gap-8">
            {/* Radial Score Gauge */}
            <div className="relative">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="54"
                  className="stroke-surface-800"
                  strokeWidth="10"
                  fill="none"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="54"
                  className={`stroke-current transition-all duration-1000 ${
                    scorePercent >= 80
                      ? 'text-emerald-400'
                      : scorePercent >= 60
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                  strokeWidth="10"
                  fill="none"
                  strokeDasharray="339.29"
                  strokeDashoffset={339.29 - (339.29 * scorePercent) / 100}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-display font-bold text-white">
                  {report.overall_score}
                </span>
                <span className="text-[10px] text-slate-400 font-semibold tracking-wider">
                  {report.overall_score <= 10 ? '/10' : '/100'}
                </span>
              </div>
            </div>

            <div className="flex-1 text-center md:text-left space-y-2">
              <div className="flex items-center justify-center md:justify-start gap-2">
                <span className="px-3 py-1 rounded-full bg-brand-500/20 text-brand-300 text-xs font-semibold border border-brand-500/30 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Performance Report
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-white">
                Interview Performance Summary
              </h1>
              <p className="text-slate-300 text-sm max-w-xl leading-relaxed">
                You completed{' '}
                <span className="font-semibold text-white">{report.total_questions} questions</span>{' '}
                using {report.voice_answers_count} voice and {report.text_answers_count} text answers.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Dimension Breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DimensionCard
            title="Technical"
            score={report.technical_score}
            icon={<Target className="w-5 h-5" />}
          />
          <DimensionCard
            title="Communication"
            score={report.communication_score}
            icon={<MessageSquare className="w-5 h-5" />}
          />
          <DimensionCard
            title="Clarity"
            score={report.clarity_score}
            icon={<CheckCircle2 className="w-5 h-5" />}
          />
          <DimensionCard
            title="Completeness"
            score={report.completeness_score}
            icon={<Trophy className="w-5 h-5" />}
          />
        </div>

        {/* Strong Topics & Areas to Improve */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Strong Topics */}
          <Card className="border-surface-700/60 bg-surface-900/60 backdrop-blur-md rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-emerald-400 flex items-center gap-2 text-base font-semibold">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Strong Topics
              </CardTitle>
            </CardHeader>
            <CardContent>
              {report.strong_topics && report.strong_topics.length > 0 ? (
                <ul className="space-y-2">
                  {report.strong_topics.map((topic, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-slate-200 text-sm">
                      <span className="text-emerald-400 font-bold">•</span>
                      <span>{topic}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500 italic">No specific strong topics recorded.</p>
              )}
            </CardContent>
          </Card>

          {/* Areas to Improve */}
          <Card className="border-surface-700/60 bg-surface-900/60 backdrop-blur-md rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-rose-400 flex items-center gap-2 text-base font-semibold">
                <AlertCircle className="w-5 h-5 text-rose-400" /> Areas to Improve
              </CardTitle>
            </CardHeader>
            <CardContent>
              {report.weak_topics && report.weak_topics.length > 0 ? (
                <ul className="space-y-2 mb-3">
                  {report.weak_topics.map((topic, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-slate-200 text-sm">
                      <span className="text-rose-400 font-bold">•</span>
                      <span>{topic}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {report.missing_concepts && report.missing_concepts.length > 0 ? (
                <div className="pt-2 border-t border-surface-800 space-y-1.5">
                  <span className="text-xs font-semibold text-amber-400 block uppercase tracking-wider">
                    Key Missing Concepts:
                  </span>
                  {report.missing_concepts.map((concept, i) => (
                    <p key={i} className="text-xs text-slate-300 flex items-start gap-2">
                      <span className="text-amber-400">→</span> {concept}
                    </p>
                  ))}
                </div>
              ) : null}

              {(!report.weak_topics || report.weak_topics.length === 0) &&
                (!report.missing_concepts || report.missing_concepts.length === 0) && (
                  <p className="text-xs text-slate-500 italic">No major weak topics identified.</p>
                )}
            </CardContent>
          </Card>
        </div>

        {/* Actionable Recommendations */}
        {report.recommendations && report.recommendations.length > 0 && (
          <Card className="border-surface-700/60 bg-surface-900/60 backdrop-blur-md rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-amber-400 flex items-center gap-2 text-base font-semibold">
                <Lightbulb className="w-5 h-5 text-amber-400" /> Coach Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {report.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-slate-200 text-sm">
                    <span className="text-amber-400 font-bold mt-0.5">✓</span>
                    <span className="leading-relaxed">{rec}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Tailored Preparation Plan */}
        {(immediatePlan.length > 0 || shortTermPlan.length > 0) && (
          <Card className="border-brand-500/20 bg-brand-950/20 backdrop-blur-md rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-brand-300 flex items-center gap-2 text-base font-semibold">
                <BookOpen className="w-5 h-5 text-brand-400" /> Next Steps Preparation Plan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {immediatePlan.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Immediate Focus:
                  </h4>
                  <ul className="space-y-1.5 pl-4 list-disc text-sm text-slate-300 marker:text-brand-400">
                    {immediatePlan.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {shortTermPlan.length > 0 && (
                <div className="pt-3 border-t border-brand-500/10">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Short-Term Goals:
                  </h4>
                  <ul className="space-y-1.5 pl-4 list-disc text-sm text-slate-300 marker:text-brand-400">
                    {shortTermPlan.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── Detailed Q&A Analysis with Candidate Answers & Model Answers ────── */}
        {questions && questions.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-surface-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-display font-semibold text-white flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-brand-400" />
                  Detailed Question & Answer Review ({questions.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Click any question to view your spoken answer, scores, feedback, and the ideal model answer.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={expandAll}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Expand All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={collapseAll}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Collapse All
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {questions.map((q, idx) => {
                const isExpanded = expandedQuestions[q.id] ?? (idx === 0);
                const answer = q.answer;
                const evaluation = answer?.evaluation;
                const qScore = evaluation?.overall_score;

                return (
                  <Card
                    key={q.id || idx}
                    className="border-surface-800/80 bg-surface-900/60 backdrop-blur-md rounded-2xl overflow-hidden transition-all duration-200 hover:border-surface-700"
                  >
                    {/* Header bar of the question */}
                    <div
                      onClick={() => toggleQuestion(q.id)}
                      className="p-5 flex items-start justify-between gap-4 cursor-pointer select-none group"
                    >
                      <div className="flex items-start gap-3.5 flex-1">
                        <span className="w-7 h-7 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                          Q{q.sequence_number || idx + 1}
                        </span>
                        <div className="space-y-1.5 flex-1">
                          <p className="text-base font-medium text-white group-hover:text-brand-300 transition-colors leading-relaxed">
                            {q.text}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="px-2.5 py-0.5 rounded-full bg-surface-800 text-slate-300 font-medium capitalize">
                              {q.category || 'Technical'}
                            </span>
                            {q.topic && (
                              <span className="px-2.5 py-0.5 rounded-full bg-surface-800/80 text-brand-300/90 font-medium">
                                {q.topic}
                              </span>
                            )}
                            <span className="text-slate-500">•</span>
                            <span className="text-slate-400 capitalize">
                              {q.difficulty_level || 'Medium'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {qScore !== undefined && qScore !== null && (
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold border ${
                              qScore >= 8.0
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : qScore >= 6.0
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            {qScore <= 10 ? `${qScore.toFixed(1)}/10` : `${qScore}/100`}
                          </span>
                        )}
                        <div className="p-1 rounded-lg text-slate-400 group-hover:text-white transition-colors">
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5" />
                          ) : (
                            <ChevronDown className="w-5 h-5" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Accordion Body */}
                    {isExpanded && (
                      <div className="p-5 pt-0 space-y-5 border-t border-surface-800/60 mt-1 animate-fade-in">
                        {/* 1. Candidate's Response */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                              {answer?.answer_mode === 'voice' ? (
                                <Mic className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Type className="w-3.5 h-3.5 text-brand-400" />
                              )}
                              Your Response:
                            </span>
                            {answer?.duration_seconds && (
                              <span className="text-xs text-slate-500 flex items-center gap-1 font-mono">
                                <Clock className="w-3 h-3" />
                                {answer.duration_seconds.toFixed(1)}s
                              </span>
                            )}
                          </div>
                          <div className="p-4 rounded-xl bg-surface-950 border border-surface-800 text-sm text-slate-200 leading-relaxed">
                            {answer?.text ? (
                              <p className="whitespace-pre-wrap">{answer.text}</p>
                            ) : (
                              <p className="text-slate-500 italic">No response recorded for this question.</p>
                            )}
                          </div>
                        </div>

                        {/* 2. Ideal Model / Correct Response */}
                        {evaluation?.example_answer && (
                          <div className="space-y-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                              Ideal Model Answer (Best Practice):
                            </span>
                            <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 via-surface-950 to-surface-950 border border-amber-500/25 text-sm text-amber-100/90 leading-relaxed shadow-sm">
                              <p className="whitespace-pre-wrap">{evaluation.example_answer}</p>
                            </div>
                          </div>
                        )}

                        {/* 3. Detailed Dimension Scores */}
                        {evaluation && (
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                            <div className="p-2.5 rounded-lg bg-surface-950/80 border border-surface-800 text-center">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">Accuracy</span>
                              <span className="text-sm font-bold text-brand-300">{evaluation.technical_accuracy ?? '--'}/10</span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-surface-950/80 border border-surface-800 text-center">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">Relevance</span>
                              <span className="text-sm font-bold text-brand-300">{evaluation.relevance ?? '--'}/10</span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-surface-950/80 border border-surface-800 text-center">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">Clarity</span>
                              <span className="text-sm font-bold text-brand-300">{evaluation.clarity ?? '--'}/10</span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-surface-950/80 border border-surface-800 text-center">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">Completeness</span>
                              <span className="text-sm font-bold text-brand-300">{evaluation.completeness ?? '--'}/10</span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-surface-950/80 border border-surface-800 text-center col-span-2 sm:col-span-1">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block">Communication</span>
                              <span className="text-sm font-bold text-brand-300">{evaluation.communication ?? '--'}/10</span>
                            </div>
                          </div>
                        )}

                        {/* 4. Strengths, Improvements & Suggestions */}
                        {evaluation && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                            {/* Strengths */}
                            {evaluation.strengths && evaluation.strengths.length > 0 && (
                              <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-1.5">
                                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                                  <Check className="w-3.5 h-3.5" /> Strengths
                                </span>
                                <ul className="space-y-1 pl-4 list-disc text-xs text-slate-300 marker:text-emerald-400">
                                  {evaluation.strengths.map((s, i) => (
                                    <li key={i}>{s}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Missing Concepts & Improvements */}
                            {((evaluation.missing_concepts && evaluation.missing_concepts.length > 0) ||
                              (evaluation.improvements && evaluation.improvements.length > 0)) && (
                              <div className="p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-1.5">
                                <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5 uppercase tracking-wider">
                                  <HelpCircle className="w-3.5 h-3.5" /> Key Missing Concepts & Gaps
                                </span>
                                <ul className="space-y-1 pl-4 list-disc text-xs text-slate-300 marker:text-rose-400">
                                  {evaluation.missing_concepts?.map((mc, i) => (
                                    <li key={`mc-${i}`}>Missing: {mc}</li>
                                  ))}
                                  {evaluation.improvements?.map((imp, i) => (
                                    <li key={`imp-${i}`}>{imp}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Suggestions */}
                            {evaluation.suggestions && evaluation.suggestions.length > 0 && (
                              <div className="p-3.5 rounded-xl bg-brand-500/5 border border-brand-500/20 space-y-1.5 md:col-span-2">
                                <span className="text-xs font-bold text-brand-300 flex items-center gap-1.5 uppercase tracking-wider">
                                  <Lightbulb className="w-3.5 h-3.5 text-brand-400" /> Actionable Tips
                                </span>
                                <ul className="space-y-1 pl-4 list-disc text-xs text-slate-300 marker:text-brand-400">
                                  {evaluation.suggestions.map((sug, i) => (
                                    <li key={i}>{sug}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DimensionCard({
  title,
  score,
  icon,
}: {
  title: string;
  score: number;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-surface-700/60 bg-surface-900/60 backdrop-blur-md rounded-2xl">
      <CardContent className="p-4 flex flex-col items-center text-center">
        <div className="w-10 h-10 rounded-xl bg-surface-800 text-brand-400 flex items-center justify-center mb-3 shadow-inner">
          {icon}
        </div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
          {title}
        </p>
        <span
          className={`text-xl font-display font-bold ${
            score >= 8
              ? 'text-emerald-400'
              : score >= 6
              ? 'text-amber-400'
              : 'text-rose-400'
          }`}
        >
          {score !== undefined && score !== null ? `${score}/10` : '--'}
        </span>
      </CardContent>
    </Card>
  );
}

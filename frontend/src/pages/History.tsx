import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { History as HistoryIcon, ArrowRight, Play } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

import { dashboardApi } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function History() {
  const { data: history, isLoading } = useQuery({
    queryKey: ['interview-history'],
    queryFn: () => dashboardApi.getHistory(1, 50),
  });

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-white mb-2 flex items-center gap-2">
          <HistoryIcon className="w-8 h-8 text-brand-400" />
          Interview History
        </h1>
        <p className="text-slate-400">Review your past interviews and track your progress over time.</p>
      </div>

      <Card className="border-surface-200/10 bg-surface-900/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-slate-500 animate-pulse">Loading history...</div>
          ) : history?.length === 0 ? (
            <div className="p-16 text-center text-slate-500 flex flex-col items-center">
              <HistoryIcon className="w-12 h-12 mb-4 opacity-20" />
              <p>You haven't taken any interviews yet.</p>
              <Button asChild className="mt-4">
                <Link to="/setup">Start an Interview</Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-surface-200/10">
              {history?.map((item) => (
                <div key={item.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-800/30 transition-colors">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-white">{item.target_role}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider ${
                        item.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        'bg-brand-500/10 text-brand-400 border border-brand-500/20'
                      }`}>
                        {item.status}
                      </span>
                    </div>
                    <div className="text-sm text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                      <span>{item.mode ? item.mode.replace('_', ' ') : 'General'}</span>
                      <span>•</span>
                      <span>{item.difficulty}</span>
                      <span>•</span>
                      <span>{item.duration_minutes} min</span>
                      <span>•</span>
                      <span>{item.created_at ? format(new Date(item.created_at), "MMM d, yyyy 'at' h:mm a") : 'N/A'}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    {item.status === 'completed' && item.overall_score !== undefined && item.overall_score !== null && (
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${
                          item.overall_score >= 8.0 || item.overall_score >= 80 ? 'text-emerald-400' :
                          item.overall_score >= 6.0 || item.overall_score >= 60 ? 'text-amber-400' : 'text-rose-400'
                        }`}>
                          {item.overall_score <= 10 ? `${item.overall_score}/10` : `${item.overall_score}/100`}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Score</div>
                      </div>
                    )}
                    
                    {item.status === 'completed' ? (
                      <Button asChild variant="outline" className="border-brand-500/30 hover:bg-brand-500/10 text-brand-400">
                        <Link to={`/report/${item.id}`}>
                          View Report <ArrowRight className="w-4 h-4 ml-2" />
                        </Link>
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-500 italic px-3 py-1.5 rounded-lg bg-surface-800/60 border border-surface-700/40">
                        Discarded
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

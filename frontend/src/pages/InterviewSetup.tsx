import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Mic, Loader2, Play, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { interviewApi, resumeApi, jdApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const setupSchema = z.object({
  mode: z.enum(['general', 'resume_based', 'jd_based', 'resume_jd', 'hr', 'technical']),
  target_role: z.string().min(2, 'Target role is required'),
  experience_level: z.enum(['fresher', 'junior', 'mid', 'senior']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  duration_minutes: z.coerce.number().int().refine(val => [10, 20, 30].includes(val)),
  voice_gender: z.enum(['male', 'female']),
  resume_id: z.string().optional(),
  job_description_id: z.string().optional(),
}).refine(data => {
  if (['resume_based', 'resume_jd'].includes(data.mode) && !data.resume_id) {
    return false;
  }
  return true;
}, {
  message: "Resume is required for this interview mode",
  path: ["resume_id"]
}).refine(data => {
  if (['jd_based', 'resume_jd'].includes(data.mode) && !data.job_description_id) {
    return false;
  }
  return true;
}, {
  message: "Job Description is required for this interview mode",
  path: ["job_description_id"]
});

type SetupFormValues = z.infer<typeof setupSchema>;

export default function InterviewSetup() {
  const navigate = useNavigate();

  const { data: resumes } = useQuery({ queryKey: ['resumes'], queryFn: resumeApi.list });
  const { data: jds } = useQuery({ queryKey: ['jds'], queryFn: jdApi.list });

  const { register, handleSubmit, control, watch, formState: { errors } } = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      mode: 'general',
      experience_level: 'mid',
      difficulty: 'medium',
      duration_minutes: 20,
      voice_gender: 'female',
    }
  });

  const selectedMode = watch('mode');

  const createMutation = useMutation({
    mutationFn: interviewApi.create,
    onSuccess: (data) => {
      navigate(`/interview-check/${data.id}`);
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail;
      let msg = 'Failed to create interview';
      if (typeof detail === 'string') {
        msg = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        msg = detail.map((d: any) => d.msg || d.message || JSON.stringify(d)).join(', ');
      } else if (error.message) {
        msg = error.message;
      }
      toast.error(msg);
    }
  });

  const onSubmit = (data: SetupFormValues) => {
    const isResumeMode = ['resume_based', 'resume_jd'].includes(data.mode);
    const isJdMode = ['jd_based', 'resume_jd'].includes(data.mode);

    createMutation.mutate({
      ...data,
      resume_id: isResumeMode && data.resume_id && data.resume_id.trim() ? data.resume_id.trim() : undefined,
      job_description_id: isJdMode && data.job_description_id && data.job_description_id.trim() ? data.job_description_id.trim() : undefined,
      duration_minutes: Number(data.duration_minutes) as 10 | 20 | 30,
      language: 'english',
      enable_followup: true,
      feedback_mode: 'final',
    });
  };

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-white mb-2">Configure Interview</h1>
        <p className="text-slate-400">Set up your AI mock interview parameters to match your target role.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card className="border-brand-500/20 shadow-brand-500/10 shadow-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-brand-400" />
              Interview Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Mode Selection */}
              <div className="space-y-3 md:col-span-2">
                <Label>Interview Mode</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { id: 'general', label: 'General', desc: 'Standard professional Q&A' },
                    { id: 'technical', label: 'Technical', desc: 'Role-specific technical questions' },
                    { id: 'hr', label: 'HR / Behavioral', desc: 'Leadership and culture fit' },
                    { id: 'resume_based', label: 'Resume-Based', desc: 'Deep dive into your experience' },
                    { id: 'jd_based', label: 'Job Description', desc: 'Tailored to a specific role' },
                    { id: 'resume_jd', label: 'Resume + JD', desc: 'Candidate fit analysis' },
                  ].map((mode) => (
                    <label
                      key={mode.id}
                      className={`relative flex flex-col p-4 cursor-pointer rounded-xl border transition-all ${
                        selectedMode === mode.id
                          ? 'bg-brand-500/10 border-brand-500/50 ring-1 ring-brand-500/50'
                          : 'bg-surface-900 border-surface-200/10 hover:border-surface-200/30 hover:bg-surface-800'
                      }`}
                    >
                      <input
                        type="radio"
                        value={mode.id}
                        {...register('mode')}
                        className="sr-only"
                      />
                      <span className={`text-sm font-semibold mb-1 ${selectedMode === mode.id ? 'text-brand-400' : 'text-slate-200'}`}>
                        {mode.label}
                      </span>
                      <span className="text-xs text-slate-500">{mode.desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Target Role */}
              <div className="space-y-2">
                <Label htmlFor="target_role">Target Role</Label>
                <Input
                  id="target_role"
                  placeholder="e.g. Frontend Developer"
                  {...register('target_role')}
                  className={errors.target_role ? 'border-red-500' : ''}
                />
                {errors.target_role && <p className="text-xs text-red-500">{errors.target_role.message}</p>}
              </div>

              {/* Experience Level */}
              <div className="space-y-2">
                <Label htmlFor="experience_level">Experience Level</Label>
                <select
                  id="experience_level"
                  {...register('experience_level')}
                  className="flex h-10 w-full rounded-xl border border-surface-200/10 bg-surface-850 px-3 py-2 text-sm text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <option value="fresher">Fresher (0 years)</option>
                  <option value="junior">Junior (1-3 years)</option>
                  <option value="mid">Mid-Level (3-5 years)</option>
                  <option value="senior">Senior (5+ years)</option>
                </select>
              </div>

              {/* Difficulty */}
              <div className="space-y-2">
                <Label htmlFor="difficulty">Difficulty</Label>
                <select
                  id="difficulty"
                  {...register('difficulty')}
                  className="flex h-10 w-full rounded-xl border border-surface-200/10 bg-surface-850 px-3 py-2 text-sm text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <option value="easy">Easy (Fundamentals)</option>
                  <option value="medium">Medium (Standard)</option>
                  <option value="hard">Hard (Advanced/Deep dives)</option>
                </select>
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <Label htmlFor="duration_minutes">Duration</Label>
                <select
                  id="duration_minutes"
                  {...register('duration_minutes')}
                  className="flex h-10 w-full rounded-xl border border-surface-200/10 bg-surface-850 px-3 py-2 text-sm text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <option value="10">10 Minutes (~4-5 questions)</option>
                  <option value="20">20 Minutes (~8-10 questions)</option>
                  <option value="30">30 Minutes (~12-15 questions)</option>
                </select>
              </div>

              {/* Voice Gender */}
              <div className="space-y-2">
                <Label htmlFor="voice_gender">Interviewer Voice</Label>
                <select
                  id="voice_gender"
                  {...register('voice_gender')}
                  className="flex h-10 w-full rounded-xl border border-surface-200/10 bg-surface-850 px-3 py-2 text-sm text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <option value="female">Female (Hannah)</option>
                  <option value="male">Male (Daniel)</option>
                </select>
              </div>

            </div>

            {/* Conditional Documents */}
            {(selectedMode === 'resume_based' || selectedMode === 'resume_jd') && (
              <div className="space-y-2 pt-4 border-t border-surface-200/10 mt-6">
                <Label className="text-brand-400">Select Resume</Label>
                <select
                  {...register('resume_id')}
                  className={`flex h-10 w-full rounded-xl border bg-surface-850 px-3 py-2 text-sm text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${errors.resume_id ? 'border-red-500' : 'border-surface-200/10'}`}
                >
                  <option value="">-- Choose a Resume --</option>
                  {resumes?.map(r => (
                    <option key={r.id} value={r.id}>{r.filename}</option>
                  ))}
                </select>
                {errors.resume_id && <p className="text-xs text-red-500">{errors.resume_id.message}</p>}
                {resumes?.length === 0 && <p className="text-xs text-amber-400">Please upload a resume in the Documents section first.</p>}
              </div>
            )}

            {(selectedMode === 'jd_based' || selectedMode === 'resume_jd') && (
              <div className="space-y-2 pt-4 border-t border-surface-200/10 mt-6">
                <Label className="text-violet-400">Select Job Description</Label>
                <select
                  {...register('job_description_id')}
                  className={`flex h-10 w-full rounded-xl border bg-surface-850 px-3 py-2 text-sm text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${errors.job_description_id ? 'border-red-500' : 'border-surface-200/10'}`}
                >
                  <option value="">-- Choose a Job Description --</option>
                  {jds?.map(j => (
                    <option key={j.id} value={j.id}>{j.parsed_data?.job_title || 'Untitled JD'} ({new Date(j.created_at).toLocaleDateString()})</option>
                  ))}
                </select>
                {errors.job_description_id && <p className="text-xs text-red-500">{errors.job_description_id.message}</p>}
                {jds?.length === 0 && <p className="text-xs text-amber-400">Please add a job description in the Documents section first.</p>}
              </div>
            )}

            <div className="pt-6">
              <Button type="submit" size="lg" className="w-full h-14 text-lg font-bold" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <>
                    <Play className="w-6 h-6 mr-2 fill-current" />
                    Start Interview
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

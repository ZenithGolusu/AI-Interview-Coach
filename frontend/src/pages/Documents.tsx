import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Upload, Trash2, Loader2, FileCode2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { resumeApi, jdApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function Documents() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [jdText, setJdText] = useState('');

  // Queries
  const { data: resumes, isLoading: resumesLoading } = useQuery({
    queryKey: ['resumes'],
    queryFn: resumeApi.list,
  });

  const { data: jds, isLoading: jdsLoading } = useQuery({
    queryKey: ['jds'],
    queryFn: jdApi.list,
  });

  // Mutations
  const uploadMutation = useMutation({
    mutationFn: resumeApi.upload,
    onSuccess: () => {
      toast.success('Resume uploaded and processed successfully');
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to upload resume');
    },
  });

  const deleteResumeMutation = useMutation({
    mutationFn: resumeApi.delete,
    onSuccess: () => {
      toast.success('Resume deleted');
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
    },
  });

  const submitJdMutation = useMutation({
    mutationFn: jdApi.create,
    onSuccess: () => {
      toast.success('Job description processed successfully');
      setJdText('');
      queryClient.invalidateQueries({ queryKey: ['jds'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to process JD');
    },
  });

  const handleFileUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    uploadMutation.mutate(file);
  };

  const handleJdSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jdText.trim()) return;
    submitJdMutation.mutate(jdText);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-white mb-2">Documents</h1>
        <p className="text-slate-400">Manage your resumes and target job descriptions for personalized interviews.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Resumes Section */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand-400" />
                Upload Resume
              </CardTitle>
              <CardDescription>Upload a PDF resume to enable Resume-Based interviews.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFileUpload} className="space-y-4">
                <div className="border-2 border-dashed border-surface-200/20 rounded-xl p-6 text-center hover:bg-surface-800/30 transition-colors">
                  <Input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="resume-upload"
                  />
                  <label htmlFor="resume-upload" className="cursor-pointer flex flex-col items-center">
                    <Upload className="w-8 h-8 text-slate-400 mb-3" />
                    <span className="text-sm font-medium text-slate-300">
                      {file ? file.name : 'Click to select a PDF file'}
                    </span>
                    <span className="text-xs text-slate-500 mt-1">PDF up to 10MB</span>
                  </label>
                </div>
                <Button 
                  type="submit" 
                  disabled={!file || uploadMutation.isPending} 
                  className="w-full"
                >
                  {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {uploadMutation.isPending ? 'Processing...' : 'Upload Resume'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your Resumes</CardTitle>
            </CardHeader>
            <CardContent>
              {resumesLoading ? (
                <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin text-brand-400" /></div>
              ) : resumes?.length === 0 ? (
                <p className="text-sm text-slate-500 text-center p-4">No resumes uploaded yet.</p>
              ) : (
                <div className="space-y-3">
                  {resumes?.map((resume) => (
                    <div key={resume.id} className="flex items-center justify-between p-3 rounded-lg bg-surface-900 border border-surface-200/10">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-slate-400" />
                        <div>
                          <p className="text-sm font-medium text-slate-200">{resume.filename}</p>
                          <p className="text-xs text-slate-500">
                            {new Date(resume.created_at).toLocaleDateString()} • {Math.round(resume.file_size_bytes / 1024)} KB
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteResumeMutation.mutate(resume.id)}
                        disabled={deleteResumeMutation.isPending}
                        className="text-slate-400 hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Job Descriptions Section */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode2 className="w-5 h-5 text-violet-400" />
                Add Job Description
              </CardTitle>
              <CardDescription>Paste a job description to tailor your interview questions.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleJdSubmit} className="space-y-4">
                <textarea
                  className="w-full h-40 rounded-xl border border-surface-200/10 bg-surface-850 p-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  placeholder="Paste the full job description here..."
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                />
                <Button 
                  type="submit" 
                  disabled={!jdText.trim() || submitJdMutation.isPending}
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {submitJdMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {submitJdMutation.isPending ? 'Processing...' : 'Save Job Description'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Saved Job Descriptions</CardTitle>
            </CardHeader>
            <CardContent>
              {jdsLoading ? (
                <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>
              ) : jds?.length === 0 ? (
                <p className="text-sm text-slate-500 text-center p-4">No job descriptions saved.</p>
              ) : (
                <div className="space-y-3">
                  {jds?.map((jd) => (
                    <div key={jd.id} className="p-3 rounded-lg bg-surface-900 border border-surface-200/10">
                      <div className="flex items-center gap-3 mb-2">
                        <FileCode2 className="w-5 h-5 text-slate-400" />
                        <div>
                          <p className="text-sm font-medium text-slate-200">
                            {jd.parsed_data?.job_title || 'Untitled Role'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {new Date(jd.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {jd.parsed_data?.required_skills && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(jd.parsed_data.required_skills as string[]).slice(0, 3).map((skill, i) => (
                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20">
                              {skill}
                            </span>
                          ))}
                          {(jd.parsed_data.required_skills as string[]).length > 3 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-800 text-slate-400">
                              +{(jd.parsed_data.required_skills as string[]).length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

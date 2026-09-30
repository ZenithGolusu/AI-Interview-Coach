import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { 
  LayoutDashboard, 
  Settings, 
  LogOut, 
  Mic, 
  History,
  FileText
} from 'lucide-react';
import { cn } from '@/utils/cn';

export default function Layout() {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'New Interview', href: '/setup', icon: Mic },
    { name: 'Resumes & JDs', href: '/documents', icon: FileText },
    { name: 'History', href: '/history', icon: History },
  ];

  const isLiveInterview = location.pathname.startsWith('/interview/');

  return (
    <div className="flex h-screen bg-surface-950 overflow-hidden">
      {/* Sidebar - Hidden during live interviews */}
      {!isLiveInterview && (
        <aside className="w-64 border-r border-surface-200/10 bg-surface-900/50 flex flex-col shrink-0">
          <div className="h-16 flex items-center px-6 border-b border-surface-200/10">
            <div className="flex items-center gap-2 text-brand-400 font-display font-bold text-xl tracking-tight">
              <Mic className="w-6 h-6" />
              <span>AI Coach</span>
            </div>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'sidebar-link group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-brand-500/10 text-brand-400'
                      : 'text-slate-400 hover:bg-surface-800/50 hover:text-slate-200'
                  )}
                >
                  <Icon className={cn("w-5 h-5", isActive ? "text-brand-400" : "text-slate-500 group-hover:text-slate-300")} />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-surface-200/10">
            <div className="flex items-center gap-3 px-3 py-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-500 to-violet-500 flex items-center justify-center text-white font-semibold text-sm">
                {user?.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{user?.full_name}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
            </div>
            
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 hover:bg-surface-800/50 hover:text-red-400 transition-all cursor-pointer"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </aside>
      )}

      {/* Main Content */}
      <main className="flex-1 relative overflow-y-auto bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-surface-900 via-surface-950 to-surface-950">
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px] pointer-events-none" />
        <div className="relative h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

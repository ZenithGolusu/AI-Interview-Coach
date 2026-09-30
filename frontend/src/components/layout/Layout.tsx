import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import {
  LayoutDashboard,
  LogOut,
  Mic,
  History,
  FileText,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/utils/cn';

const navItems = [
  { name: 'Dashboard',     href: '/dashboard', icon: LayoutDashboard },
  { name: 'New Interview', href: '/setup',      icon: Mic },
  { name: 'Documents',     href: '/documents',  icon: FileText },
  { name: 'History',       href: '/history',    icon: History },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isLiveInterview = location.pathname.startsWith('/interview/');

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  // Prevent body scroll when drawer open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (isLiveInterview) {
    return (
      <main className="h-screen bg-surface-950 overflow-y-auto">
        <Outlet />
      </main>
    );
  }

  return (
    <div className="flex h-screen bg-surface-950 overflow-hidden">

      {/* ── Desktop Sidebar (hidden on mobile) ────────────────────────────── */}
      <aside className="hidden md:flex w-64 border-r border-surface-200/10 bg-surface-900/50 flex-col shrink-0">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-surface-200/10">
          <div className="flex items-center gap-2 text-brand-400 font-display font-bold text-xl tracking-tight">
            <Mic className="w-6 h-6" />
            <span>AI Coach</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-6 space-y-1">
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
                <Icon className={cn('w-5 h-5', isActive ? 'text-brand-400' : 'text-slate-500 group-hover:text-slate-300')} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User + Logout */}
        <div className="p-4 border-t border-surface-200/10">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-500 to-violet-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
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

      {/* ── Mobile Slide-out Drawer ────────────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setDrawerOpen(false)}
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        />
      )}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-72 z-50 md:hidden flex flex-col',
          'bg-surface-900 border-r border-surface-200/10 transition-transform duration-300 ease-in-out',
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Drawer header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-surface-200/10">
          <div className="flex items-center gap-2 text-brand-400 font-display font-bold text-lg">
            <Mic className="w-5 h-5" />
            <span>AI Coach</span>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer nav */}
        <nav className="flex-1 px-4 py-5 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-brand-500/10 text-brand-400'
                    : 'text-slate-400 hover:bg-surface-800/50 hover:text-slate-200'
                )}
              >
                <Icon className={cn('w-5 h-5', isActive ? 'text-brand-400' : 'text-slate-500')} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Drawer user */}
        <div className="p-4 border-t border-surface-200/10">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-brand-500 to-violet-500 flex items-center justify-center text-white font-semibold shrink-0">
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

      {/* ── Main Content ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile top bar */}
        <header className="md:hidden h-14 flex items-center justify-between px-4 border-b border-surface-200/10 bg-surface-900/80 backdrop-blur-sm shrink-0">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-surface-800 transition-colors cursor-pointer"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 text-brand-400 font-display font-bold text-base">
            <Mic className="w-4 h-4" />
            <span>AI Coach</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-brand-500 to-violet-500 flex items-center justify-center text-white font-semibold text-sm">
            {user?.full_name?.charAt(0).toUpperCase() || 'U'}
          </div>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-surface-900 via-surface-950 to-surface-950 pb-20 md:pb-0">
          <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px] pointer-events-none" />
          <Outlet />
        </main>

        {/* ── Mobile Bottom Tab Bar ─────────────────────────────────────── */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-surface-200/10 bg-surface-900/95 backdrop-blur-md">
          <div className="flex items-center justify-around h-16 px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1 flex-1 h-full text-[10px] font-medium transition-colors',
                    isActive ? 'text-brand-400' : 'text-slate-500'
                  )}
                >
                  <Icon className={cn('w-5 h-5', isActive ? 'text-brand-400' : 'text-slate-500')} />
                  <span className="leading-none">
                    {item.name === 'New Interview' ? 'Interview' : item.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Calculator,
  CalendarClock,
  FilePlus2,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  Save,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { AdminExams } from './components/AdminExams.tsx';
import { AdminQuestionBank } from './components/AdminQuestionBank.tsx';
import { AdminReports } from './components/AdminReports.tsx';
import { AdminSaveData } from './components/AdminSaveData.tsx';
import { AdminSettings } from './components/AdminSettings.tsx';
import { AdminStudents } from './components/AdminStudents.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { StudentExamFlow } from './components/StudentExamFlow.tsx';
import { DEFAULT_SCHOOL_LOGO } from './data/demoData.ts';
import {
  fetchDatabaseState,
  readCachedDb,
  readSavedAuth,
  writeCachedDb,
  writeSavedAuth,
} from './services/api.ts';
import type { AppDatabase, AuthSession, ExamSession } from './types.ts';

type AdminTab =
  | 'dashboard'
  | 'peserta'
  | 'bank_soal_mtk'
  | 'bank_soal_ind'
  | 'simpan_data'
  | 'buat_ujian'
  | 'jadwal_ujian'
  | 'monitoring'
  | 'hasil_ujian'
  | 'analisis_nilai'
  | 'pengaturan';

const ADMIN_NAV: { id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard Admin', icon: LayoutDashboard },
  { id: 'peserta', label: 'Data Peserta', icon: Users },
  { id: 'bank_soal_mtk', label: 'Bank Soal Matematika', icon: Calculator },
  { id: 'bank_soal_ind', label: 'Bank Soal B. Indonesia', icon: BookOpen },
  { id: 'simpan_data', label: 'Simpan & Cadangkan', icon: Save },
  { id: 'buat_ujian', label: 'Buat Ujian', icon: FilePlus2 },
  { id: 'jadwal_ujian', label: 'Jadwal Ujian', icon: CalendarClock },
  { id: 'monitoring', label: 'Monitoring', icon: Activity },
  { id: 'hasil_ujian', label: 'Hasil Ujian', icon: FileSpreadsheet },
  { id: 'analisis_nilai', label: 'Analisis Nilai', icon: BarChart3 },
  { id: 'pengaturan', label: 'Pengaturan', icon: Settings },
];

export default function App() {
  const [db, setDb] = useState<AppDatabase>(() => readCachedDb());
  const [auth, setAuth] = useState<AuthSession | null>(() => readSavedAuth());
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const refreshState = useCallback(async () => {
    try {
      const latest = await fetchDatabaseState();
      setDb(latest);
    } catch {
      // Keep current in-memory state if server is temporarily unreachable
    }
  }, []);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const handleLogin = (session: AuthSession) => {
    setAuth(session);
    writeSavedAuth(session);
    refreshState();
  };

  const handleLogout = () => {
    setAuth(null);
    writeSavedAuth(null);
    setActiveTab('dashboard');
  };

  const handleStudentSessionUpdated = useCallback((updatedSession: ExamSession) => {
    setDb((prev) => {
      const exists = prev.sessions.some((s) => s.id === updatedSession.id);
      const nextSessions = exists
        ? prev.sessions.map((s) => (s.id === updatedSession.id ? updatedSession : s))
        : [...prev.sessions, updatedSession];
      const nextDb = { ...prev, sessions: nextSessions };
      writeCachedDb(nextDb);
      return nextDb;
    });
  }, []);

  if (!auth) {
    return <LoginScreen school={db.school} onLoginSuccess={handleLogin} />;
  }

  if (auth.role === 'student') {
    const student = db.students.find((s) => s.id === auth.userId);
    if (!student) {
      handleLogout();
      return null;
    }
    return (
      <StudentExamFlow
        db={db}
        student={student}
        onSessionUpdated={handleStudentSessionUpdated}
        onRefreshState={refreshState}
        onLogout={handleLogout}
      />
    );
  }

  // ==================== ADMIN / GURU SHELL ====================
  const activeNavItem = ADMIN_NAV.find((n) => n.id === activeTab) || ADMIN_NAV[0];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0F2547] text-white">
      <div className="p-5 border-b border-white/10 flex items-center gap-3">
        <img
          src={db.school.logoUrl || DEFAULT_SCHOOL_LOGO}
          alt={db.school.namaSekolah}
          referrerPolicy="no-referrer"
          className="h-10 w-10 rounded-lg object-contain p-0.5 bg-white shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-bold tracking-tight truncate">TKA SMART EXAM</p>
          <p className="text-xs text-sky-300 truncate">
            {db.school.namaSekolah} · {db.school.tahunPelajaran}
          </p>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {ADMIN_NAV.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-sky-600 text-white font-semibold'
                  : 'text-slate-200 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10 space-y-3">
        <div className="text-xs">
          <p className="font-semibold text-white truncate">{db.admin.name}</p>
          <p className="text-slate-300 truncate">{db.admin.jabatan}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white cursor-pointer transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Keluar</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen no-print">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div className="w-68 max-w-[80vw] h-full relative z-10">{sidebarContent}</div>
          <button
            type="button"
            aria-label="Tutup menu"
            onClick={() => setMobileMenuOpen(false)}
            className="flex-1 bg-slate-900/50"
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-4 py-3.5 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700 cursor-pointer"
              aria-label="Buka menu navigasi"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="text-sm text-slate-500 flex items-center gap-2 truncate">
              <span className="font-semibold text-[#0F2547] whitespace-nowrap">Admin</span>
              <span aria-hidden="true">/</span>
              <span className="text-slate-700 font-medium truncate">{activeNavItem.label}</span>
            </div>
          </div>

          <div className="text-xs text-slate-500 hidden sm:flex items-center gap-2 whitespace-nowrap shrink-0">
            <span>{db.school.namaSekolah}</span>
            <span aria-hidden="true">·</span>
            <span>Kelas {db.school.kelasDefault}</span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && (
            <AdminDashboard
              db={db}
              onNavigate={(tab) =>
                setActiveTab((tab === 'bank_soal' ? 'bank_soal_mtk' : tab) as AdminTab)
              }
            />
          )}
          {activeTab === 'peserta' && (
            <AdminStudents db={db} onRefreshState={refreshState} />
          )}
          {activeTab === 'bank_soal_mtk' && (
            <AdminQuestionBank
              db={db}
              fixedMataUji="Matematika"
              onSwitchMapel={(m) =>
                setActiveTab(m === 'Matematika' ? 'bank_soal_mtk' : 'bank_soal_ind')
              }
              onRefreshState={refreshState}
            />
          )}
          {activeTab === 'bank_soal_ind' && (
            <AdminQuestionBank
              db={db}
              fixedMataUji="Bahasa Indonesia"
              onSwitchMapel={(m) =>
                setActiveTab(m === 'Matematika' ? 'bank_soal_mtk' : 'bank_soal_ind')
              }
              onRefreshState={refreshState}
            />
          )}
          {activeTab === 'simpan_data' && (
            <AdminSaveData
              db={db}
              onRefreshState={refreshState}
              onNavigate={(tab) => setActiveTab(tab)}
            />
          )}
          {activeTab === 'buat_ujian' && (
            <AdminExams
              db={db}
              mode="create"
              onSwitchMode={(m) => setActiveTab(m === 'create' ? 'buat_ujian' : 'jadwal_ujian')}
              onRefreshState={refreshState}
            />
          )}
          {activeTab === 'jadwal_ujian' && (
            <AdminExams
              db={db}
              mode="schedule"
              onSwitchMode={(m) => setActiveTab(m === 'create' ? 'buat_ujian' : 'jadwal_ujian')}
              onRefreshState={refreshState}
            />
          )}
          {activeTab === 'monitoring' && (
            <AdminReports db={db} view="monitoring" onRefreshState={refreshState} />
          )}
          {activeTab === 'hasil_ujian' && (
            <AdminReports db={db} view="hasil" onRefreshState={refreshState} />
          )}
          {activeTab === 'analisis_nilai' && (
            <AdminReports db={db} view="analisis" onRefreshState={refreshState} />
          )}
          {activeTab === 'pengaturan' && (
            <AdminSettings db={db} onRefreshState={refreshState} />
          )}
        </main>
      </div>
    </div>
  );
}

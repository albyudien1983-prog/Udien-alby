import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpenCheck,
  GraduationCap,
  KeyRound,
  ShieldCheck,
  User,
} from 'lucide-react';
import { DEFAULT_SCHOOL_LOGO, HERO_BANNER_IMAGE } from '../data/demoData.ts';
import { loginUser } from '../services/api.ts';
import type { AuthSession, SchoolProfile } from '../types.ts';

interface LoginScreenProps {
  school: SchoolProfile;
  onLoginSuccess: (auth: AuthSession) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ school, onLoginSuccess }) => {
  const [role, setRole] = useState<'student' | 'admin'>('student');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRoleSwitch = (nextRole: 'student' | 'admin') => {
    setRole(nextRole);
    setError('');
    setIdentifier('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await loginUser(role, identifier, password);
      onLoginSuccess(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke sistem.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Top School Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-6">
          <div className="flex items-center gap-3.5 min-w-0">
            <img
              src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
              alt={`Logo ${school.namaSekolah}`}
              referrerPolicy="no-referrer"
              className="h-11 w-11 rounded-lg object-contain p-0.5 border border-slate-200 bg-white shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-[#0F2547] tracking-tight truncate">
                TKA SMART EXAM MI/SD
              </h1>
              <p className="text-xs text-slate-500 truncate">
                {school.namaSekolah} · Tahun Pelajaran {school.tahunPelajaran}
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-3 text-xs font-medium text-slate-600 whitespace-nowrap shrink-0">
            <span>{school.jenjang}</span>
            <span aria-hidden="true">·</span>
            <span>Asesmen Kelas {school.kelasDefault}</span>
          </div>
        </div>
      </header>

      {/* Main Split Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Editorial Panel */}
          <div className="lg:col-span-7 bg-[#0F2547] text-white rounded-2xl overflow-hidden border border-[#1E3A6E] flex flex-col justify-between">
            <div className="p-7 sm:p-8 space-y-4">
              <p className="text-xs font-medium text-sky-300 tracking-wide">
                Tes Kemampuan Akademik · {school.namaSekolah}
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold leading-tight text-balance">
                Evaluasi Numerasi &amp; Literasi Membaca Siswa Kelas VI
              </h2>
              <p className="text-sm sm:text-[15px] text-slate-200 leading-relaxed max-w-xl">
                Platform ujian terpadu untuk melatih penalaran matematis dan pemahaman bacaan siswa
                Madrasah Ibtidaiyah secara nyaman, terstruktur, dan akurat.
              </p>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="rounded-xl bg-white/10 border border-white/15 p-3.5">
                  <div className="flex items-center gap-2 text-sky-300 text-xs font-semibold mb-1">
                    <BookOpenCheck className="h-4 w-4" />
                    <span>Matematika</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    Bilangan, pecahan, geometri bangun ruang, diagram, dan pemecahan masalah.
                  </p>
                </div>
                <div className="rounded-xl bg-white/10 border border-white/15 p-3.5">
                  <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold mb-1">
                    <GraduationCap className="h-4 w-4" />
                    <span>Bahasa Indonesia</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    Ide pokok, informasi tersurat-tersirat, teks sastra, tabel, dan penalaran.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative h-52 sm:h-64 w-full overflow-hidden border-t border-white/10">
              <img
                src={HERO_BANNER_IMAGE}
                alt="Siswa Kelas VI Madrasah Ibtidaiyah mengikuti ujian digital"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0F2547]/80 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-6 right-6 flex items-center justify-between text-xs text-slate-200">
                <span>Kepala Madrasah: {school.namaKepalaMadrasah}</span>
                <span className="hidden sm:inline">Kelas {school.kelasDefault}</span>
              </div>
            </div>
          </div>

          {/* Right Login Card */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-7 sm:p-8 flex flex-col justify-center">
            <div className="space-y-2 mb-6">
              <h3 className="text-xl font-bold text-[#0F2547]">Masuk ke Aplikasi Ujian</h3>
              <p className="text-sm text-slate-500">
                Pilih peran Anda dan masukkan data login yang telah diberikan.
              </p>
            </div>

            {/* Role Segmented Tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mb-6">
              <button
                type="button"
                onClick={() => handleRoleSwitch('student')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  role === 'student'
                    ? 'bg-white text-[#0F2547] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <GraduationCap className="h-4 w-4" />
                <span>Peserta Didik</span>
              </button>
              <button
                type="button"
                onClick={() => handleRoleSwitch('admin')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  role === 'admin'
                    ? 'bg-white text-[#0F2547] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Admin / Guru</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  {role === 'student' ? 'Nomor Peserta / Username' : 'Username Admin / Guru'}
                </label>
                <div className="relative">
                  <User className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={role === 'student' ? 'Masukkan nomor peserta' : 'Masukkan username admin'}
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Kata Sandi
                </label>
                <div className="relative">
                  <KeyRound className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi"
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  />
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer"
              >
                <span>{loading ? 'Memeriksa Akun...' : role === 'student' ? 'Masuk ke Ruang Ujian' : 'Masuk ke Dashboard Guru'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            {/* Login Guidance */}
            <div className="mt-6 pt-5 border-t border-slate-200 text-xs text-slate-500">
              {role === 'student' ? (
                <p>
                  Gunakan <strong>Nomor Peserta</strong> dan <strong>Kata Sandi</strong> yang
                  tertera pada Kartu Peserta Ujian dari madrasah.
                </p>
              ) : (
                <p>
                  Masuk sebagai <strong>Admin / Guru</strong> untuk mengelola data peserta, bank
                  soal, jadwal, dan laporan hasil ujian.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="py-4 px-6 text-center text-xs text-slate-500 border-t border-slate-200 bg-white">
        {school.namaSekolah} · Sistem Asesmen TKA Kelas VI · {school.tahunPelajaran}
      </footer>
    </div>
  );
};

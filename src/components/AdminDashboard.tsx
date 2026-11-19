import React, { useMemo } from 'react';
import {
  Award,
  BookOpen,
  ClipboardCheck,
  Copy,
  FileSpreadsheet,
  GraduationCap,
  Layers,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { AppDatabase } from '../types.ts';

interface AdminDashboardProps {
  db: AppDatabase;
  onNavigate: (tab: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ db, onNavigate }) => {
  const submittedSessions = useMemo(
    () => db.sessions.filter((s) => s.status === 'submitted'),
    [db.sessions]
  );

  const uniqueStudentsDone = useMemo(() => {
    const ids = new Set(submittedSessions.map((s) => s.studentId));
    return ids.size;
  }, [submittedSessions]);

  const studentsNotDone = Math.max(0, db.students.length - uniqueStudentsDone);
  const activeExams = db.exams.filter((e) => e.aktif);

  const scores = submittedSessions.map((s) => s.nilaiAkhir);
  const avgScore =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : 0;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;

  // Chart 1: Score distribution buckets
  const distributionBuckets = useMemo(() => {
    const buckets = [
      { label: '0–59', count: 0, color: '#EA580C' },
      { label: '60–69', count: 0, color: '#F59E0B' },
      { label: '70–79', count: 0, color: '#0284C7' },
      { label: '80–89', count: 0, color: '#0D9488' },
      { label: '90–100', count: 0, color: '#059669' },
    ];
    for (const s of submittedSessions) {
      if (s.nilaiAkhir < 60) buckets[0].count += 1;
      else if (s.nilaiAkhir < 70) buckets[1].count += 1;
      else if (s.nilaiAkhir < 80) buckets[2].count += 1;
      else if (s.nilaiAkhir < 90) buckets[3].count += 1;
      else buckets[4].count += 1;
    }
    return buckets;
  }, [submittedSessions]);

  // Chart 2: Matematika vs Bahasa Indonesia comparison
  const subjectComparison = useMemo(() => {
    const examMap = new Map(db.exams.map((e) => [e.id, e]));
    const mathScores: number[] = [];
    const bindoScores: number[] = [];

    for (const s of submittedSessions) {
      const ex = examMap.get(s.examId);
      if (!ex) continue;
      if (ex.mataUji === 'Matematika') mathScores.push(s.nilaiAkhir);
      else if (ex.mataUji === 'Bahasa Indonesia') bindoScores.push(s.nilaiAkhir);
    }

    const avg = (arr: number[]) =>
      arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;

    return [
      { label: 'Matematika', avg: avg(mathScores), count: mathScores.length, color: '#0284C7' },
      {
        label: 'Bahasa Indonesia',
        avg: avg(bindoScores),
        count: bindoScores.length,
        color: '#059669',
      },
    ];
  }, [db.exams, submittedSessions]);

  // Chart 3: Pass Rate (Ketuntasan)
  const passSummary = useMemo(() => {
    const passed = submittedSessions.filter((s) => s.tuntas).length;
    const failed = submittedSessions.length - passed;
    const pct =
      submittedSessions.length > 0
        ? Math.round((passed / submittedSessions.length) * 100)
        : 0;
    return { passed, failed, pct };
  }, [submittedSessions]);

  // Chart 4: Class Summary
  const classSummary = useMemo(() => {
    return db.classes.map((cls) => {
      const classStudents = db.students.filter((st) => st.kelasId === cls.id);
      const classStudentIds = new Set(classStudents.map((st) => st.id));
      const classSessions = submittedSessions.filter((s) => classStudentIds.has(s.studentId));
      const avg =
        classSessions.length > 0
          ? Math.round(
              (classSessions.reduce((a, b) => a + b.nilaiAkhir, 0) / classSessions.length) * 10
            ) / 10
          : 0;
      return {
        id: cls.id,
        namaKelas: cls.namaKelas,
        totalSiswa: classStudents.length,
        jumlahSubmit: classSessions.length,
        avg,
      };
    });
  }, [db.classes, db.students, submittedSessions]);

  const maxBucket = Math.max(...distributionBuckets.map((b) => b.count), 1);

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#0F2547]">Dashboard Evaluasi TKA</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {db.school.namaSekolah} · Tahun Pelajaran {db.school.tahunPelajaran}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('bank_soal_mtk')}
            className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
          >
            Bank Soal Matematika
          </button>
          <button
            type="button"
            onClick={() => onNavigate('bank_soal_ind')}
            className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
          >
            Bank Soal B. Indonesia
          </button>
          <button
            type="button"
            onClick={() => onNavigate('buat_ujian')}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            + Buat Ujian Baru
          </button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Peserta Didik</span>
            <Users className="h-4 w-4 text-sky-600" />
          </div>
          <p className="text-3xl font-bold text-[#0F2547] tabular-nums mt-2">{db.students.length}</p>
          <p className="text-xs text-slate-500 mt-1">
            {db.classes.length} kelas aktif · {uniqueStudentsDone} sudah ujian
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Total Bank Soal</span>
            <BookOpen className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-3xl font-bold text-[#0F2547] tabular-nums mt-2">{db.questions.length}</p>
          <p className="text-xs text-slate-500 mt-1">
            {db.questions.filter((q) => q.mataUji === 'Matematika').length} MTK ·{' '}
            {db.questions.filter((q) => q.mataUji === 'Bahasa Indonesia').length} B. Indonesia
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Ujian Aktif &amp; Partisipasi</span>
            <ClipboardCheck className="h-4 w-4 text-orange-600" />
          </div>
          <p className="text-3xl font-bold text-[#0F2547] tabular-nums mt-2">{activeExams.length}</p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {uniqueStudentsDone} sudah mengerjakan · {studentsNotDone} belum
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Rata-rata / Tertinggi / Terendah</span>
            <Award className="h-4 w-4 text-sky-600" />
          </div>
          <p className="text-3xl font-bold text-[#0F2547] tabular-nums mt-2">{avgScore}</p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            Tertinggi {maxScore} · Terendah {minScore}
          </p>
        </div>
      </div>

      {/* Mata Uji Utama & Token Aktif */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-bold text-[#0F2547]">Mata Uji Utama TKA MI/SD</h3>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => onNavigate('bank_soal_mtk')}
              className="w-full text-left flex items-center justify-between p-3.5 rounded-xl bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-300 transition-colors cursor-pointer"
            >
              <div>
                <p className="text-sm font-bold text-[#0F2547]">Bank Soal Matematika</p>
                <p className="text-xs text-slate-500">Numerasi dan penalaran matematis</p>
              </div>
              <span className="font-mono text-sm font-bold text-sky-700 tabular-nums">
                {db.questions.filter((q) => q.mataUji === 'Matematika').length} Soal →
              </span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('bank_soal_ind')}
              className="w-full text-left flex items-center justify-between p-3.5 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 transition-colors cursor-pointer"
            >
              <div>
                <p className="text-sm font-bold text-[#0F2547]">Bank Soal Bahasa Indonesia</p>
                <p className="text-xs text-slate-500">Literasi membaca dan pemahaman teks</p>
              </div>
              <span className="font-mono text-sm font-bold text-emerald-700 tabular-nums">
                {db.questions.filter((q) => q.mataUji === 'Bahasa Indonesia').length} Soal →
              </span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0F2547]">Token Ujian Aktif Saat Ini</h3>
            <button
              type="button"
              onClick={() => onNavigate('jadwal_ujian')}
              className="text-xs font-semibold text-sky-600 hover:underline cursor-pointer"
            >
              Atur Jadwal →
            </button>
          </div>
          {activeExams.length === 0 ? (
            <p className="text-sm text-slate-500">Tidak ada ujian aktif saat ini.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {activeExams.map((ex) => (
                <div
                  key={ex.id}
                  className="rounded-xl border border-slate-200 p-4 flex flex-col justify-between gap-3"
                >
                  <div>
                    <p className="text-xs text-slate-500">{ex.mataUji}</p>
                    <p className="text-sm font-bold text-[#0F2547] line-clamp-1 mt-0.5">
                      {ex.namaUjian}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="font-mono text-base font-bold tracking-wider text-sky-700">
                      {ex.token}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(ex.token)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>Salin</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4 Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Chart 1: Distribusi Nilai */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0F2547] flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-sky-600" />
              <span>Distribusi Nilai Peserta</span>
            </h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {submittedSessions.length} hasil tercatat
            </span>
          </div>

          <div className="h-48 flex items-end justify-around gap-3 pt-4 pb-2 border-b border-slate-200">
            {distributionBuckets.map((b) => {
              const heightPct = Math.round((b.count / maxBucket) * 100);
              return (
                <div key={b.label} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className="text-xs font-mono font-bold text-slate-700 tabular-nums">
                    {b.count}
                  </span>
                  <div className="w-full max-w-[44px] flex-1 flex items-end">
                    <div
                      className="w-full rounded-t-lg transition-all"
                      style={{
                        height: `${Math.max(b.count > 0 ? 14 : 4, heightPct)}%`,
                        backgroundColor: b.color,
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono text-slate-600">{b.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chart 2: Perbandingan Matematika vs Bahasa Indonesia */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0F2547] flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span>Perbandingan Matematika &amp; Bahasa Indonesia</span>
            </h3>
            <span className="text-xs text-slate-500">Rata-rata nilai</span>
          </div>

          <div className="space-y-5 pt-3">
            {subjectComparison.map((sub) => (
              <div key={sub.label} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-800">{sub.label}</span>
                  <span className="font-mono font-bold text-[#0F2547] tabular-nums">
                    {sub.avg} <span className="text-xs font-normal text-slate-500">({sub.count} peserta)</span>
                  </span>
                </div>
                <div className="h-6 rounded-xl bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-xl transition-all"
                    style={{
                      width: `${Math.min(100, sub.avg)}%`,
                      backgroundColor: sub.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chart 3: Persentase Ketuntasan */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0F2547] flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-emerald-600" />
              <span>Persentase Ketuntasan Belajar</span>
            </h3>
            <span className="text-xs text-slate-500">Berdasar KKM ujian</span>
          </div>

          <div className="flex items-center gap-6 py-2">
            {(() => {
              const r = 46;
              const circ = 2 * Math.PI * r;
              const offset = circ - (passSummary.pct / 100) * circ;
              return (
                <svg viewBox="0 0 120 120" className="w-32 h-32 shrink-0">
                  <circle cx="60" cy="60" r={r} fill="none" stroke="#E2E8F0" strokeWidth="14" />
                  <circle
                    cx="60"
                    cy="60"
                    r={r}
                    fill="none"
                    stroke="#059669"
                    strokeWidth="14"
                    strokeDasharray={circ}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    transform="rotate(-90 60 60)"
                  />
                  <text
                    x="60"
                    y="64"
                    textAnchor="middle"
                    fontSize="20"
                    fontWeight="700"
                    fill="#0F2547"
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {passSummary.pct}%
                  </text>
                </svg>
              );
            })()}

            <div className="space-y-3 text-sm flex-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Tuntas (≥ KKM)</span>
                <span className="font-mono font-bold text-emerald-700 tabular-nums">
                  {passSummary.passed} sesi
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Belum Tuntas</span>
                <span className="font-mono font-bold text-orange-600 tabular-nums">
                  {passSummary.failed} sesi
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-slate-600">Total Evaluasi</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {submittedSessions.length} sesi
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Chart 4: Rekap Hasil Setiap Kelas */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0F2547] flex items-center gap-2">
              <Layers className="h-4 w-4 text-sky-600" />
              <span>Rekap Hasil Setiap Kelas</span>
            </h3>
            <span className="text-xs text-slate-500">Rata-rata kelas</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 text-left font-semibold">Kelas</th>
                  <th className="py-2 text-right font-semibold">Peserta</th>
                  <th className="py-2 text-right font-semibold">Sesi Selesai</th>
                  <th className="py-2 text-right font-semibold">Rata-rata</th>
                </tr>
              </thead>
              <tbody>
                {classSummary.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-3 font-semibold text-[#0F2547]">{c.namaKelas}</td>
                    <td className="py-3 text-right font-mono tabular-nums text-slate-700">
                      {c.totalSiswa}
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums text-slate-700">
                      {c.jumlahSubmit}
                    </td>
                    <td className="py-3 text-right font-mono font-bold tabular-nums text-sky-700">
                      {c.avg}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

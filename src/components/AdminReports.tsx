import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  Printer,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';
import { DEFAULT_SCHOOL_LOGO } from '../data/demoData.ts';
import { resetStudentExamSessions } from '../services/api.ts';
import type { AppDatabase, ExamSession, MataUji } from '../types.ts';
import { exportRowsToCsv, isAnswerProvided } from '../utils/scoring.ts';

interface AdminReportsProps {
  db: AppDatabase;
  view: 'monitoring' | 'hasil' | 'analisis';
  onRefreshState: () => Promise<void>;
}

export const AdminReports: React.FC<AdminReportsProps> = ({ db, view, onRefreshState }) => {
  const [selectedExamId, setSelectedExamId] = useState<string>(db.exams[0]?.id || 'ALL');
  const [filterKelasId, setFilterKelasId] = useState<string>('ALL');
  const [filterMataUji, setFilterMataUji] = useState<'ALL' | MataUji>('ALL');
  const [sortBy, setSortBy] = useState<'score_desc' | 'score_asc' | 'name_asc'>('score_desc');

  const [detailSession, setDetailSession] = useState<ExamSession | null>(null);
  const [printStudentCard, setPrintStudentCard] = useState<ExamSession | null>(null);
  const [confirmReset, setConfirmReset] = useState<{
    examId: string;
    studentId: string;
    studentName: string;
  } | null>(null);
  const [feedback, setFeedback] = useState('');

  const studentMap = useMemo(() => new Map(db.students.map((s) => [s.id, s])), [db.students]);
  const classMap = useMemo(() => new Map(db.classes.map((c) => [c.id, c])), [db.classes]);
  const examMap = useMemo(() => new Map(db.exams.map((e) => [e.id, e])), [db.exams]);
  const questionMap = useMemo(() => new Map(db.questions.map((q) => [q.id, q])), [db.questions]);

  // ==================== MONITORING VIEW ====================
  const monitorExam = useMemo(
    () => db.exams.find((e) => e.id === selectedExamId) || db.exams[0],
    [db.exams, selectedExamId]
  );

  const monitorRows = useMemo(() => {
    if (!monitorExam) return [];
    const targetStudents = db.students.filter((st) =>
      monitorExam.kelasIds.includes(st.kelasId)
    );
    return targetStudents.map((st) => {
      const sessions = db.sessions.filter(
        (s) => s.examId === monitorExam.id && s.studentId === st.id
      );
      const inProgress = sessions.find((s) => s.status === 'in_progress');
      const submitted = sessions
        .filter((s) => s.status === 'submitted')
        .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))[0];

      const active = inProgress || submitted;
      let answeredCount = 0;
      if (active) {
        answeredCount = active.questionOrder.filter((qid) => {
          const q = questionMap.get(qid);
          return q ? isAnswerProvided(q, active.answers[qid]) : false;
        }).length;
      }

      return {
        student: st,
        kelas: classMap.get(st.kelasId)?.namaKelas || '-',
        status: inProgress ? 'in_progress' : submitted ? 'submitted' : 'not_started',
        session: active,
        answeredCount,
        totalQuestions: monitorExam.questionIds.length,
        attemptCount: sessions.length,
      };
    });
  }, [monitorExam, db.students, db.sessions, classMap, questionMap]);

  // ==================== HASIL UJIAN VIEW ====================
  const submittedResults = useMemo(() => {
    const list = db.sessions.filter((s) => {
      if (s.status !== 'submitted') return false;
      if (selectedExamId !== 'ALL' && s.examId !== selectedExamId) return false;
      const st = studentMap.get(s.studentId);
      const ex = examMap.get(s.examId);
      if (!st || !ex) return false;
      if (filterKelasId !== 'ALL' && st.kelasId !== filterKelasId) return false;
      if (filterMataUji !== 'ALL' && ex.mataUji !== filterMataUji) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'score_desc') return b.nilaiAkhir - a.nilaiAkhir;
      if (sortBy === 'score_asc') return a.nilaiAkhir - b.nilaiAkhir;
      const nameA = studentMap.get(a.studentId)?.nama || '';
      const nameB = studentMap.get(b.studentId)?.nama || '';
      return nameA.localeCompare(nameB);
    });
  }, [db.sessions, selectedExamId, filterKelasId, filterMataUji, sortBy, studentMap, examMap]);

  // ==================== ANALISIS NILAI VIEW ====================
  const materiAnalysis = useMemo(() => {
    const map = new Map<
      string,
      {
        mataUji: MataUji;
        materi: string;
        totalAsked: number;
        totalCorrect: number;
        earnedSum: number;
        maxSum: number;
      }
    >();

    for (const ses of submittedResults) {
      for (const mb of ses.materiBreakdown) {
        const key = `${mb.mataUji}::${mb.materi}`;
        const cur = map.get(key) || {
          mataUji: mb.mataUji,
          materi: mb.materi,
          totalAsked: 0,
          totalCorrect: 0,
          earnedSum: 0,
          maxSum: 0,
        };
        cur.totalAsked += mb.totalQuestions;
        cur.totalCorrect += mb.correctCount;
        cur.earnedSum += mb.earnedScore;
        cur.maxSum += mb.maxScore;
        map.set(key, cur);
      }
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        masteryPct: item.maxSum > 0 ? Math.round((item.earnedSum / item.maxSum) * 1000) / 10 : 0,
      }))
      .sort((a, b) => a.masteryPct - b.masteryPct);
  }, [submittedResults]);

  const itemAnalysis = useMemo(() => {
    const map = new Map<
      string,
      { questionId: string; totalAttempted: number; correctCount: number }
    >();
    for (const ses of submittedResults) {
      for (const det of ses.questionDetails) {
        const cur = map.get(det.questionId) || {
          questionId: det.questionId,
          totalAttempted: 0,
          correctCount: 0,
        };
        cur.totalAttempted += 1;
        if (det.isCorrect) cur.correctCount += 1;
        map.set(det.questionId, cur);
      }
    }
    return Array.from(map.values())
      .map((item) => {
        const q = questionMap.get(item.questionId);
        const pct =
          item.totalAttempted > 0
            ? Math.round((item.correctCount / item.totalAttempted) * 100)
            : 0;
        return { ...item, question: q, pct };
      })
      .sort((a, b) => a.pct - b.pct);
  }, [submittedResults, questionMap]);

  const handleResetStudent = async () => {
    if (!confirmReset) return;
    await resetStudentExamSessions(confirmReset.examId, confirmReset.studentId);
    setFeedback(`Sesi ujian "${confirmReset.studentName}" berhasil direset.`);
    setConfirmReset(null);
    await onRefreshState();
  };

  const handleExportResultsCsv = () => {
    exportRowsToCsv(
      'laporan-hasil-tka.csv',
      [
        'No. Peserta',
        'Nama Siswa',
        'Kelas',
        'Nama Ujian',
        'Mata Uji',
        'Jumlah Soal',
        'Benar',
        'Salah',
        'Kosong',
        'Nilai Akhir',
        'Keterangan',
      ],
      submittedResults.map((ses) => {
        const st = studentMap.get(ses.studentId);
        const ex = examMap.get(ses.examId);
        const cls = st ? classMap.get(st.kelasId)?.namaKelas || '-' : '-';
        return [
          st?.nomorPeserta || '-',
          st?.nama || '-',
          cls,
          ex?.namaUjian || '-',
          ex?.mataUji || '-',
          ses.jumlahSoal,
          ses.jumlahBenar,
          ses.jumlahSalah,
          ses.tidakDijawab,
          ses.nilaiAkhir,
          ses.tuntas ? 'Tuntas' : 'Belum Tuntas',
        ];
      })
    );
  };

  // ==================== INDIVIDUAL PRINT CARD VIEW ====================
  if (printStudentCard) {
    const st = studentMap.get(printStudentCard.studentId);
    const ex = examMap.get(printStudentCard.examId);
    const cls = st ? classMap.get(st.kelasId)?.namaKelas : '-';

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between no-print">
          <button
            type="button"
            onClick={() => setPrintStudentCard(null)}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 cursor-pointer"
          >
            ← Kembali ke Daftar Hasil
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0F2547] text-white text-sm font-semibold cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span>Cetak / Unduh PDF Kartu Hasil</span>
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-300 p-8 max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-4 pb-4 border-b-2 border-[#0F2547]">
            <img
              src={db.school.logoUrl || DEFAULT_SCHOOL_LOGO}
              alt={db.school.namaSekolah}
              referrerPolicy="no-referrer"
              className="h-14 w-14 rounded-lg object-contain p-0.5 bg-white border border-slate-200"
            />
            <div>
              <h2 className="text-lg font-bold text-[#0F2547]">{db.school.namaSekolah}</h2>
              <p className="text-xs text-slate-600">{db.school.alamat}</p>
              <p className="text-xs font-semibold text-slate-700 mt-0.5">
                KARTU HASIL TES KEMAMPUAN AKADEMIK (TKA) · TP {db.school.tahunPelajaran}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-500 text-xs">Nama Peserta</span>
              <p className="font-bold text-slate-900">{st?.nama}</p>
            </div>
            <div>
              <span className="text-slate-500 text-xs">Nomor Peserta</span>
              <p className="font-mono font-bold text-slate-900">{st?.nomorPeserta}</p>
            </div>
            <div>
              <span className="text-slate-500 text-xs">Kelas / Rombel</span>
              <p className="font-semibold text-slate-900">{cls}</p>
            </div>
            <div>
              <span className="text-slate-500 text-xs">Mata Uji</span>
              <p className="font-semibold text-slate-900">{ex?.mataUji}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Nama Ujian</p>
              <p className="text-sm font-bold text-[#0F2547]">{ex?.namaUjian}</p>
              <p className="text-xs text-slate-600 mt-1 tabular-nums">
                Benar: {printStudentCard.jumlahBenar} · Salah: {printStudentCard.jumlahSalah} ·
                Kosong: {printStudentCard.tidakDijawab} (dari {printStudentCard.jumlahSoal} soal)
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Nilai Akhir</p>
              <p className="text-3xl font-extrabold font-mono text-[#0F2547] tabular-nums">
                {printStudentCard.nilaiAkhir}
              </p>
              <p
                className={`text-xs font-bold ${
                  printStudentCard.tuntas ? 'text-emerald-700' : 'text-orange-700'
                }`}
              >
                {printStudentCard.tuntas ? 'TUNTAS' : 'BELUM TUNTAS'}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-[#0F2547] uppercase tracking-wide">
              Ringkasan Capaian Materi
            </h4>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-300 text-slate-600">
                  <th className="py-1.5 text-left">Materi</th>
                  <th className="py-1.5 text-right">Benar/Soal</th>
                  <th className="py-1.5 text-right">Capaian</th>
                </tr>
              </thead>
              <tbody>
                {printStudentCard.materiBreakdown.map((m, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-1.5 text-slate-800">{m.materi}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {m.correctCount}/{m.totalQuestions}
                    </td>
                    <td className="py-1.5 text-right font-mono font-bold tabular-nums">
                      {m.percentage}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-8 pt-6 text-xs text-slate-700">
            <div>
              <p>Mengetahui,</p>
              <p>Kepala Madrasah</p>
              <p className="mt-14 font-bold underline">{db.school.namaKepalaMadrasah}</p>
            </div>
            <div className="text-right">
              <p>Paron, {new Date().toLocaleDateString('id-ID')}</p>
              <p>Operator / Proktor TKA</p>
              <p className="mt-14 font-bold underline">{db.school.namaOperator}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-2xl font-bold text-[#0F2547]">
            {view === 'monitoring'
              ? 'Monitoring Pelaksanaan Ujian'
              : view === 'hasil'
                ? 'Laporan Hasil Ujian TKA'
                : 'Analisis Nilai & Capaian Materi'}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {view === 'monitoring'
              ? 'Pantau progres peserta secara langsung dan reset sesi ujian bila diperlukan.'
              : view === 'hasil'
                ? 'Rekapitulasi nilai akhir siswa, cetak PDF laporan kelas, kartu hasil, dan ekspor CSV.'
                : 'Pemetaan ketuntasan materi dan tingkat kesulitan butir soal untuk tindak lanjut pembelajaran.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRefreshState}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Segarkan Data</span>
          </button>
          {view === 'hasil' && (
            <>
              <button
                type="button"
                onClick={handleExportResultsCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Ekspor Excel/CSV</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F2547] hover:bg-[#173566] text-white text-xs font-semibold cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Cetak / Unduh PDF</span>
              </button>
            </>
          )}
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 flex items-center justify-between no-print">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback('')} className="cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ==================== MONITORING VIEW ==================== */}
      {view === 'monitoring' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-700">Pilih Ujian:</label>
              <select
                value={monitorExam?.id || ''}
                onChange={(e) => setSelectedExamId(e.target.value)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-sm bg-white"
              >
                {db.exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.namaUjian} ({ex.token})
                  </option>
                ))}
              </select>
            </div>
            {monitorExam && (
              <div className="text-xs text-slate-600 tabular-nums">
                Selesai:{' '}
                <strong className="text-emerald-700">
                  {monitorRows.filter((r) => r.status === 'submitted').length}
                </strong>{' '}
                · Sedang Mengerjakan:{' '}
                <strong className="text-sky-700">
                  {monitorRows.filter((r) => r.status === 'in_progress').length}
                </strong>{' '}
                · Belum Mulai:{' '}
                <strong className="text-slate-700">
                  {monitorRows.filter((r) => r.status === 'not_started').length}
                </strong>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <th className="py-3 px-3 text-left font-semibold">No. Peserta</th>
                  <th className="py-3 px-3 text-left font-semibold">Nama Peserta</th>
                  <th className="py-3 px-3 text-left font-semibold">Kelas</th>
                  <th className="py-3 px-3 text-left font-semibold">Status Ujian</th>
                  <th className="py-3 px-3 text-right font-semibold">Progres</th>
                  <th className="py-3 px-3 text-right font-semibold">Pindah Tab</th>
                  <th className="py-3 px-3 text-right font-semibold">Nilai</th>
                  <th className="py-3 px-3 text-right font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {monitorRows.map((row) => (
                  <tr key={row.student.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="py-3 px-3 font-mono font-semibold text-[#0F2547]">
                      {row.student.nomorPeserta}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-900">{row.student.nama}</td>
                    <td className="py-3 px-3 text-slate-600">{row.kelas}</td>
                    <td className="py-3 px-3">
                      {row.status === 'submitted' ? (
                        <span className="text-xs font-semibold text-emerald-700">
                          Selesai ({row.attemptCount}x)
                        </span>
                      ) : row.status === 'in_progress' ? (
                        <span className="text-xs font-semibold text-sky-700">
                          Sedang Mengerjakan
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">Belum Memulai</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                      {row.session ? `${row.answeredCount}/${row.totalQuestions}` : '-'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                      {row.session ? `${row.session.tabLeaveCount}x` : '-'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-[#0F2547]">
                      {row.status === 'submitted' && row.session ? row.session.nilaiAkhir : '-'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {row.session && monitorExam && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmReset({
                              examId: monitorExam.id,
                              studentId: row.student.id,
                              studentName: row.student.nama,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-300 cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Reset Ujian</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== HASIL UJIAN & ANALISIS FILTERS ==================== */}
      {(view === 'hasil' || view === 'analisis') && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 no-print">
          <select
            value={selectedExamId}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
          >
            <option value="ALL">Semua Ujian</option>
            {db.exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.namaUjian}
              </option>
            ))}
          </select>

          <select
            value={filterKelasId}
            onChange={(e) => setFilterKelasId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
          >
            <option value="ALL">Semua Kelas</option>
            {db.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.namaKelas}
              </option>
            ))}
          </select>

          <select
            value={filterMataUji}
            onChange={(e) => setFilterMataUji(e.target.value as 'ALL' | MataUji)}
            className="px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
          >
            <option value="ALL">Semua Mata Uji</option>
            <option value="Matematika">Matematika</option>
            <option value="Bahasa Indonesia">Bahasa Indonesia</option>
          </select>

          {view === 'hasil' && (
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as 'score_desc' | 'score_asc' | 'name_asc')
              }
              className="px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
            >
              <option value="score_desc">Urutkan: Nilai Tertinggi → Terendah</option>
              <option value="score_asc">Urutkan: Nilai Terendah → Tertinggi</option>
              <option value="name_asc">Urutkan: Nama Siswa A–Z</option>
            </select>
          )}
        </div>
      )}

      {/* ==================== HASIL UJIAN TABLE ==================== */}
      {view === 'hasil' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
          {/* Print Header Only */}
          <div className="hidden print-only pb-4 border-b-2 border-[#0F2547]">
            <div className="flex items-center gap-4">
              <img
                src={db.school.logoUrl || DEFAULT_SCHOOL_LOGO}
                alt={db.school.namaSekolah}
                className="h-12 w-12 object-contain bg-white"
              />
              <div>
                <h2 className="text-lg font-bold text-[#0F2547]">{db.school.namaSekolah}</h2>
                <p className="text-xs text-slate-600">
                  Laporan Hasil Tes Kemampuan Akademik (TKA) · TP {db.school.tahunPelajaran}
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                  <th className="py-3 px-2.5 text-left font-semibold">No. Peserta</th>
                  <th className="py-3 px-2.5 text-left font-semibold">Nama Siswa</th>
                  <th className="py-3 px-2.5 text-left font-semibold">Kelas</th>
                  <th className="py-3 px-2.5 text-left font-semibold">Ujian / Mata Uji</th>
                  <th className="py-3 px-2.5 text-right font-semibold">Soal</th>
                  <th className="py-3 px-2.5 text-right font-semibold">Benar</th>
                  <th className="py-3 px-2.5 text-right font-semibold">Salah</th>
                  <th className="py-3 px-2.5 text-right font-semibold">Kosong</th>
                  <th className="py-3 px-2.5 text-right font-semibold">Nilai</th>
                  <th className="py-3 px-2.5 text-left font-semibold">Keterangan</th>
                  <th className="py-3 px-2.5 text-right font-semibold no-print">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {submittedResults.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-10 text-center text-slate-500">
                      Belum ada hasil ujian yang sesuai dengan filter.
                    </td>
                  </tr>
                ) : (
                  submittedResults.map((ses) => {
                    const st = studentMap.get(ses.studentId);
                    const ex = examMap.get(ses.examId);
                    const cls = st ? classMap.get(st.kelasId)?.namaKelas || '-' : '-';
                    return (
                      <tr key={ses.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                        <td className="py-3 px-2.5 font-mono text-xs font-semibold text-[#0F2547]">
                          {st?.nomorPeserta || '-'}
                        </td>
                        <td className="py-3 px-2.5 font-medium text-slate-900">
                          {st?.nama || '-'}
                        </td>
                        <td className="py-3 px-2.5 text-slate-600">{cls}</td>
                        <td className="py-3 px-2.5">
                          <p className="font-medium text-slate-800 text-xs">{ex?.namaUjian}</p>
                          <p className="text-[11px] text-slate-500">{ex?.mataUji}</p>
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono tabular-nums">
                          {ses.jumlahSoal}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                          {ses.jumlahBenar}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono tabular-nums text-red-600">
                          {ses.jumlahSalah}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-500">
                          {ses.tidakDijawab}
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono font-bold tabular-nums text-[#0F2547]">
                          {ses.nilaiAkhir}
                        </td>
                        <td className="py-3 px-2.5">
                          <span
                            className={`text-xs font-semibold ${
                              ses.tuntas ? 'text-emerald-700' : 'text-orange-700'
                            }`}
                          >
                            {ses.tuntas ? 'Tuntas' : 'Belum Tuntas'}
                          </span>
                        </td>
                        <td className="py-3 px-2.5 text-right no-print">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setDetailSession(ses)}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-sky-700 cursor-pointer"
                              title="Lihat Detail Jawaban"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPrintStudentCard(ses)}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-[#0F2547] cursor-pointer"
                              title="Cetak Kartu Hasil Siswa"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="hidden print-only grid-cols-2 gap-8 pt-8 text-xs text-slate-700">
            <div>
              <p>Mengetahui,</p>
              <p>Kepala Madrasah {db.school.namaSekolah}</p>
              <p className="mt-14 font-bold underline">{db.school.namaKepalaMadrasah}</p>
            </div>
            <div className="text-right">
              <p>Paron, {new Date().toLocaleDateString('id-ID')}</p>
              <p>Operator / Proktor TKA</p>
              <p className="mt-14 font-bold underline">{db.school.namaOperator}</p>
            </div>
          </div>
        </div>
      )}

      {/* ==================== ANALISIS NILAI VIEW ==================== */}
      {view === 'analisis' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Capaian Materi */}
          <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-[#0F2547]">Analisis Capaian Materi</h3>
              <p className="text-xs text-slate-500">
                Diurutkan dari materi dengan capaian terendah untuk prioritas penguatan.
              </p>
            </div>
            {materiAnalysis.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                Belum ada data ujian untuk dianalisis.
              </p>
            ) : (
              <div className="space-y-3.5">
                {materiAnalysis.map((m, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">
                        {m.mataUji} · {m.materi}
                      </span>
                      <span className="font-mono font-bold tabular-nums text-[#0F2547]">
                        {m.masteryPct}%{' '}
                        <span className="font-normal text-slate-500">
                          ({m.totalCorrect}/{m.totalAsked})
                        </span>
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          m.masteryPct >= 75
                            ? 'bg-emerald-500'
                            : m.masteryPct >= 55
                              ? 'bg-sky-500'
                              : 'bg-orange-500'
                        }`}
                        style={{ width: `${Math.min(100, m.masteryPct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Analisis Butir Soal */}
          <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-[#0F2547]">Analisis Butir Soal</h3>
              <p className="text-xs text-slate-500">
                Persentase siswa menjawab benar per butir soal.
              </p>
            </div>
            {itemAnalysis.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                Belum ada data pengerjaan soal.
              </p>
            ) : (
              <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
                {itemAnalysis.map((item) => (
                  <div
                    key={item.questionId}
                    className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-bold text-[#0F2547]">
                        {item.questionId} · {item.question?.materi}
                      </p>
                      <p className="text-xs text-slate-600 line-clamp-1">
                        {item.question?.pertanyaan}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-mono font-bold tabular-nums ${
                          item.pct >= 70
                            ? 'text-emerald-700'
                            : item.pct >= 45
                              ? 'text-sky-700'
                              : 'text-orange-700'
                        }`}
                      >
                        {item.pct}%
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {item.correctCount}/{item.totalAttempted} benar
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail Answer Sheet Modal */}
      {detailSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-3xl w-full p-6 space-y-4 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#0F2547]">
                  Lembar Jawaban: {studentMap.get(detailSession.studentId)?.nama}
                </h3>
                <p className="text-xs text-slate-500">
                  Nilai Akhir: <strong className="font-mono">{detailSession.nilaiAkhir}</strong> ·
                  Benar {detailSession.jumlahBenar}/{detailSession.jumlahSoal}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailSession(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {detailSession.questionDetails.map((det, idx) => {
                const q = questionMap.get(det.questionId);
                return (
                  <div
                    key={det.questionId}
                    className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                      det.isCorrect
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : det.isPartial
                          ? 'bg-sky-50/50 border-sky-200'
                          : 'bg-red-50/40 border-red-200'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="text-[#0F2547]">
                        No. {idx + 1} ({det.questionId} · {q?.jenisSoal})
                      </span>
                      <span className="font-mono tabular-nums flex items-center gap-1">
                        {det.isCorrect && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                        {det.earnedScore}/{det.maxScore} poin
                      </span>
                    </div>
                    <p className="text-slate-800">{q?.pertanyaan}</p>
                    <p className="text-slate-600 font-mono">
                      Jawaban Siswa:{' '}
                      {det.isAnswered ? JSON.stringify(det.studentAnswer) : '(Kosong)'}
                    </p>
                    {q?.pembahasan && (
                      <p className="text-slate-600 italic">Pembahasan: {q.pembahasan}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Reset Exam Modal */}
      {confirmReset && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-[#0F2547]">Reset Ujian Peserta?</h3>
            <p className="text-sm text-slate-600">
              Riwayat sesi dan jawaban <strong>{confirmReset.studentName}</strong> pada ujian ini
              akan dihapus sehingga siswa dapat mengerjakan ulang.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmReset(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleResetStudent}
                className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold cursor-pointer"
              >
                Ya, Reset Ujian
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

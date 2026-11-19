import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  CheckCircle2,
  Clock,
  FileCheck2,
  HelpCircle,
  KeyRound,
  LogOut,
  Printer,
  ShieldAlert,
} from 'lucide-react';
import { DEFAULT_SCHOOL_LOGO } from '../data/demoData.ts';
import {
  autosaveExamSession,
  startExamSession,
  submitExamSession,
} from '../services/api.ts';
import type {
  AppDatabase,
  ExamConfig,
  ExamSession,
  Question,
  Student,
  StudentAnswerValue,
} from '../types.ts';
import { formatDurationTimer, isAnswerProvided } from '../utils/scoring.ts';
import { StimulusRenderer } from './StimulusRenderer.tsx';

interface StudentExamFlowProps {
  db: AppDatabase;
  student: Student;
  onSessionUpdated: (session: ExamSession) => void;
  onRefreshState: () => Promise<void>;
  onLogout: () => void;
}

const JENIS_SOAL_LABEL: Record<Question['jenisSoal'], string> = {
  PG: 'Pilihan Ganda',
  PGK: 'Pilihan Ganda Kompleks',
  BS: 'Benar atau Salah',
  MENJODOHKAN: 'Menjodohkan',
  ISIAN: 'Isian Singkat',
};

export const StudentExamFlow: React.FC<StudentExamFlowProps> = ({
  db,
  student,
  onSessionUpdated,
  onRefreshState,
  onLogout,
}) => {
  const studentClass = db.classes.find((c) => c.id === student.kelasId);
  const availableExams = useMemo(() => {
    const list = db.exams.filter((e) => e.kelasIds.includes(student.kelasId));
    return [...list].sort((a, b) => Number(b.aktif) - Number(a.aktif));
  }, [db.exams, student.kelasId]);

  // Recover any active in-progress session automatically
  const existingInProgress = useMemo(
    () =>
      db.sessions.find(
        (s) => s.studentId === student.id && s.status === 'in_progress' && !s.locked
      ) || null,
    [db.sessions, student.id]
  );

  const [selectedExamId, setSelectedExamId] = useState<string>(
    existingInProgress?.examId || availableExams[0]?.id || ''
  );

  useEffect(() => {
    if (availableExams.length === 0) {
      if (selectedExamId) setSelectedExamId('');
      return;
    }
    const exists = availableExams.some((e) => e.id === selectedExamId);
    if (!exists) {
      setSelectedExamId(existingInProgress?.examId || availableExams[0].id);
    }
  }, [availableExams, selectedExamId, existingInProgress]);
  const [tokenInput, setTokenInput] = useState('');
  const [startError, setStartError] = useState('');
  const [starting, setStarting] = useState(false);

  const [activeSession, setActiveSession] = useState<ExamSession | null>(existingInProgress);
  const [completedSession, setCompletedSession] = useState<ExamSession | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, StudentAnswerValue>>(
    existingInProgress?.answers || {}
  );
  const [flaggedIds, setFlaggedIds] = useState<string[]>(existingInProgress?.flaggedIds || []);
  const [tabLeaveCount, setTabLeaveCount] = useState<number>(
    existingInProgress?.tabLeaveCount || 0
  );
  const [showTabWarning, setShowTabWarning] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveNotice, setSaveNotice] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  const autoSubmitTriggeredRef = useRef(false);

  // Sync recovered session if db refreshes
  useEffect(() => {
    if (!activeSession && existingInProgress && !completedSession) {
      setActiveSession(existingInProgress);
      setAnswers(existingInProgress.answers || {});
      setFlaggedIds(existingInProgress.flaggedIds || []);
      setTabLeaveCount(existingInProgress.tabLeaveCount || 0);
    }
  }, [existingInProgress, activeSession, completedSession]);

  const activeExam: ExamConfig | undefined = useMemo(() => {
    const id = activeSession?.examId || completedSession?.examId || selectedExamId;
    return db.exams.find((e) => e.id === id);
  }, [db.exams, activeSession, completedSession, selectedExamId]);

  const orderedQuestions: Question[] = useMemo(() => {
    if (!activeSession) return [];
    const map = new Map(db.questions.map((q) => [q.id, q]));
    return activeSession.questionOrder
      .map((id) => map.get(id))
      .filter((q): q is Question => Boolean(q));
  }, [activeSession, db.questions]);

  const handleFinalSubmit = useCallback(
    async (reason: 'manual' | 'timeout' = 'manual') => {
      if (!activeSession || submitting) return;
      setSubmitting(true);
      try {
        const finalized = await submitExamSession(
          activeSession.id,
          answers,
          flaggedIds,
          tabLeaveCount
        );
        onSessionUpdated(finalized);
        await onRefreshState();
        setActiveSession(null);
        setCompletedSession(finalized);
        setShowFinishModal(false);
        if (reason === 'timeout') {
          setStartError('');
        }
      } catch (err) {
        setStartError(
          err instanceof Error ? err.message : 'Gagal mengirim jawaban. Periksa koneksi Anda.'
        );
      } finally {
        setSubmitting(false);
      }
    },
    [activeSession, submitting, answers, flaggedIds, tabLeaveCount, onSessionUpdated, onRefreshState]
  );

  // Countdown timer + auto submit when reaching 0
  useEffect(() => {
    if (!activeSession) return;
    autoSubmitTriggeredRef.current = false;

    const tick = () => {
      const diff = Math.max(0, Math.floor((activeSession.endsAt - Date.now()) / 1000));
      setSecondsLeft(diff);
      if (diff <= 0 && !autoSubmitTriggeredRef.current) {
        autoSubmitTriggeredRef.current = true;
        handleFinalSubmit('timeout');
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [activeSession, handleFinalSubmit]);

  // Periodic auto-save every 12 seconds while exam is running
  useEffect(() => {
    if (!activeSession) return;
    const timer = window.setInterval(async () => {
      try {
        setSaveNotice('saving');
        const saved = await autosaveExamSession(
          activeSession.id,
          answers,
          flaggedIds,
          tabLeaveCount
        );
        onSessionUpdated(saved);
        setSaveNotice('saved');
      } catch {
        // Keep local answers safely in memory/cache
      }
    }, 12000);
    return () => window.clearInterval(timer);
  }, [activeSession, answers, flaggedIds, tabLeaveCount, onSessionUpdated]);

  // Tab-leave / window blur detector
  useEffect(() => {
    if (!activeSession) return;
    const onVisibilityChange = () => {
      if (document.hidden) {
        setTabLeaveCount((prev) => prev + 1);
        setShowTabWarning(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [activeSession]);

  const persistQuick = useCallback(
    async (
      nextAnswers: Record<string, StudentAnswerValue>,
      nextFlagged: string[],
      nextTabLeaves: number
    ) => {
      if (!activeSession) return;
      try {
        setSaveNotice('saving');
        const updated = await autosaveExamSession(
          activeSession.id,
          nextAnswers,
          nextFlagged,
          nextTabLeaves
        );
        onSessionUpdated(updated);
        setSaveNotice('saved');
      } catch {
        setSaveNotice('idle');
      }
    },
    [activeSession, onSessionUpdated]
  );

  const handleStartExam = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = tokenInput.trim().replace(/\s+/g, '').toUpperCase();
    if (!cleanToken) {
      setStartError('Masukkan Token Ujian terlebih dahulu.');
      return;
    }

    const currentExam = availableExams.find((ex) => ex.id === selectedExamId);
    let targetExamId = selectedExamId;
    if (
      !currentExam ||
      currentExam.token.trim().replace(/\s+/g, '').toUpperCase() !== cleanToken
    ) {
      const matched = availableExams.find(
        (ex) => ex.token.trim().replace(/\s+/g, '').toUpperCase() === cleanToken
      );
      if (matched) {
        targetExamId = matched.id;
        setSelectedExamId(matched.id);
      }
    }

    if (!targetExamId) return;
    setStartError('');
    setStarting(true);
    try {
      const ses = await startExamSession(targetExamId, student.id, cleanToken);
      onSessionUpdated(ses);
      setActiveSession(ses);
      setCompletedSession(null);
      setAnswers(ses.answers || {});
      setFlaggedIds(ses.flaggedIds || []);
      setTabLeaveCount(ses.tabLeaveCount || 0);
      setCurrentIdx(0);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Gagal memulai ujian.');
    } finally {
      setStarting(false);
    }
  };

  const handleAnswerChange = (questionId: string, value: StudentAnswerValue) => {
    const next = { ...answers, [questionId]: value };
    setAnswers(next);
    persistQuick(next, flaggedIds, tabLeaveCount);
  };

  const toggleFlag = (questionId: string) => {
    const nextFlagged = flaggedIds.includes(questionId)
      ? flaggedIds.filter((id) => id !== questionId)
      : [...flaggedIds, questionId];
    setFlaggedIds(nextFlagged);
    persistQuick(answers, nextFlagged, tabLeaveCount);
  };

  // ==================== VIEW 3: HASIL UJIAN SISWA ====================
  if (completedSession && activeExam) {
    const showScore = activeExam.tampilkanHasil;
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-6">
            {/* Print Header */}
            <div className="flex items-center justify-between gap-4 pb-5 border-b border-slate-200">
              <div className="flex items-center gap-3.5">
                <img
                  src={db.school.logoUrl || DEFAULT_SCHOOL_LOGO}
                  alt={db.school.namaSekolah}
                  referrerPolicy="no-referrer"
                  className="h-12 w-12 rounded-lg object-contain p-0.5 bg-white border border-slate-200"
                />
                <div>
                  <h1 className="text-lg font-bold text-[#0F2547]">{db.school.namaSekolah}</h1>
                  <p className="text-xs text-slate-500">
                    Kartu Hasil Ujian · Tahun Pelajaran {db.school.tahunPelajaran}
                  </p>
                </div>
              </div>
              <div className="text-right text-xs text-slate-500 tabular-nums">
                <p>No. Peserta: {student.nomorPeserta}</p>
                <p>Kelas: {studentClass?.namaKelas || db.school.kelasDefault}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Ujian Selesai dan Tersimpan</span>
                </p>
                <h2 className="text-xl font-bold text-[#0F2547]">{activeExam.namaUjian}</h2>
                <p className="text-sm text-slate-600 mt-0.5">
                  Peserta: <strong className="text-slate-900">{student.nama}</strong> · Mata Uji:{' '}
                  {activeExam.mataUji}
                </p>
              </div>

              {showScore && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-4 text-center shrink-0">
                  <p className="text-xs font-medium text-slate-500">Nilai Akhir</p>
                  <p
                    className={`text-4xl font-extrabold tabular-nums mt-0.5 ${
                      completedSession.tuntas ? 'text-emerald-600' : 'text-orange-600'
                    }`}
                  >
                    {completedSession.nilaiAkhir}
                  </p>
                  <p className="text-xs font-semibold mt-1 text-slate-700">
                    {completedSession.tuntas
                      ? `Tuntas (KKM ${activeExam.nilaiMinimum})`
                      : `Perlu Penguatan (KKM ${activeExam.nilaiMinimum})`}
                  </p>
                </div>
              )}
            </div>

            {showScore ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-slate-200 p-3.5">
                    <p className="text-xs text-slate-500">Jumlah Soal</p>
                    <p className="text-xl font-bold text-slate-900 tabular-nums mt-1">
                      {completedSession.jumlahSoal}
                    </p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                    <p className="text-xs text-emerald-800">Jawaban Benar</p>
                    <p className="text-xl font-bold text-emerald-700 tabular-nums mt-1">
                      {completedSession.jumlahBenar}
                    </p>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-red-50/60 p-3.5">
                    <p className="text-xs text-red-800">Jawaban Salah</p>
                    <p className="text-xl font-bold text-red-700 tabular-nums mt-1">
                      {completedSession.jumlahSalah}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3.5">
                    <p className="text-xs text-slate-500">Tidak Dijawab</p>
                    <p className="text-xl font-bold text-slate-700 tabular-nums mt-1">
                      {completedSession.tidakDijawab}
                    </p>
                  </div>
                </div>

                {/* Materi Breakdown */}
                <div className="space-y-3 pt-2">
                  <h3 className="text-sm font-bold text-[#0F2547]">Capaian per Materi</h3>
                  <div className="space-y-2.5">
                    {completedSession.materiBreakdown.map((m, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700">
                            {m.mataUji} · {m.materi}
                          </span>
                          <span className="font-mono font-semibold text-slate-900 tabular-nums">
                            {m.percentage}% ({m.correctCount}/{m.totalQuestions} benar)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              m.percentage >= 75
                                ? 'bg-emerald-500'
                                : m.percentage >= 50
                                  ? 'bg-sky-500'
                                  : 'bg-orange-500'
                            }`}
                            style={{ width: `${Math.min(100, m.percentage)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-900 space-y-1">
                <p className="font-semibold">Jawaban Kamu Telah Diterima!</p>
                <p className="text-sky-800">
                  Hasil nilai ujian akan diumumkan langsung oleh Bapak/Ibu Guru setelah seluruh
                  peserta selesai mengerjakan.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200 no-print">
              <button
                type="button"
                onClick={() => {
                  setCompletedSession(null);
                  setTokenInput('');
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Kembali ke Daftar Ujian
              </button>
              <div className="flex items-center gap-3">
                {showScore && (
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F2547] hover:bg-[#173566] text-white text-sm font-semibold transition-colors cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    <span>Cetak Kartu Hasil</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Keluar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== VIEW 2: HALAMAN UJIAN AKTIF ====================
  if (activeSession && activeExam && orderedQuestions.length > 0) {
    const currentQ = orderedQuestions[currentIdx] || orderedQuestions[0];
    const currentAnswer = answers[currentQ.id];
    const isFlagged = flaggedIds.includes(currentQ.id);
    const answeredCount = orderedQuestions.filter((q) =>
      isAnswerProvided(q, answers[q.id])
    ).length;
    const unansweredCount = orderedQuestions.length - answeredCount;
    const isUrgent = secondsLeft > 0 && secondsLeft <= 300;
    const isCritical = secondsLeft > 0 && secondsLeft <= 60;

    // Shuffle options deterministically per session if acakPilihan was set
    const displayedOptions = (() => {
      if (!currentQ.pilihan) return [];
      const order = activeSession.optionOrders?.[currentQ.id];
      if (!order || order.length === 0) return currentQ.pilihan;
      const byKey = new Map(currentQ.pilihan.map((p) => [p.key, p]));
      return order.map((k) => byKey.get(k)).filter((x): x is { key: string; text: string } => Boolean(x));
    })();

    // For Menjodohkan, create deterministic right-side list sorted alphabetically so it isn't trivially aligned
    const matchingRightOptions = (() => {
      if (!currentQ.pasanganJodoh) return [];
      return [...currentQ.pasanganJodoh]
        .map((p) => p.right)
        .sort((a, b) => a.localeCompare(b));
    })();

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Top Exam Header */}
        <header className="sticky top-0 z-20 bg-[#0F2547] text-white border-b border-[#1E3A6E] px-4 py-3 sm:px-6">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={db.school.logoUrl || DEFAULT_SCHOOL_LOGO}
                alt={db.school.namaSekolah}
                referrerPolicy="no-referrer"
                className="h-10 w-10 rounded-lg object-contain p-0.5 bg-white border border-white/20 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-xs text-sky-300 font-medium truncate">
                  {db.school.namaSekolah} · {activeExam.mataUji}
                </p>
                <h1 className="text-sm sm:text-base font-bold truncate">{activeExam.namaUjian}</h1>
              </div>
            </div>

            <div className="flex items-center gap-4 sm:gap-6">
              <div className="hidden md:block text-right text-xs">
                <p className="font-semibold text-white">{student.nama}</p>
                <p className="text-slate-300 font-mono">
                  No. {student.nomorPeserta} · {studentClass?.namaKelas || 'VI'}
                </p>
              </div>

              <div
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border font-mono text-sm sm:text-base font-bold tabular-nums ${
                  isCritical
                    ? 'bg-red-600 border-red-400 text-white'
                    : isUrgent
                      ? 'bg-orange-600 border-orange-400 text-white'
                      : 'bg-white/10 border-white/20 text-white'
                }`}
              >
                <Clock className="h-4 w-4 shrink-0" />
                <span>{formatDurationTimer(secondsLeft)}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Exam Stage */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-5 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Question Stage */}
          <section className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 sm:p-7 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5 text-sm">
                <span className="inline-flex items-center justify-center h-8 px-3 rounded-lg bg-[#0F2547] text-white font-bold font-mono tabular-nums">
                  Soal {currentIdx + 1} / {orderedQuestions.length}
                </span>
                <span className="text-slate-500">·</span>
                <span className="font-medium text-slate-700">
                  {JENIS_SOAL_LABEL[currentQ.jenisSoal]}
                </span>
                <span className="text-slate-400 hidden sm:inline">·</span>
                <span className="text-xs text-slate-500 hidden sm:inline">
                  {currentQ.mataUji}
                </span>
              </div>

              <div className="text-xs text-slate-500">
                {saveNotice === 'saving'
                  ? 'Menyimpan jawaban...'
                  : saveNotice === 'saved'
                    ? 'Tersimpan otomatis'
                    : `Bobot ${currentQ.bobot} poin`}
              </div>
            </div>

            {/* Stimulus */}
            <StimulusRenderer stimulus={currentQ.stimulus} />

            {/* Question Text */}
            <div className="text-base sm:text-[17px] font-medium text-slate-900 leading-relaxed whitespace-pre-line">
              {currentQ.pertanyaan}
            </div>

            {/* Answer Controls by Question Type */}
            {currentQ.jenisSoal === 'PG' && (
              <div className="space-y-2.5">
                {displayedOptions.map((opt, idx) => {
                  const displayLetter = String.fromCharCode(65 + idx);
                  const selected = currentAnswer === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => handleAnswerChange(currentQ.id, opt.key)}
                      className={`w-full text-left flex items-start gap-3.5 p-4 rounded-xl border transition-colors cursor-pointer ${
                        selected
                          ? 'bg-sky-50 border-sky-600 text-[#0F2547]'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <span
                        className={`h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${
                          selected
                            ? 'bg-sky-600 text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {displayLetter}
                      </span>
                      <span className="pt-1 text-[15px] leading-snug">{opt.text}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {currentQ.jenisSoal === 'PGK' && (
              <div className="space-y-2.5">
                <p className="text-xs font-medium text-sky-700">
                  Pilih lebih dari satu jawaban yang benar (centang semua yang sesuai).
                </p>
                {displayedOptions.map((opt) => {
                  const currentList = Array.isArray(currentAnswer) ? currentAnswer : [];
                  const checked = currentList.includes(opt.key);
                  const toggle = () => {
                    const next = checked
                      ? currentList.filter((k) => k !== opt.key)
                      : [...currentList, opt.key];
                    handleAnswerChange(currentQ.id, next);
                  };
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={toggle}
                      className={`w-full text-left flex items-start gap-3.5 p-4 rounded-xl border transition-colors cursor-pointer ${
                        checked
                          ? 'bg-sky-50 border-sky-600 text-[#0F2547]'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <span
                        className={`h-6 w-6 mt-0.5 rounded-md border flex items-center justify-center shrink-0 ${
                          checked
                            ? 'bg-sky-600 border-sky-600 text-white'
                            : 'bg-white border-slate-300'
                        }`}
                      >
                        {checked && <Check className="h-4 w-4" />}
                      </span>
                      <span className="text-[15px] leading-snug">{opt.text}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {currentQ.jenisSoal === 'BS' && currentQ.pernyataanBS && (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700">
                      <th className="px-4 py-3 text-left font-semibold">Pernyataan</th>
                      <th className="px-4 py-3 text-center font-semibold w-28">Benar</th>
                      <th className="px-4 py-3 text-center font-semibold w-28">Salah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentQ.pernyataanBS.map((st, idx) => {
                      const bsRecord =
                        currentAnswer && typeof currentAnswer === 'object' && !Array.isArray(currentAnswer)
                          ? (currentAnswer as Record<string, boolean>)
                          : {};
                      const val = bsRecord[st.id];
                      const setRow = (choice: boolean) => {
                        handleAnswerChange(currentQ.id, { ...bsRecord, [st.id]: choice });
                      };
                      return (
                        <tr key={st.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="px-4 py-3.5 text-slate-800 border-t border-slate-200">
                            {st.text}
                          </td>
                          <td className="px-3 py-2.5 text-center border-t border-slate-200">
                            <button
                              type="button"
                              onClick={() => setRow(true)}
                              className={`px-3.5 py-2 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                                val === true
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              Benar
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-center border-t border-slate-200">
                            <button
                              type="button"
                              onClick={() => setRow(false)}
                              className={`px-3.5 py-2 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                                val === false
                                  ? 'bg-orange-600 border-orange-600 text-white'
                                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              Salah
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {currentQ.jenisSoal === 'MENJODOHKAN' && currentQ.pasanganJodoh && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-sky-700">
                  Pilih pasangan jawaban yang paling tepat pada kolom sebelah kanan untuk setiap pernyataan.
                </p>
                {currentQ.pasanganJodoh.map((pair, idx) => {
                  const matchRecord =
                    currentAnswer && typeof currentAnswer === 'object' && !Array.isArray(currentAnswer)
                      ? (currentAnswer as Record<string, string>)
                      : {};
                  const selectedRight = matchRecord[pair.id] || '';
                  return (
                    <div
                      key={pair.id}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center p-3.5 rounded-xl border border-slate-200 bg-slate-50/50"
                    >
                      <div className="sm:col-span-6 text-sm font-medium text-slate-800">
                        <span className="font-mono text-xs text-slate-500 mr-2">{idx + 1}.</span>
                        {pair.left}
                      </div>
                      <div className="sm:col-span-6">
                        <select
                          value={selectedRight}
                          onChange={(e) =>
                            handleAnswerChange(currentQ.id, {
                              ...matchRecord,
                              [pair.id]: e.target.value,
                            })
                          }
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        >
                          <option value="">-- Pilih Pasangan --</option>
                          {matchingRightOptions.map((optText, oIdx) => (
                            <option key={oIdx} value={optText}>
                              {optText}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {currentQ.jenisSoal === 'ISIAN' && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-600">
                  Ketik Jawaban Singkat Anda:
                </label>
                <input
                  type="text"
                  value={typeof currentAnswer === 'string' ? currentAnswer : ''}
                  onChange={(e) => handleAnswerChange(currentQ.id, e.target.value)}
                  placeholder="Ketik jawaban di sini..."
                  className="w-full max-w-md px-4 py-3 rounded-xl border border-slate-300 text-base font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                />
              </div>
            )}

            {/* Action Buttons Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-5 border-t border-slate-200">
              <button
                type="button"
                disabled={currentIdx === 0}
                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-sm font-semibold text-slate-700 cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Sebelumnya</span>
              </button>

              <button
                type="button"
                onClick={() => toggleFlag(currentQ.id)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold cursor-pointer transition-colors ${
                  isFlagged
                    ? 'bg-orange-500 border-orange-500 text-white'
                    : 'bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100'
                }`}
              >
                <Bookmark className="h-4 w-4" />
                <span>{isFlagged ? 'Ditandai Ragu-ragu' : 'Tandai Ragu-ragu'}</span>
              </button>

              {currentIdx < orderedQuestions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentIdx((i) => Math.min(orderedQuestions.length - 1, i + 1))}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold cursor-pointer transition-colors"
                >
                  <span>Selanjutnya</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowFinishModal(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer transition-colors"
                >
                  <FileCheck2 className="h-4 w-4" />
                  <span>Selesai Ujian</span>
                </button>
              )}
            </div>
          </section>

          {/* Question Navigation Panel */}
          <aside className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#0F2547]">Navigasi Nomor Soal</h2>
              <span className="text-xs font-mono text-slate-600 tabular-nums">
                {answeredCount}/{orderedQuestions.length} Dijawab
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {orderedQuestions.map((q, idx) => {
                const answered = isAnswerProvided(q, answers[q.id]);
                const flagged = flaggedIds.includes(q.id);
                const isCurrent = idx === currentIdx;

                let btnStyle = 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200';
                if (flagged) {
                  btnStyle = 'bg-orange-500 text-white border-orange-600';
                } else if (answered) {
                  btnStyle = 'bg-emerald-600 text-white border-emerald-700';
                }

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIdx(idx)}
                    aria-label={`Soal nomor ${idx + 1}`}
                    className={`h-11 rounded-xl border font-mono text-sm font-bold tabular-nums relative flex items-center justify-center cursor-pointer transition-transform ${btnStyle} ${
                      isCurrent ? 'ring-2 ring-offset-2 ring-[#0F2547]' : ''
                    }`}
                  >
                    <span>{idx + 1}</span>
                    {flagged && (
                      <HelpCircle className="h-3 w-3 absolute top-1 right-1 opacity-90" />
                    )}
                    {!flagged && answered && (
                      <Check className="h-3 w-3 absolute top-1 right-1 opacity-90" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="pt-3 border-t border-slate-200 space-y-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded bg-emerald-600 inline-flex items-center justify-center text-white">
                  <Check className="h-2.5 w-2.5" />
                </span>
                <span>Sudah Dijawab ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded bg-orange-500 inline-flex items-center justify-center text-white">
                  <HelpCircle className="h-2.5 w-2.5" />
                </span>
                <span>Ditandai Ragu-ragu ({flaggedIds.length})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded bg-slate-200 border border-slate-300 inline-block" />
                <span>Belum Dijawab ({unansweredCount})</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowFinishModal(true)}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer transition-colors"
            >
              <FileCheck2 className="h-4 w-4" />
              <span>Selesai &amp; Kirim Jawaban</span>
            </button>
          </aside>
        </main>

        {/* Tab-Leave Warning Modal */}
        {showTabWarning && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
              <div className="flex items-center gap-3 text-orange-600">
                <ShieldAlert className="h-6 w-6 shrink-0" />
                <h3 className="text-lg font-bold text-[#0F2547]">Tetap Fokus di Halaman Ujian</h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                Sistem mencatat Anda berpindah dari tab atau jendela ujian. Mohon tetap berada di
                halaman ujian hingga selesai. (Tercatat: {tabLeaveCount} kali)
              </p>
              <button
                type="button"
                onClick={() => setShowTabWarning(false)}
                className="w-full py-2.5 px-4 rounded-xl bg-[#0F2547] hover:bg-[#173566] text-white text-sm font-semibold cursor-pointer"
              >
                Saya Mengerti, Lanjutkan Ujian
              </button>
            </div>
          </div>
        )}

        {/* Confirm Finish Modal */}
        {showFinishModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-5">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-orange-500 shrink-0" />
                <h3 className="text-lg font-bold text-[#0F2547]">Konfirmasi Mengakhiri Ujian</h3>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Soal Sudah Dijawab</span>
                  <span className="font-bold text-emerald-700 tabular-nums">{answeredCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Ditandai Ragu-ragu</span>
                  <span className="font-bold text-orange-600 tabular-nums">{flaggedIds.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Belum Dijawab</span>
                  <span className="font-bold text-slate-800 tabular-nums">{unansweredCount}</span>
                </div>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Setelah jawaban dikirim, ujian ini akan terkunci dan tidak dapat diubah kembali.
              </p>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowFinishModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Periksa Lagi
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleFinalSubmit('manual')}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
                >
                  {submitting ? 'Mengirim...' : 'Ya, Kirim Jawaban'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== VIEW 1: IDENTITAS & INPUT TOKEN ====================
  const chosenExam = availableExams.find((e) => e.id === selectedExamId);
  const chosenExamSessions = db.sessions.filter(
    (s) => s.examId === selectedExamId && s.studentId === student.id && s.status === 'submitted'
  );
  const latestSubmitted = chosenExamSessions[chosenExamSessions.length - 1];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-3.5 sm:px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={db.school.logoUrl || DEFAULT_SCHOOL_LOGO}
              alt={db.school.namaSekolah}
              referrerPolicy="no-referrer"
              className="h-10 w-10 rounded-lg object-contain p-0.5 bg-white border border-slate-200 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-[#0F2547] truncate">TKA SMART EXAM MI/SD</p>
              <p className="text-xs text-slate-500 truncate">
                {db.school.namaSekolah} · {db.school.tahunPelajaran}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Identitas Peserta & Petunjuk */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#0F2547]">Identitas Peserta Ujian</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-500">Nama Lengkap</p>
                <p className="font-semibold text-slate-900 mt-0.5">{student.nama}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Nomor Peserta</p>
                <p className="font-mono font-semibold text-slate-900 mt-0.5">
                  {student.nomorPeserta}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Kelas / Rombel</p>
                <p className="font-semibold text-slate-900 mt-0.5">
                  {studentClass?.namaKelas || db.school.kelasDefault}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Madrasah / Sekolah</p>
                <p className="font-semibold text-slate-900 mt-0.5">{db.school.namaSekolah}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
            <h3 className="text-base font-bold text-[#0F2547]">Petunjuk Pengerjaan Ujian</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-slate-700 leading-relaxed">
              <li>Berdoalah terlebih dahulu sebelum mulai mengerjakan soal TKA.</li>
              <li>Pilih jadwal ujian yang aktif, lalu masukkan <strong>Token Ujian</strong> dari Bapak/Ibu Guru.</li>
              <li>Baca setiap bacaan, tabel, atau gambar pada soal dengan cermat dan teliti.</li>
              <li>Gunakan tombol <strong>Tandai Ragu-ragu</strong> apabila ingin meninjau ulang soal tersebut nanti.</li>
              <li>Jawaban tersimpan secara otomatis. Waktu akan berjalan mundur dan ujian otomatis selesai bila waktu habis.</li>
            </ol>
          </div>
        </div>

        {/* Pilihan Ujian & Token */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <h2 className="text-lg font-bold text-[#0F2547]">Konfirmasi &amp; Mulai Ujian</h2>

          {availableExams.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Belum ada jadwal ujian TKA yang ditugaskan untuk kelas Anda. Silakan hubungi guru atau
              operator.
            </div>
          ) : (
            <form onSubmit={handleStartExam} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Pilih Mata Uji / Jadwal
                </label>
                <select
                  value={selectedExamId}
                  onChange={(e) => {
                    setSelectedExamId(e.target.value);
                    setStartError('');
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {availableExams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.namaUjian} ({ex.mataUji}) — {ex.aktif ? 'Aktif' : 'Nonaktif'}
                    </option>
                  ))}
                </select>
              </div>

              {chosenExam && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Mata Uji</span>
                    <span className="font-semibold text-slate-900">{chosenExam.mataUji}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Jumlah Soal</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {chosenExam.questionIds.length} butir
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Durasi Pengerjaan</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {chosenExam.durasiMenit} menit
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Jadwal</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {chosenExam.tanggalUjian} · {chosenExam.jamMulai}–{chosenExam.jamSelesai}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Kesempatan Dikerjakan</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {chosenExamSessions.length} / {chosenExam.kesempatan}x
                    </span>
                  </div>
                </div>
              )}

              {latestSubmitted && chosenExam?.tampilkanHasil && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 flex items-center justify-between gap-3">
                  <div className="text-xs text-emerald-900">
                    <p className="font-semibold">Nilai Percobaan Terakhir</p>
                    <p className="font-mono text-base font-bold">{latestSubmitted.nilaiAkhir}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCompletedSession(latestSubmitted)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Lihat Hasil
                  </button>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Token Ujian
                </label>
                <div className="relative">
                  <KeyRound className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value.replace(/\s+/g, '').toUpperCase())}
                    placeholder="Masukkan Token Ujian dari Guru"
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 font-mono text-sm uppercase tracking-wider text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              {startError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs text-red-700"
                >
                  {startError}
                </div>
              )}

              <button
                type="submit"
                disabled={starting || !chosenExam}
                className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer transition-colors"
              >
                {starting ? 'Menyiapkan Soal...' : 'Mulai Mengerjakan Ujian'}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};

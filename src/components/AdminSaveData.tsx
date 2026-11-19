import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Calculator,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  FolderSync,
  Loader2,
  Save,
  ShieldCheck,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { flushDatabaseToServer, mergeBackupToServer } from '../services/api.ts';
import type { AppDatabase } from '../types.ts';
import { downloadJsonFile } from '../utils/scoring.ts';

interface AdminSaveDataProps {
  db: AppDatabase;
  onRefreshState: () => Promise<void>;
  onNavigate: (
    tab:
      | 'peserta'
      | 'bank_soal_mtk'
      | 'bank_soal_ind'
      | 'pengaturan'
  ) => void;
}

export const AdminSaveData: React.FC<AdminSaveDataProps> = ({
  db,
  onRefreshState,
  onNavigate,
}) => {
  const [flushing, setFlushing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string>('');
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const mtkCount = useMemo(
    () => db.questions.filter((q) => q.mataUji === 'Matematika').length,
    [db.questions]
  );
  const indCount = useMemo(
    () => db.questions.filter((q) => q.mataUji === 'Bahasa Indonesia').length,
    [db.questions]
  );
  const classMap = useMemo(() => new Map(db.classes.map((c) => [c.id, c])), [db.classes]);

  const recentStudents = useMemo(() => [...db.students].reverse().slice(0, 6), [db.students]);
  const recentQuestions = useMemo(() => db.questions.slice(0, 6), [db.questions]);

  const handleFlushSave = async () => {
    setFlushing(true);
    setErrorMsg('');
    setFeedback('');
    try {
      const res = await flushDatabaseToServer();
      await onRefreshState();
      const timeLabel = new Date(res.savedAt).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setLastSavedAt(timeLabel);
      setFeedback(
        `Seluruh data (${res.counts.students} peserta, ${res.counts.questions} soal, ${res.counts.classes} kelas, ${res.counts.exams} jadwal ujian, ${res.counts.sessions} sesi) berhasil disimpan permanen ke server dan file cadangan pada pukul ${timeLabel}.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Gagal menyimpan data permanen ke server.'
      );
    } finally {
      setFlushing(false);
    }
  };

  const handleDownloadBackup = () => {
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadJsonFile(`cadangan-tka-smart-exam-${dateStamp}.json`, db);
    setFeedback('Berkas cadangan lengkap (.json) berhasil diunduh ke perangkat Anda.');
  };

  const handleMergeBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMerging(true);
    setErrorMsg('');
    setFeedback('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<AppDatabase> | unknown[];

      let payload: Partial<AppDatabase>;
      if (Array.isArray(parsed)) {
        const first = parsed[0] as Record<string, unknown> | undefined;
        if (first && typeof first === 'object' && 'pertanyaan' in first) {
          payload = { questions: parsed as AppDatabase['questions'] };
        } else if (first && typeof first === 'object' && 'nomorPeserta' in first) {
          payload = { students: parsed as AppDatabase['students'] };
        } else {
          throw new Error(
            'Format array JSON tidak dikenali sebagai daftar soal maupun daftar peserta.'
          );
        }
      } else if (parsed && typeof parsed === 'object') {
        payload = parsed;
      } else {
        throw new Error('Berkas JSON tidak valid.');
      }

      const res = await mergeBackupToServer(payload);
      await onRefreshState();
      const { addedClasses, addedStudents, addedQuestions, addedExams } = res.merged;
      setLastSavedAt(
        new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
      setFeedback(
        `Penggabungan data selesai & tersimpan permanen tanpa menghapus data lama: +${addedStudents} peserta, +${addedQuestions} soal, +${addedClasses} kelas, +${addedExams} jadwal ujian.`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Gagal membaca atau menggabungkan file cadangan JSON.'
      );
    } finally {
      setMerging(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + Primary Save CTA */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#0F2547]">Simpan &amp; Cadangkan Data</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Verifikasi dan simpan permanen seluruh unggahan data peserta, bank soal, jadwal, serta
            cadangan data.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>Unduh Cadangan (.json)</span>
          </button>
          <button
            type="button"
            disabled={flushing}
            onClick={handleFlushSave}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold shadow-sm cursor-pointer"
          >
            {flushing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Menyimpan ke Server...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Simpan Semua Data ke Server Sekarang</span>
              </>
            )}
          </button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{feedback}</span>
          </span>
          <button type="button" onClick={() => setFeedback('')} className="cursor-pointer shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </span>
          <button type="button" onClick={() => setErrorMsg('')} className="cursor-pointer shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Server Persistence Banner & Live Stats */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0F2547]">
                Status Penyimpanan Permanen Server
              </h3>
              <p className="text-xs text-slate-500">
                Setiap data yang baru diunggah otomatis tersimpan dan dicadangkan ganda di server
                (tka-store.json &amp; backup).
              </p>
            </div>
          </div>
          {lastSavedAt && (
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
              Terakhir disimpan manual: {lastSavedAt}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <p className="text-[11px] font-semibold text-slate-500">Peserta Didik</p>
            <p className="text-xl font-bold text-[#0F2547] font-mono tabular-nums mt-1">
              {db.students.length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <p className="text-[11px] font-semibold text-slate-500">Kelas / Rombel</p>
            <p className="text-xl font-bold text-[#0F2547] font-mono tabular-nums mt-1">
              {db.classes.length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-sky-50/50 p-3.5">
            <p className="text-[11px] font-semibold text-sky-700">Soal Matematika</p>
            <p className="text-xl font-bold text-[#0F2547] font-mono tabular-nums mt-1">
              {mtkCount}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-sky-50/50 p-3.5">
            <p className="text-[11px] font-semibold text-sky-700">Soal B. Indonesia</p>
            <p className="text-xl font-bold text-[#0F2547] font-mono tabular-nums mt-1">
              {indCount}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <p className="text-[11px] font-semibold text-slate-500">Jadwal Ujian</p>
            <p className="text-xl font-bold text-[#0F2547] font-mono tabular-nums mt-1">
              {db.exams.length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <p className="text-[11px] font-semibold text-slate-500">Sesi / Nilai Ujian</p>
            <p className="text-xl font-bold text-[#0F2547] font-mono tabular-nums mt-1">
              {db.sessions.length}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions for Uploading & Merging Data Baru */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700 shrink-0">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0F2547]">
                Unggah &amp; Simpan Data Baru
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Buka langsung menu unggah peserta Excel atau unggah bank soal Word/PDF dengan
                penyimpanan permanen.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('peserta')}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-900 cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-700 shrink-0" />
              <span>Peserta Excel</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('bank_soal_mtk')}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 text-xs font-semibold text-[#0F2547] cursor-pointer"
            >
              <Calculator className="h-4 w-4 text-sky-700 shrink-0" />
              <span>Soal Matematika</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('bank_soal_ind')}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 text-xs font-semibold text-[#0F2547] cursor-pointer"
            >
              <BookOpen className="h-4 w-4 text-sky-700 shrink-0" />
              <span>Soal B. Indo</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
              <FolderSync className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0F2547]">
                Gabungkan Unggahan Cadangan (.json)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tambahkan soal/peserta baru dari file JSON hasil ekspor atau cadangan tanpa
                menghapus data yang sudah tersimpan.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F2547] hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer">
              {merging ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Menggabungkan &amp; Menyimpan...</span>
                </>
              ) : (
                <>
                  <Database className="h-4 w-4" />
                  <span>Pilih &amp; Simpan File JSON Baru</span>
                </>
              )}
              <input
                type="file"
                accept=".json,application/json"
                disabled={merging}
                onChange={handleMergeBackupFile}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => onNavigate('pengaturan')}
              className="px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Pengaturan Sekolah
            </button>
          </div>
        </div>
      </div>

      {/* Recently Saved Data Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0F2547] flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-600" />
              <span>Peserta Tersimpan Terbaru ({db.students.length})</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('peserta')}
              className="text-xs font-semibold text-sky-700 hover:underline cursor-pointer"
            >
              Lihat Semua →
            </button>
          </div>

          {recentStudents.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              Belum ada peserta yang terdaftar.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentStudents.map((s) => (
                <div key={s.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{s.nama}</p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      No. {s.nomorPeserta} · {classMap.get(s.kelasId)?.namaKelas || '-'}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-700 shrink-0">
                    Tersimpan
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0F2547] flex items-center gap-2">
              <FileText className="h-4 w-4 text-sky-600" />
              <span>Soal Tersimpan Terbaru ({db.questions.length})</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('bank_soal_mtk')}
              className="text-xs font-semibold text-sky-700 hover:underline cursor-pointer"
            >
              Buka Bank Soal →
            </button>
          </div>

          {recentQuestions.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              Belum ada soal tersimpan.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentQuestions.map((q) => (
                <div key={q.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-500">
                      <span className="font-mono font-bold text-[#0F2547]">{q.id}</span> ·{' '}
                      <span className="font-semibold text-sky-700">{q.mataUji}</span> ·{' '}
                      <span>{q.jenisSoal}</span>
                    </p>
                    <p className="text-slate-900 font-medium line-clamp-1 mt-0.5">
                      {q.pertanyaan}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-700 shrink-0">
                    Tersimpan
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  Copy,
  Edit3,
  Power,
  RefreshCw,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react';
import { createExam, deleteExam, updateExam } from '../services/api.ts';
import type { AppDatabase, ExamConfig, MataUji, TingkatKesulitan } from '../types.ts';

interface AdminExamsProps {
  db: AppDatabase;
  mode: 'create' | 'schedule';
  onSwitchMode: (mode: 'create' | 'schedule') => void;
  onRefreshState: () => Promise<void>;
}

function generateTokenCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function getLocalTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const AdminExams: React.FC<AdminExamsProps> = ({
  db,
  mode,
  onSwitchMode,
  onRefreshState,
}) => {
  const todayStr = getLocalTodayStr();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [namaUjian, setNamaUjian] = useState('Tryout TKA Kelas VI');
  const [tahunPelajaran, setTahunPelajaran] = useState(db.school.tahunPelajaran);
  const [kelasIds, setKelasIds] = useState<string[]>(db.classes.map((c) => c.id));
  const [mataUji, setMataUji] = useState<MataUji | 'Campuran'>('Matematika');
  const [tanggalUjian, setTanggalUjian] = useState(todayStr);
  const [jamMulai, setJamMulai] = useState('00:00');
  const [jamSelesai, setJamSelesai] = useState('23:59');
  const [durasiMenit, setDurasiMenit] = useState(60);
  const [jumlahSoal, setJumlahSoal] = useState(10);
  const [nilaiMinimum, setNilaiMinimum] = useState(75);
  const [token, setToken] = useState(generateTokenCode());
  const [acakSoal, setAcakSoal] = useState(true);
  const [acakPilihan, setAcakPilihan] = useState(true);
  const [kesempatan, setKesempatan] = useState(1);
  const [tampilkanHasil, setTampilkanHasil] = useState(true);
  const [aktif, setAktif] = useState(true);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>(
    db.questions.filter((q) => q.mataUji === 'Matematika').slice(0, 10).map((q) => q.id)
  );

  // Random picker criteria
  const [randomMateri, setRandomMateri] = useState('ALL');
  const [randomKesulitan, setRandomKesulitan] = useState<'ALL' | TingkatKesulitan>('ALL');
  const [feedback, setFeedback] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<ExamConfig | null>(null);

  const eligibleQuestions = useMemo(() => {
    return db.questions.filter((q) => mataUji === 'Campuran' || q.mataUji === mataUji);
  }, [db.questions, mataUji]);

  const materiList = useMemo(
    () => Array.from(new Set(eligibleQuestions.map((q) => q.materi))).sort(),
    [eligibleQuestions]
  );

  const handleAutoPickRandom = () => {
    const pool = eligibleQuestions.filter((q) => {
      if (randomMateri !== 'ALL' && q.materi !== randomMateri) return false;
      if (randomKesulitan !== 'ALL' && q.tingkatKesulitan !== randomKesulitan) return false;
      return true;
    });
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, Math.min(jumlahSoal, shuffled.length)).map((q) => q.id);
    setSelectedQuestionIds(picked);
    setFeedback(
      `Terpilih ${picked.length} soal acak dari ${pool.length} soal yang sesuai kriteria.`
    );
  };

  const resetForm = () => {
    setEditingId(null);
    setNamaUjian('Tryout TKA Kelas VI');
    setTahunPelajaran(db.school.tahunPelajaran);
    setKelasIds(db.classes.map((c) => c.id));
    setMataUji('Matematika');
    setTanggalUjian(todayStr);
    setJamMulai('00:00');
    setJamSelesai('23:59');
    setDurasiMenit(60);
    setJumlahSoal(10);
    setNilaiMinimum(75);
    setToken(generateTokenCode());
    setAcakSoal(true);
    setAcakPilihan(true);
    setKesempatan(1);
    setTampilkanHasil(true);
    setAktif(true);
    setSelectedQuestionIds(
      db.questions.filter((q) => q.mataUji === 'Matematika').slice(0, 10).map((q) => q.id)
    );
  };

  const loadExamForEdit = (ex: ExamConfig) => {
    setEditingId(ex.id);
    setNamaUjian(ex.namaUjian);
    setTahunPelajaran(ex.tahunPelajaran);
    setKelasIds(ex.kelasIds);
    setMataUji(ex.mataUji);
    setTanggalUjian(ex.tanggalUjian);
    setJamMulai(ex.jamMulai);
    setJamSelesai(ex.jamSelesai);
    setDurasiMenit(ex.durasiMenit);
    setJumlahSoal(ex.jumlahSoal);
    setNilaiMinimum(ex.nilaiMinimum);
    setToken(ex.token);
    setAcakSoal(ex.acakSoal);
    setAcakPilihan(ex.acakPilihan);
    setKesempatan(ex.kesempatan);
    setTampilkanHasil(ex.tampilkanHasil);
    setAktif(ex.aktif);
    setSelectedQuestionIds(ex.questionIds);
    onSwitchMode('create');
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kelasIds.length === 0) {
      setFeedback('Pilih minimal satu kelas peserta ujian.');
      return;
    }
    if (selectedQuestionIds.length === 0) {
      setFeedback('Pilih minimal satu soal atau gunakan tombol Ambil Soal Acak.');
      return;
    }

    const payload: ExamConfig = {
      id: editingId || `EXM-${Date.now()}`,
      namaUjian,
      tahunPelajaran,
      kelasIds,
      mataUji,
      tanggalUjian,
      jamMulai,
      jamSelesai,
      durasiMenit,
      jumlahSoal: selectedQuestionIds.length,
      nilaiMinimum,
      token: token.trim().replace(/\s+/g, '').toUpperCase(),
      acakSoal,
      acakPilihan,
      kesempatan,
      tampilkanHasil,
      aktif,
      questionIds: selectedQuestionIds,
      createdAt: new Date().toISOString(),
    };

    if (editingId) {
      await updateExam(payload);
      setFeedback(`Pengaturan ujian "${payload.namaUjian}" berhasil diperbarui.`);
    } else {
      await createExam(payload);
      setFeedback(`Ujian baru "${payload.namaUjian}" berhasil dibuat dengan token ${payload.token}.`);
    }

    await onRefreshState();
    resetForm();
    onSwitchMode('schedule');
  };

  const toggleExamActive = async (ex: ExamConfig) => {
    await updateExam({ ...ex, aktif: !ex.aktif });
    await onRefreshState();
    setFeedback(`Ujian "${ex.namaUjian}" ${!ex.aktif ? 'diaktifkan' : 'dinonaktifkan'}.`);
  };

  const regenerateExamToken = async (ex: ExamConfig) => {
    const nextToken = generateTokenCode();
    await updateExam({ ...ex, token: nextToken });
    await onRefreshState();
    setFeedback(`Token baru untuk "${ex.namaUjian}": ${nextToken}`);
  };

  const confirmDeleteExam = async () => {
    if (!confirmDelete) return;
    await deleteExam(confirmDelete.id);
    setFeedback(`Ujian "${confirmDelete.namaUjian}" telah dihapus.`);
    setConfirmDelete(null);
    await onRefreshState();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#0F2547]">
            {mode === 'create' ? 'Pengaturan & Buat Ujian TKA' : 'Jadwal Ujian & Token Aktif'}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Atur jadwal pelaksanaan, token akses siswa, pengacakan soal, dan nilai minimum (KKM).
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
          <button
            type="button"
            onClick={() => onSwitchMode('schedule')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              mode === 'schedule' ? 'bg-white text-[#0F2547] shadow-sm' : 'text-slate-600'
            }`}
          >
            Jadwal Ujian ({db.exams.length})
          </button>
          <button
            type="button"
            onClick={() => {
              resetForm();
              onSwitchMode('create');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              mode === 'create' ? 'bg-white text-[#0F2547] shadow-sm' : 'text-slate-600'
            }`}
          >
            + Buat Ujian
          </button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback('')} className="cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {mode === 'create' ? (
        <form onSubmit={handleSaveExam} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Exam Settings */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-bold text-[#0F2547]">
              {editingId ? 'Edit Pengaturan Ujian' : 'Identitas & Jadwal Ujian'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Ujian
                </label>
                <input
                  type="text"
                  required
                  value={namaUjian}
                  onChange={(e) => setNamaUjian(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mata Uji
                </label>
                <select
                  value={mataUji}
                  onChange={(e) => {
                    const next = e.target.value as MataUji | 'Campuran';
                    setMataUji(next);
                    setSelectedQuestionIds(
                      db.questions
                        .filter((q) => next === 'Campuran' || q.mataUji === next)
                        .slice(0, jumlahSoal)
                        .map((q) => q.id)
                    );
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                >
                  <option value="Matematika">Matematika</option>
                  <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                  <option value="Campuran">Campuran (Matematika + B. Indonesia)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tahun Pelajaran
                </label>
                <input
                  type="text"
                  required
                  value={tahunPelajaran}
                  onChange={(e) => setTahunPelajaran(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tanggal Ujian
                </label>
                <input
                  type="date"
                  required
                  value={tanggalUjian}
                  onChange={(e) => setTanggalUjian(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jam Mulai (WIB)
                  </label>
                  <input
                    type="time"
                    required
                    value={jamMulai}
                    onChange={(e) => setJamMulai(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jam Selesai (WIB)
                  </label>
                  <input
                    type="time"
                    required
                    value={jamSelesai}
                    onChange={(e) => setJamSelesai(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Durasi Pengerjaan (Menit)
                </label>
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={durasiMenit}
                  onChange={(e) => setDurasiMenit(Number(e.target.value) || 60)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nilai Minimum (KKM)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={nilaiMinimum}
                  onChange={(e) => setNilaiMinimum(Number(e.target.value) || 75)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kesempatan Mengerjakan
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={kesempatan}
                  onChange={(e) => setKesempatan(Number(e.target.value) || 1)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Token Ujian
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value.toUpperCase())}
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-300 font-mono text-sm uppercase"
                  />
                  <button
                    type="button"
                    onClick={() => setToken(generateTokenCode())}
                    className="px-3 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                    title="Buat Token Acak"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Kelas Target */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Kelas Peserta Ujian
              </label>
              <div className="flex flex-wrap gap-2">
                {db.classes.map((cls) => {
                  const checked = kelasIds.includes(cls.id);
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() =>
                        setKelasIds((prev) =>
                          checked ? prev.filter((id) => id !== cls.id) : [...prev, cls.id]
                        )
                      }
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                        checked
                          ? 'bg-sky-600 border-sky-600 text-white'
                          : 'bg-white border-slate-300 text-slate-700'
                      }`}
                    >
                      {checked && <Check className="h-3.5 w-3.5" />}
                      <span>{cls.namaKelas}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Checkboxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 text-sm">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acakSoal}
                  onChange={(e) => setAcakSoal(e.target.checked)}
                />
                <span>Acak urutan soal</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acakPilihan}
                  onChange={(e) => setAcakPilihan(e.target.checked)}
                />
                <span>Acak pilihan jawaban</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tampilkanHasil}
                  onChange={(e) => setTampilkanHasil(e.target.checked)}
                />
                <span>Tampilkan hasil nilai ke siswa</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aktif}
                  onChange={(e) => setAktif(e.target.checked)}
                />
                <span>Status ujian aktif sekarang</span>
              </label>
            </div>
          </div>

          {/* Right Question Selector & Random Picker */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0F2547]">Pemilihan Soal Ujian</h3>
              <span className="text-xs font-mono font-bold text-sky-700 tabular-nums">
                {selectedQuestionIds.length} Soal Terpilih
              </span>
            </div>

            {/* Auto Random Generator */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-3">
              <p className="text-xs font-bold text-[#0F2547]">Ambil Soal Acak dari Bank Soal</p>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={randomMateri}
                  onChange={(e) => setRandomMateri(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                >
                  <option value="ALL">Semua Materi</option>
                  {materiList.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  value={randomKesulitan}
                  onChange={(e) =>
                    setRandomKesulitan(e.target.value as 'ALL' | TingkatKesulitan)
                  }
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                >
                  <option value="ALL">Semua Kesulitan</option>
                  <option value="Mudah">Mudah</option>
                  <option value="Sedang">Sedang</option>
                  <option value="Sulit">Sulit</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={eligibleQuestions.length || 50}
                  value={jumlahSoal}
                  onChange={(e) => setJumlahSoal(Number(e.target.value) || 10)}
                  className="w-20 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-mono bg-white"
                />
                <span className="text-xs text-slate-600">butir</span>
                <button
                  type="button"
                  onClick={handleAutoPickRandom}
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F2547] hover:bg-[#173566] text-white text-xs font-semibold cursor-pointer"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  <span>Ambil Acak</span>
                </button>
              </div>
            </div>

            {/* Manual Checkboxes */}
            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {eligibleQuestions.map((q) => {
                const checked = selectedQuestionIds.includes(q.id);
                return (
                  <label
                    key={q.id}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer ${
                      checked
                        ? 'bg-sky-50 border-sky-300 text-[#0F2547]'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedQuestionIds((prev) =>
                          checked ? prev.filter((id) => id !== q.id) : [...prev, q.id]
                        )
                      }
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <p className="font-mono font-bold">
                        {q.id} · {q.jenisSoal} · {q.tingkatKesulitan}
                      </p>
                      <p className="line-clamp-1 text-slate-600">{q.pertanyaan}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    onSwitchMode('schedule');
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Batal
                </button>
              )}
              <button
                type="submit"
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold cursor-pointer"
              >
                {editingId ? 'Simpan Perubahan Ujian' : 'Simpan & Jadwalkan Ujian'}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          {db.exams.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
              <CalendarClock className="h-8 w-8 text-slate-400 mx-auto" />
              <p className="text-sm text-slate-600">Belum ada jadwal ujian TKA yang dibuat.</p>
              <button
                type="button"
                onClick={() => onSwitchMode('create')}
                className="px-4 py-2 rounded-xl bg-sky-600 text-white text-xs font-semibold cursor-pointer"
              >
                + Buat Ujian Pertama
              </button>
            </div>
          ) : (
            db.exams.map((ex) => (
              <div
                key={ex.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`font-semibold ${
                        ex.aktif ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {ex.aktif ? 'Status: Aktif' : 'Status: Nonaktif'}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="font-semibold text-sky-700">{ex.mataUji}</span>
                    <span className="text-slate-400">·</span>
                    <span className="font-mono text-slate-600">
                      {ex.tanggalUjian} ({ex.jamMulai}–{ex.jamSelesai})
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-[#0F2547]">{ex.namaUjian}</h3>
                  <p className="text-xs text-slate-500 tabular-nums">
                    {ex.questionIds.length} soal · Durasi {ex.durasiMenit} menit · KKM{' '}
                    {ex.nilaiMinimum} · Kesempatan {ex.kesempatan}x · Hasil{' '}
                    {ex.tampilkanHasil ? 'Ditampilkan ke siswa' : 'Disembunyikan'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-xs text-slate-500">Token:</span>
                    <span className="font-mono font-bold text-base text-[#0F2547]">
                      {ex.token}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(ex.token)}
                      className="text-slate-500 hover:text-sky-700 cursor-pointer"
                      title="Salin Token"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => regenerateExamToken(ex)}
                      className="text-slate-500 hover:text-sky-700 cursor-pointer"
                      title="Ganti Token Baru"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleExamActive(ex)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                      ex.aktif
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-slate-300 bg-white text-slate-600'
                    }`}
                  >
                    <Power className="h-3.5 w-3.5" />
                    <span>{ex.aktif ? 'Nonaktifkan' : 'Aktifkan'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => loadExamForEdit(ex)}
                    className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-sky-700 cursor-pointer"
                    title="Edit Ujian"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(ex)}
                    className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-600 cursor-pointer"
                    title="Hapus Ujian"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-[#0F2547]">Hapus Jadwal Ujian?</h3>
            <p className="text-sm text-slate-600">
              Ujian <strong>{confirmDelete.namaUjian}</strong> beserta riwayat sesi pengerjaannya
              akan dihapus.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteExam}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

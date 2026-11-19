import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Database,
  Download,
  RefreshCw,
  Save,
  Server,
  Upload,
} from 'lucide-react';
import { DEFAULT_SCHOOL_LOGO } from '../data/demoData.ts';
import {
  importFullDatabase,
  resetDemoDatabase,
  updateAdminAccount,
  updateSchoolProfile,
} from '../services/api.ts';
import type { AdminAccount, AppDatabase, SchoolProfile } from '../types.ts';
import { downloadJsonFile } from '../utils/scoring.ts';

interface AdminSettingsProps {
  db: AppDatabase;
  onRefreshState: () => Promise<void>;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({ db, onRefreshState }) => {
  const [school, setSchool] = useState<SchoolProfile>(db.school);
  const [admin, setAdmin] = useState<AdminAccount>(db.admin);
  const [feedback, setFeedback] = useState('');
  const [confirmResetDemo, setConfirmResetDemo] = useState(false);

  useEffect(() => {
    setSchool(db.school);
  }, [db.school]);

  useEffect(() => {
    setAdmin(db.admin);
  }, [db.admin]);

  const handleSaveSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSchoolProfile(school);
      await onRefreshState();
      setFeedback('Identitas sekolah dan logo berhasil disimpan permanen.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Gagal menyimpan identitas sekolah.');
    }
  };

  const handleSaveAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateAdminAccount(admin);
      await onRefreshState();
      setFeedback('Akun Admin/Guru berhasil diperbarui dan disimpan.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Gagal menyimpan akun Admin/Guru.');
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const updated = { ...school, logoUrl: String(reader.result || DEFAULT_SCHOOL_LOGO) };
      setSchool(updated);
      try {
        await updateSchoolProfile(updated);
        await onRefreshState();
        setFeedback('Logo sekolah baru berhasil diunggah dan disimpan permanen.');
      } catch {
        setFeedback('Logo dipilih. Klik "Simpan Identitas Sekolah" untuk menyimpan ke server.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImportDatabase = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as AppDatabase;
      await importFullDatabase(parsed);
      await onRefreshState();
      setFeedback('Seluruh database backup JSON berhasil dipulihkan.');
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Gagal membaca file backup JSON.'
      );
    }
    e.target.value = '';
  };

  const handleResetDemo = async () => {
    await resetDemoDatabase();
    await onRefreshState();
    setConfirmResetDemo(false);
    setFeedback('Data sistem berhasil dikembalikan ke pengaturan awal MI PSM PARON.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#0F2547]">Pengaturan Sekolah &amp; Sistem</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Kelola identitas madrasah, akun proktor, pencadangan JSON, serta panduan penggunaan.
        </p>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Identitas Sekolah */}
        <form
          onSubmit={handleSaveSchool}
          className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
        >
          <h3 className="text-base font-bold text-[#0F2547]">Identitas Sekolah / Madrasah</h3>

          <div className="flex items-center gap-4 pb-2">
            <img
              src={school.logoUrl || DEFAULT_SCHOOL_LOGO}
              alt="Logo Sekolah"
              referrerPolicy="no-referrer"
              className="h-16 w-16 rounded-xl object-contain p-1 border border-slate-200 bg-white"
            />
            <div className="space-y-1.5">
              <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                <Upload className="h-3.5 w-3.5" />
                <span>Unggah Logo Sekolah</span>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
              <p className="text-[11px] text-slate-500">Format PNG/JPG, tampil di header &amp; kartu cetak.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Sekolah / Madrasah
              </label>
              <input
                type="text"
                required
                value={school.namaSekolah}
                onChange={(e) => setSchool({ ...school, namaSekolah: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Jenjang</label>
              <input
                type="text"
                required
                value={school.jenjang}
                onChange={(e) => setSchool({ ...school, jenjang: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tahun Pelajaran
              </label>
              <input
                type="text"
                required
                value={school.tahunPelajaran}
                onChange={(e) => setSchool({ ...school, tahunPelajaran: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kelas Sasaran
              </label>
              <input
                type="text"
                required
                value={school.kelasDefault}
                onChange={(e) => setSchool({ ...school, kelasDefault: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Kepala Madrasah
              </label>
              <input
                type="text"
                required
                value={school.namaKepalaMadrasah}
                onChange={(e) => setSchool({ ...school, namaKepalaMadrasah: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Operator / Proktor
              </label>
              <input
                type="text"
                required
                value={school.namaOperator}
                onChange={(e) => setSchool({ ...school, namaOperator: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alamat Madrasah
              </label>
              <input
                type="text"
                value={school.alamat || ''}
                onChange={(e) => setSchool({ ...school, alamat: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold cursor-pointer"
            >
              <Save className="h-4 w-4" />
              <span>Simpan Identitas Sekolah</span>
            </button>
          </div>
        </form>

        {/* Akun Admin & Backup JSON */}
        <div className="lg:col-span-5 space-y-6">
          <form
            onSubmit={handleSaveAdmin}
            className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-[#0F2547]">Akun Admin / Guru</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Tampilan Guru/Admin
                </label>
                <input
                  type="text"
                  required
                  value={admin.name}
                  onChange={(e) => setAdmin({ ...admin, name: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    required
                    value={admin.username}
                    onChange={(e) => setAdmin({ ...admin, username: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kata Sandi
                  </label>
                  <input
                    type="text"
                    required
                    value={admin.password}
                    onChange={(e) => setAdmin({ ...admin, password: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-sm"
                  />
                </div>
              </div>
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0F2547] hover:bg-[#173566] text-white text-xs font-semibold cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Simpan Akun Admin</span>
            </button>
          </form>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-base font-bold text-[#0F2547] flex items-center gap-2">
              <Database className="h-4 w-4 text-sky-600" />
              <span>Pencadangan &amp; Pemulihan Data (JSON)</span>
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Ekspor seluruh data (sekolah, kelas, siswa, 40+ bank soal, jadwal, dan hasil ujian)
              sebagai cadangan JSON atau pulihkan data kapan saja.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadJsonFile('backup-tka-mi-psm-paron.json', db)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Ekspor Backup JSON</span>
              </button>
              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer">
                <Upload className="h-3.5 w-3.5" />
                <span>Pulihkan dari JSON</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportDatabase}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={() => setConfirmResetDemo(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-orange-300 bg-orange-50 hover:bg-orange-100 text-xs font-semibold text-orange-800 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Reset Awal Sistem</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Panduan & Arsitektur Sistem */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
          <h3 className="text-base font-bold text-[#0F2547] flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-sky-600" />
            <span>Panduan Penggunaan (Guru &amp; Siswa)</span>
          </h3>
          <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
            <div>
              <p className="font-bold text-[#0F2547]">1. Untuk Guru / Admin:</p>
              <p>
                Lengkapi data peserta di menu <strong>Data Peserta</strong>, kelola soal Matematika
                &amp; Bahasa Indonesia di <strong>Bank Soal</strong>, buat paket ujian di{' '}
                <strong>Buat Ujian</strong>, bagikan <strong>Token Ujian</strong> ke siswa, lalu
                pantau progres di <strong>Monitoring</strong> dan cetak rekap di{' '}
                <strong>Hasil Ujian</strong>.
              </p>
            </div>
            <div>
              <p className="font-bold text-[#0F2547]">2. Untuk Siswa Kelas VI:</p>
              <p>
                Masuk memakai Nomor Peserta dan sandi, pilih jadwal ujian aktif, masukkan Token
                Ujian, kerjakan soal satu per satu, gunakan <em>Tandai Ragu-ragu</em> bila perlu,
                lalu tekan <em>Selesai Ujian</em>.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
          <h3 className="text-base font-bold text-[#0F2547] flex items-center gap-2">
            <Server className="h-4 w-4 text-emerald-600" />
            <span>Arsitektur Online Multi-Siswa &amp; Offline</span>
          </h3>
          <p className="text-xs text-slate-700 leading-relaxed">
            Aplikasi ini menjalankan server terpusat Express (<code className="font-mono">server.ts</code>)
            dengan validasi token, jadwal mulai-selesai, penguncian pengiriman ganda, dan
            penyimpanan berkala di server sehingga beberapa siswa dapat mengerjakan secara bersamaan
            dalam satu jaringan sekolah maupun internet. Untuk skala kabupaten/multi-madrasah dengan
            ratusan siswa serentak, penyimpanan JSON server dapat ditingkatkan langsung ke
            PostgreSQL/MySQL tanpa mengubah antarmuka ujian.
          </p>
        </div>
      </div>

      {confirmResetDemo && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-[#0F2547]">Kembalikan ke Pengaturan Awal?</h3>
            <p className="text-sm text-slate-600">
              Data peserta dan hasil ujian akan dikosongkan, sementara identitas MI PSM PARON, 40
              bank soal, dan jadwal ujian dikembalikan ke pengaturan awal.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmResetDemo(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleResetDemo}
                className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold cursor-pointer"
              >
                Ya, Reset Sistem
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

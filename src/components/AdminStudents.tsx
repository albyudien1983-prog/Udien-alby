import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { DEFAULT_SCHOOL_LOGO } from '../data/demoData.ts';
import {
  bulkImportStudents,
  createClassGroup,
  createStudent,
  deleteClassGroup,
  deleteStudent,
  updateClassGroup,
  updateStudent,
} from '../services/api.ts';
import type { AppDatabase, ClassGroup, Student } from '../types.ts';
import {
  downloadStudentExcelTemplate,
  exportStudentsToExcel,
  parseStudentsFromSpreadsheet,
  type ParsedStudentRow,
} from '../utils/excelStudents.ts';
import { exportRowsToCsv } from '../utils/scoring.ts';

interface AdminStudentsProps {
  db: AppDatabase;
  onRefreshState: () => Promise<void>;
}

export const AdminStudents: React.FC<AdminStudentsProps> = ({ db, onRefreshState }) => {
  const [search, setSearch] = useState('');
  const [filterKelas, setFilterKelas] = useState('ALL');
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [studentForm, setStudentForm] = useState<Omit<Student, 'id'>>({
    nomorPeserta: '',
    username: '',
    password: '123',
    nama: '',
    kelasId: db.classes[0]?.id || '',
    jenisKelamin: 'L',
  });

  const [showClassModal, setShowClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassGroup | null>(null);
  const [classForm, setClassForm] = useState<Omit<ClassGroup, 'id'>>({
    namaKelas: '',
    tingkat: 'Kelas VI',
    waliKelas: '',
  });

  const [showPrintCards, setShowPrintCards] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'student' | 'class';
    id: string;
    label: string;
  } | null>(null);

  // Student & Class form saving/error states
  const [studentSaving, setStudentSaving] = useState(false);
  const [studentFormError, setStudentFormError] = useState('');
  const [classSaving, setClassSaving] = useState(false);
  const [classFormError, setClassFormError] = useState('');

  // Excel Upload Tab & Preview State inside Tambah Peserta Modal
  const [studentModalTab, setStudentModalTab] = useState<'manual' | 'excel'>('manual');
  const [excelFileName, setExcelFileName] = useState('');
  const [excelSheetName, setExcelSheetName] = useState('');
  const [excelFallbackClassId, setExcelFallbackClassId] = useState(db.classes[0]?.id || '');
  const [excelRows, setExcelRows] = useState<ParsedStudentRow[]>([]);
  const [excelError, setExcelError] = useState('');
  const [excelSaving, setExcelSaving] = useState(false);
  const [autoSaveExcel, setAutoSaveExcel] = useState(true);
  const [excelAlreadySaved, setExcelAlreadySaved] = useState(false);
  const [excelSavedCount, setExcelSavedCount] = useState(0);

  const classMap = useMemo(() => new Map(db.classes.map((c) => [c.id, c])), [db.classes]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.students.filter((s) => {
      const matchClass = filterKelas === 'ALL' || s.kelasId === filterKelas;
      const matchQuery =
        !q ||
        s.nama.toLowerCase().includes(q) ||
        s.nomorPeserta.toLowerCase().includes(q) ||
        s.username.toLowerCase().includes(q);
      return matchClass && matchQuery;
    });
  }, [db.students, filterKelas, search]);

  const openNewStudent = (initialTab: 'manual' | 'excel' = 'manual') => {
    setEditingStudent(null);
    const nextNum = `2606${String(db.students.length + 1).padStart(3, '0')}`;
    const defaultClsId = db.classes[0]?.id || '';
    setStudentForm({
      nomorPeserta: nextNum,
      username: nextNum,
      password: '123',
      nama: '',
      kelasId: defaultClsId,
      jenisKelamin: 'L',
    });
    setStudentFormError('');
    setStudentModalTab(initialTab);
    setExcelFileName('');
    setExcelSheetName('');
    setExcelFallbackClassId(defaultClsId);
    setExcelRows([]);
    setExcelError('');
    setExcelAlreadySaved(false);
    setExcelSavedCount(0);
    setShowStudentModal(true);
  };

  const openEditStudent = (s: Student) => {
    setEditingStudent(s);
    setStudentFormError('');
    setStudentModalTab('manual');
    setStudentForm({
      nomorPeserta: s.nomorPeserta,
      username: s.username,
      password: s.password,
      nama: s.nama,
      kelasId: s.kelasId,
      jenisKelamin: s.jenisKelamin,
    });
    setShowStudentModal(true);
  };

  const saveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudentSaving(true);
    setStudentFormError('');
    try {
      if (editingStudent) {
        await updateStudent({ ...studentForm, id: editingStudent.id });
        setFeedback(`Data peserta "${studentForm.nama}" diperbarui dan tersimpan permanen.`);
      } else {
        await createStudent({
          ...studentForm,
          id: `STD-${Date.now()}`,
        });
        setFilterKelas('ALL');
        setSearch('');
        setFeedback(`Peserta "${studentForm.nama}" berhasil ditambahkan dan tersimpan permanen.`);
      }
      setShowStudentModal(false);
      await onRefreshState();
    } catch (err) {
      setStudentFormError(
        err instanceof Error ? err.message : 'Gagal menyimpan data peserta ke server.'
      );
    } finally {
      setStudentSaving(false);
    }
  };

  const openNewClass = () => {
    setEditingClass(null);
    setClassFormError('');
    setClassForm({ namaKelas: '', tingkat: 'Kelas VI', waliKelas: '' });
    setShowClassModal(true);
  };

  const openEditClass = (c: ClassGroup) => {
    setEditingClass(c);
    setClassFormError('');
    setClassForm({ namaKelas: c.namaKelas, tingkat: c.tingkat, waliKelas: c.waliKelas });
    setShowClassModal(true);
  };

  const saveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setClassSaving(true);
    setClassFormError('');
    try {
      if (editingClass) {
        await updateClassGroup({ ...classForm, id: editingClass.id });
        setFeedback(`Kelas "${classForm.namaKelas}" diperbarui dan tersimpan permanen.`);
      } else {
        await createClassGroup({
          ...classForm,
          id: `KLS-${Date.now()}`,
        });
        setFeedback(`Kelas "${classForm.namaKelas}" berhasil ditambahkan dan tersimpan permanen.`);
      }
      setShowClassModal(false);
      await onRefreshState();
    } catch (err) {
      setClassFormError(
        err instanceof Error ? err.message : 'Gagal menyimpan data kelas ke server.'
      );
    } finally {
      setClassSaving(false);
    }
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'student') {
      await deleteStudent(confirmDelete.id);
      setFeedback(`Peserta "${confirmDelete.label}" telah dihapus.`);
    } else {
      await deleteClassGroup(confirmDelete.id);
      setFeedback(`Kelas "${confirmDelete.label}" telah dihapus.`);
    }
    setConfirmDelete(null);
    await onRefreshState();
  };

  const handleSpreadsheetFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelError('');
    setExcelRows([]);
    setExcelAlreadySaved(false);
    setExcelSavedCount(0);
    setExcelFileName(file.name);
    try {
      const fallbackId = excelFallbackClassId || db.classes[0]?.id || '';
      const result = await parseStudentsFromSpreadsheet(
        file,
        db.classes,
        db.students,
        fallbackId
      );
      setExcelRows(result.rows);
      setExcelSheetName(result.sheetName);

      const readyRows = result.rows.filter((r) => !r.isDuplicate).map((r) => r.student);
      if (autoSaveExcel && readyRows.length > 0) {
        setExcelSaving(true);
        try {
          const saved = await bulkImportStudents(readyRows);
          setFilterKelas('ALL');
          setSearch('');
          await onRefreshState();
          setExcelAlreadySaved(true);
          setExcelSavedCount(saved.addedCount);
          const skippedInfo =
            saved.skippedCount > 0 ? ` (${saved.skippedCount} duplikat dilewati)` : '';
          setFeedback(
            `${saved.addedCount} peserta didik dari "${file.name}" langsung disimpan permanen ke server${skippedInfo}.`
          );
        } catch (saveErr) {
          setExcelError(
            saveErr instanceof Error
              ? `File terbaca, namun gagal menyimpan ke server: ${saveErr.message}`
              : 'File terbaca, namun gagal menyimpan data peserta ke server.'
          );
        } finally {
          setExcelSaving(false);
        }
      }
    } catch (err) {
      setExcelError(
        err instanceof Error
          ? err.message
          : 'Gagal membaca file Excel/CSV. Pastikan format kolom benar.'
      );
    }
    e.target.value = '';
  };

  const handleFallbackClassChange = (newClassId: string) => {
    setExcelFallbackClassId(newClassId);
    const clsName = classMap.get(newClassId)?.namaKelas || '-';
    setExcelRows((prev) =>
      prev.map((row) =>
        row.usedFallbackClass
          ? {
              ...row,
              matchedClassName: clsName,
              student: { ...row.student, kelasId: newClassId },
            }
          : row
      )
    );
  };

  const readyExcelStudents = useMemo(
    () => excelRows.filter((r) => !r.isDuplicate).map((r) => r.student),
    [excelRows]
  );

  const handleConfirmExcelImport = async () => {
    if (readyExcelStudents.length === 0) {
      if (excelAlreadySaved) {
        setShowStudentModal(false);
        return;
      }
      setExcelError('Tidak ada data peserta baru yang siap diimpor.');
      return;
    }
    setExcelSaving(true);
    setExcelError('');
    try {
      const saved = await bulkImportStudents(readyExcelStudents, {
        updateExisting: excelAlreadySaved,
      });
      setFilterKelas('ALL');
      setSearch('');
      await onRefreshState();
      setExcelAlreadySaved(true);
      const totalSaved = saved.addedCount + saved.updatedCount;
      setExcelSavedCount(totalSaved > 0 ? totalSaved : readyExcelStudents.length);
      setShowStudentModal(false);
      setFeedback(
        `${totalSaved > 0 ? totalSaved : readyExcelStudents.length} peserta didik dari "${excelFileName}" berhasil disimpan permanen ke server.`
      );
    } catch (err) {
      setExcelError(
        err instanceof Error ? err.message : 'Gagal menyimpan data peserta dari Excel.'
      );
    } finally {
      setExcelSaving(false);
    }
  };

  const handleExportStudentsCsv = () => {
    exportRowsToCsv(
      'data-peserta-tka.csv',
      ['Nomor Peserta', 'Nama Lengkap', 'Kelas', 'L/P', 'Username', 'Password'],
      filteredStudents.map((s) => [
        s.nomorPeserta,
        s.nama,
        classMap.get(s.kelasId)?.namaKelas || '-',
        s.jenisKelamin,
        s.username,
        s.password,
      ])
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-2xl font-bold text-[#0F2547]">Data Peserta &amp; Rombel</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Kelola rombongan belajar, data akun siswa, dan cetak kartu peserta ujian TKA.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowPrintCards((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span>{showPrintCards ? 'Tutup Kartu Peserta' : 'Cetak Kartu Peserta'}</span>
          </button>
          <button
            type="button"
            onClick={openNewClass}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Tambah Kelas</span>
          </button>
          <button
            type="button"
            onClick={() => openNewStudent('excel')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-800 whitespace-nowrap cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4" />
            <span>Unggah Excel</span>
          </button>
          <button
            type="button"
            onClick={() => openNewStudent('manual')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Tambah Peserta</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 flex items-center justify-between no-print">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback('')} className="text-emerald-700 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Printable Participant Cards View */}
      {showPrintCards && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
          <div className="flex items-center justify-between no-print">
            <h3 className="text-base font-bold text-[#0F2547]">
              Pratinjau Kartu Peserta Ujian TKA ({filteredStudents.length} Kartu)
            </h3>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0F2547] text-white text-xs font-semibold cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>Cetak / Simpan PDF</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredStudents.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-slate-300 p-4 space-y-3 print-break-inside-avoid bg-white"
              >
                <div className="flex items-center gap-3 pb-2.5 border-b border-slate-200">
                  <img
                    src={db.school.logoUrl || DEFAULT_SCHOOL_LOGO}
                    alt={db.school.namaSekolah}
                    referrerPolicy="no-referrer"
                    className="h-9 w-9 rounded object-contain p-0.5 bg-white border border-slate-200"
                  />
                  <div>
                    <p className="text-xs font-bold text-[#0F2547]">KARTU PESERTA TKA</p>
                    <p className="text-[11px] text-slate-600">
                      {db.school.namaSekolah} · TP {db.school.tahunPelajaran}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Nama Peserta</span>
                    <p className="font-bold text-slate-900">{s.nama}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Kelas</span>
                    <p className="font-semibold text-slate-900">
                      {classMap.get(s.kelasId)?.namaKelas || '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Username / No. Peserta</span>
                    <p className="font-mono font-bold text-[#0F2547]">{s.nomorPeserta}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Kata Sandi</span>
                    <p className="font-mono font-bold text-slate-900">{s.password}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Classes Cards */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 no-print">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#0F2547] flex items-center gap-2">
            <Users className="h-4 w-4 text-sky-600" />
            <span>Daftar Kelas / Rombongan Belajar</span>
          </h3>
          <span className="text-xs text-slate-500">{db.classes.length} kelas</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {db.classes.map((cls) => {
            const count = db.students.filter((s) => s.kelasId === cls.id).length;
            return (
              <div
                key={cls.id}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 flex items-start justify-between gap-3"
              >
                <div>
                  <p className="font-bold text-[#0F2547] text-sm">
                    {cls.namaKelas} · {cls.tingkat}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">Wali: {cls.waliKelas}</p>
                  <p className="text-xs font-mono text-sky-700 mt-1.5 tabular-nums">
                    {count} peserta didik
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditClass(cls)}
                    aria-label="Edit kelas"
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-white hover:text-sky-700 cursor-pointer"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmDelete({ type: 'class', id: cls.id, label: cls.namaKelas })
                    }
                    aria-label="Hapus kelas"
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-white hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
            <div className="relative flex-1 max-w-xs">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama atau nomor peserta..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <select
              value={filterKelas}
              onChange={(e) => setFilterKelas(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
            >
              <option value="ALL">Semua Kelas</option>
              {db.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.namaKelas}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => downloadStudentExcelTemplate(db.classes)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Template Excel</span>
            </button>
            <button
              type="button"
              onClick={() => openNewStudent('excel')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-xs font-semibold text-emerald-800 whitespace-nowrap cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Impor Excel / CSV</span>
            </button>
            <button
              type="button"
              onClick={() => exportStudentsToExcel(filteredStudents, db.classes)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Ekspor Excel</span>
            </button>
            <button
              type="button"
              onClick={handleExportStudentsCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Ekspor CSV</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500 bg-slate-50">
                <th className="py-3 px-3 text-left font-semibold">No. Peserta</th>
                <th className="py-3 px-3 text-left font-semibold">Nama Peserta</th>
                <th className="py-3 px-3 text-left font-semibold">Kelas</th>
                <th className="py-3 px-3 text-center font-semibold">L/P</th>
                <th className="py-3 px-3 text-left font-semibold">Kata Sandi</th>
                <th className="py-3 px-3 text-right font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center space-y-2 text-slate-500">
                    <p className="font-medium text-slate-700">
                      {db.students.length === 0
                        ? 'Belum ada akun peserta didik yang terdaftar.'
                        : 'Tidak ada peserta didik yang sesuai dengan pencarian.'}
                    </p>
                    {db.students.length === 0 && (
                      <p className="text-xs text-slate-500">
                        Klik <strong>+ Tambah Peserta</strong> untuk input manual atau{' '}
                        <strong>Unggah Excel</strong> untuk mengimpor daftar siswa dari file
                        Excel (.xlsx / .xls / .csv).
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="py-3 px-3 font-mono font-semibold text-[#0F2547] tabular-nums">
                      {s.nomorPeserta}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-900">{s.nama}</td>
                    <td className="py-3 px-3 text-slate-600">
                      {classMap.get(s.kelasId)?.namaKelas || '-'}
                    </td>
                    <td className="py-3 px-3 text-center text-slate-600">{s.jenisKelamin}</td>
                    <td className="py-3 px-3 font-mono text-slate-600">{s.password}</td>
                    <td className="py-3 px-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditStudent(s)}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-sky-700 cursor-pointer"
                          title="Edit peserta"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDelete({ type: 'student', id: s.id, label: s.nama })
                          }
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-red-600 cursor-pointer"
                          title="Hapus peserta"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Student (Manual Input & Excel Upload) */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div
            className={`bg-white rounded-2xl border border-slate-200 w-full p-6 space-y-4 my-8 max-h-[92vh] overflow-y-auto ${
              !editingStudent && studentModalTab === 'excel' ? 'max-w-3xl' : 'max-w-md'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-[#0F2547]">
                {editingStudent ? 'Edit Data Peserta' : 'Tambah Peserta Didik'}
              </h3>
              <button
                type="button"
                onClick={() => setShowStudentModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!editingStudent && (
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100">
                <button
                  type="button"
                  onClick={() => setStudentModalTab('manual')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    studentModalTab === 'manual'
                      ? 'bg-white text-[#0F2547] shadow-sm'
                      : 'text-slate-600 hover:text-[#0F2547]'
                  }`}
                >
                  Input Manual (1 Siswa)
                </button>
                <button
                  type="button"
                  onClick={() => setStudentModalTab('excel')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    studentModalTab === 'excel'
                      ? 'bg-white text-emerald-800 shadow-sm'
                      : 'text-slate-600 hover:text-[#0F2547]'
                  }`}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>Unggah Data Excel</span>
                </button>
              </div>
            )}

            {editingStudent || studentModalTab === 'manual' ? (
              <form onSubmit={saveStudent} className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nomor Peserta / Username
                    </label>
                    <input
                      type="text"
                      required
                      value={studentForm.nomorPeserta}
                      onChange={(e) =>
                        setStudentForm({
                          ...studentForm,
                          nomorPeserta: e.target.value,
                          username: e.target.value,
                        })
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama Lengkap Siswa
                    </label>
                    <input
                      type="text"
                      required
                      value={studentForm.nama}
                      onChange={(e) => setStudentForm({ ...studentForm, nama: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Kelas
                      </label>
                      <select
                        value={studentForm.kelasId}
                        onChange={(e) =>
                          setStudentForm({ ...studentForm, kelasId: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                      >
                        {db.classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.namaKelas}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Jenis Kelamin
                      </label>
                      <select
                        value={studentForm.jenisKelamin}
                        onChange={(e) =>
                          setStudentForm({
                            ...studentForm,
                            jenisKelamin: e.target.value as 'L' | 'P',
                          })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                      >
                        <option value="L">Laki-laki (L)</option>
                        <option value="P">Perempuan (P)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Kata Sandi
                    </label>
                    <input
                      type="text"
                      required
                      value={studentForm.password}
                      onChange={(e) =>
                        setStudentForm({ ...studentForm, password: e.target.value })
                      }
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-sm"
                    />
                  </div>
                </div>

                {studentFormError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{studentFormError}</span>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowStudentModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={studentSaving}
                    className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer"
                  >
                    {studentSaving ? 'Menyimpan...' : 'Simpan Peserta'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-[#0F2547]">
                        1. Pilih File Excel (.xlsx, .xls) atau CSV
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Kolom yang dikenali otomatis: Nomor Peserta, Nama Lengkap, Kelas, L/P,
                        Username, Password.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadStudentExcelTemplate(db.classes)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Unduh Template Excel (.xlsx)</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Kelas Default (jika kolom Kelas kosong/berbeda)
                      </label>
                      <select
                        value={excelFallbackClassId}
                        disabled={excelSaving}
                        onChange={(e) => handleFallbackClassChange(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white disabled:opacity-60"
                      >
                        {db.classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.namaKelas} · {c.tingkat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-end">
                      <label className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#0F2547] hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer">
                        <Upload className="h-4 w-4" />
                        <span>
                          {excelSaving
                            ? 'Menyimpan ke server...'
                            : excelFileName
                              ? `Ganti File (${excelFileName})`
                              : 'Pilih File Excel / CSV'}
                        </span>
                        <input
                          type="file"
                          disabled={excelSaving}
                          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                          onChange={handleSpreadsheetFileSelect}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={autoSaveExcel}
                      onChange={(e) => setAutoSaveExcel(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600"
                    />
                    <span>
                      Simpan otomatis permanen setelah file Excel/CSV dibaca (disarankan agar data tidak hilang)
                    </span>
                  </label>
                </div>

                {excelError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{excelError}</span>
                  </div>
                )}

                {excelRows.length > 0 && (
                  <div className="space-y-2.5">
                    {excelAlreadySaved ? (
                      <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>
                            {excelSavedCount} peserta baru sudah tersimpan permanen ke database server!
                          </span>
                        </span>
                      </div>
                    ) : (
                      readyExcelStudents.length > 0 && (
                        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">
                            Data belum tersimpan ke server — klik Simpan agar data tidak hilang.
                          </span>
                          <button
                            type="button"
                            disabled={excelSaving}
                            onClick={handleConfirmExcelImport}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                          >
                            {excelSaving
                              ? 'Menyimpan...'
                              : `Simpan ${readyExcelStudents.length} Peserta Sekarang`}
                          </button>
                        </div>
                      )
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-800">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        Sheet &ldquo;{excelSheetName}&rdquo;: {excelRows.length} baris terbaca ·{' '}
                        {excelAlreadySaved
                          ? `${excelSavedCount} tersimpan`
                          : `${readyExcelStudents.length} peserta baru siap disimpan`}
                      </span>
                      {excelRows.length - readyExcelStudents.length > 0 && (
                        <span className="text-amber-700 font-medium">
                          {excelRows.length - readyExcelStudents.length} duplikat dilewati
                        </span>
                      )}
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-64 overflow-y-auto">
                      <table className="w-full border-collapse text-xs">
                        <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-600">
                          <tr>
                            <th className="py-2 px-3 text-left font-semibold">No. Peserta</th>
                            <th className="py-2 px-3 text-left font-semibold">Nama Lengkap</th>
                            <th className="py-2 px-3 text-left font-semibold">Kelas</th>
                            <th className="py-2 px-3 text-center font-semibold">L/P</th>
                            <th className="py-2 px-3 text-left font-semibold">Password</th>
                            <th className="py-2 px-3 text-left font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {excelRows.map((row, idx) => (
                            <tr
                              key={`${row.student.nomorPeserta}-${idx}`}
                              className={`border-b border-slate-100 ${
                                row.isDuplicate ? 'bg-amber-50/60 text-slate-400' : 'bg-white'
                              }`}
                            >
                              <td className="py-2 px-3 font-mono font-semibold text-[#0F2547]">
                                {row.student.nomorPeserta}
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-900">
                                {row.student.nama}
                              </td>
                              <td className="py-2 px-3">{row.matchedClassName}</td>
                              <td className="py-2 px-3 text-center">{row.student.jenisKelamin}</td>
                              <td className="py-2 px-3 font-mono">{row.student.password}</td>
                              <td className="py-2 px-3 font-semibold">
                                {row.isDuplicate ? (
                                  <span className="text-amber-700">Sudah ada</span>
                                ) : excelAlreadySaved ? (
                                  <span className="text-emerald-700">Tersimpan</span>
                                ) : (
                                  <span className="text-sky-700">Siap impor</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowStudentModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 cursor-pointer"
                  >
                    Tutup
                  </button>
                  <button
                    type="button"
                    disabled={excelSaving || readyExcelStudents.length === 0}
                    onClick={handleConfirmExcelImport}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer"
                  >
                    <Save className="h-4 w-4" />
                    <span>
                      {excelSaving
                        ? 'Menyimpan...'
                        : excelAlreadySaved
                          ? `Simpan Permanen (${readyExcelStudents.length} Peserta)`
                          : `Simpan ${readyExcelStudents.length} Peserta dari Excel`}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Class */}
      {showClassModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={saveClass}
            className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#0F2547]">
                {editingClass ? 'Edit Data Kelas' : 'Tambah Kelas / Rombel'}
              </h3>
              <button
                type="button"
                onClick={() => setShowClassModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Kelas / Rombel
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: VI-B"
                  value={classForm.namaKelas}
                  onChange={(e) => setClassForm({ ...classForm, namaKelas: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tingkat</label>
                <input
                  type="text"
                  required
                  value={classForm.tingkat}
                  onChange={(e) => setClassForm({ ...classForm, tingkat: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Wali Kelas</label>
                <input
                  type="text"
                  required
                  placeholder="Nama Ustadz/Ustadzah Wali Kelas"
                  value={classForm.waliKelas}
                  onChange={(e) => setClassForm({ ...classForm, waliKelas: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
            </div>
            {classFormError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{classFormError}</span>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClassModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={classSaving}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer"
              >
                {classSaving ? 'Menyimpan...' : 'Simpan Kelas'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-[#0F2547]">Konfirmasi Hapus Data</h3>
            <p className="text-sm text-slate-600">
              Apakah Anda yakin ingin menghapus <strong>{confirmDelete.label}</strong>? Tindakan ini
              tidak dapat dibatalkan.
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
                onClick={executeDelete}
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

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  Eye,
  FileText,
  Loader2,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { TKA_KISI_KISI_CATALOG } from '../data/kisiKisiTka.ts';
import {
  bulkImportQuestions,
  createQuestion,
  deleteQuestion,
  generateKisiKisiQuestions,
  parseQuestionDocument,
  solveQuestionKeys,
  updateQuestion,
} from '../services/api.ts';
import type {
  AppDatabase,
  JenisSoal,
  MataUji,
  Question,
  StimulusData,
  StimulusType,
  TingkatKesulitan,
} from '../types.ts';
import { downloadJsonFile } from '../utils/scoring.ts';
import { StimulusRenderer } from './StimulusRenderer.tsx';

interface AdminQuestionBankProps {
  db: AppDatabase;
  fixedMataUji?: MataUji;
  onSwitchMapel?: (m: MataUji) => void;
  onRefreshState: () => Promise<void>;
}

const JENIS_LABELS: Record<JenisSoal, string> = {
  PG: 'Pilihan Ganda',
  PGK: 'PG Kompleks',
  BS: 'Benar / Salah',
  MENJODOHKAN: 'Menjodohkan',
  ISIAN: 'Isian Singkat',
};

function createEmptyQuestion(defaultMataUji: MataUji = 'Matematika'): Question {
  return {
    id: '',
    mataUji: defaultMataUji,
    materi:
      defaultMataUji === 'Bahasa Indonesia'
        ? 'Pemahaman Teks Informasi'
        : 'Bilangan Cacah dan Operasi Hitung',
    kompetensi:
      defaultMataUji === 'Bahasa Indonesia' ? 'Literasi Membaca' : 'Penalaran Numerasi',
    indikator: '',
    tingkatKesulitan: 'Sedang',
    jenisSoal: 'PG',
    stimulus: { type: 'none' },
    pertanyaan: '',
    bobot: 5,
    pembahasan: '',
    pilihan: [
      { key: 'A', text: '' },
      { key: 'B', text: '' },
      { key: 'C', text: '' },
      { key: 'D', text: '' },
    ],
    kunciPG: 'A',
    kunciPGK: ['A', 'B'],
    metodeNilaiPGK: 'partial',
    pernyataanBS: [
      { id: 'bs1', text: '', answer: true },
      { id: 'bs2', text: '', answer: false },
    ],
    pasanganJodoh: [
      { id: 'm1', left: '', right: '' },
      { id: 'm2', left: '', right: '' },
    ],
    kunciIsian: [''],
    createdAt: new Date().toISOString(),
  };
}

export const AdminQuestionBank: React.FC<AdminQuestionBankProps> = ({
  db,
  fixedMataUji,
  onSwitchMapel,
  onRefreshState,
}) => {
  const activeMataUji: MataUji = fixedMataUji || 'Matematika';
  const [search, setSearch] = useState('');
  const [filterMataUji, setFilterMataUji] = useState<'ALL' | MataUji>(fixedMataUji || 'ALL');
  const [filterMateri, setFilterMateri] = useState('ALL');
  const [filterKesulitan, setFilterKesulitan] = useState<'ALL' | TingkatKesulitan>('ALL');
  const [filterJenis, setFilterJenis] = useState<'ALL' | JenisSoal>('ALL');
  const [groupByKompetensi, setGroupByKompetensi] = useState(false);

  const [editing, setEditing] = useState<Question | null>(null);
  const [previewQ, setPreviewQ] = useState<Question | null>(null);
  const [confirmDeleteQ, setConfirmDeleteQ] = useState<Question | null>(null);
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const [questionSaving, setQuestionSaving] = useState(false);
  const [questionFormError, setQuestionFormError] = useState('');

  // Word/PDF Upload & Extraction Modal State
  const [showDocModal, setShowDocModal] = useState(false);
  const [docFileInfo, setDocFileInfo] = useState<{
    name: string;
    mimeType: string;
    size: number;
    base64: string;
  } | null>(null);
  const [docMataUji, setDocMataUji] = useState<'AUTO' | MataUji>(fixedMataUji || 'AUTO');
  const [docMode, setDocMode] = useState<'ai' | 'pattern'>('ai');
  const [docParsing, setDocParsing] = useState(false);
  const [docError, setDocError] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState<Question[]>([]);
  const [selectedParsedIds, setSelectedParsedIds] = useState<string[]>([]);
  const [docSaving, setDocSaving] = useState(false);
  const [docAutoSave, setDocAutoSave] = useState(true);
  const [docAutoSolveKeys, setDocAutoSolveKeys] = useState(true);
  const [docAiSolvedIds, setDocAiSolvedIds] = useState<string[]>([]);
  const [docMissingKeyIds, setDocMissingKeyIds] = useState<string[]>([]);
  const [docSolvingKeys, setDocSolvingKeys] = useState(false);
  const [docAlreadySaved, setDocAlreadySaved] = useState(false);
  const [docSavedCount, setDocSavedCount] = useState(0);

  // Kisi-Kisi TKA Question Generator State inside Tambah Soal Modal
  const [addQuestionTab, setAddQuestionTab] = useState<'manual' | 'generator'>('manual');
  const [genMataUji, setGenMataUji] = useState<MataUji>(activeMataUji);
  const [genKisiTopic, setGenKisiTopic] = useState<string>(
    TKA_KISI_KISI_CATALOG[activeMataUji][0].id
  );
  const [genMateriKhusus, setGenMateriKhusus] = useState<string>('');
  const [genJenisSoal, setGenJenisSoal] = useState<JenisSoal | 'CAMPURAN_TKA'>('CAMPURAN_TKA');
  const [genKesulitan, setGenKesulitan] = useState<TingkatKesulitan | 'CAMPURAN'>('CAMPURAN');
  const [genJumlah, setGenJumlah] = useState<number>(5);
  const [genTema, setGenTema] = useState<string>('');
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState('');
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
  const [selectedGenIds, setSelectedGenIds] = useState<string[]>([]);
  const [genSaving, setGenSaving] = useState(false);
  const [genAutoSave, setGenAutoSave] = useState(true);
  const [genAlreadySaved, setGenAlreadySaved] = useState(false);
  const [genSavedCount, setGenSavedCount] = useState(0);
  const [genDurationSec, setGenDurationSec] = useState<number | null>(null);

  useEffect(() => {
    if (fixedMataUji) {
      setFilterMataUji(fixedMataUji);
      setFilterMateri('ALL');
      setDocMataUji(fixedMataUji);
      setGenMataUji(fixedMataUji);
      setGenKisiTopic(TKA_KISI_KISI_CATALOG[fixedMataUji][0].id);
      setGenMateriKhusus('');
    }
  }, [fixedMataUji]);

  const allMateri = useMemo(() => {
    const list = db.questions
      .filter((q) => filterMataUji === 'ALL' || q.mataUji === filterMataUji)
      .map((q) => q.materi);
    return Array.from(new Set(list)).sort();
  }, [db.questions, filterMataUji]);

  const filteredQuestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return db.questions.filter((item) => {
      if (filterMataUji !== 'ALL' && item.mataUji !== filterMataUji) return false;
      if (filterMateri !== 'ALL' && item.materi !== filterMateri) return false;
      if (filterKesulitan !== 'ALL' && item.tingkatKesulitan !== filterKesulitan) return false;
      if (filterJenis !== 'ALL' && item.jenisSoal !== filterJenis) return false;
      if (!q) return true;
      return (
        item.pertanyaan.toLowerCase().includes(q) ||
        item.materi.toLowerCase().includes(q) ||
        item.kompetensi.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
      );
    });
  }, [db.questions, filterMataUji, filterMateri, filterKesulitan, filterJenis, search]);

  const groupedByKompetensi = useMemo(() => {
    const groups = new Map<string, Question[]>();
    filteredQuestions.forEach((q) => {
      const key = `${q.mataUji} · ${q.kompetensi || 'Umum'}`;
      const arr = groups.get(key) || [];
      arr.push(q);
      groups.set(key, arr);
    });
    return Array.from(groups.entries());
  }, [filteredQuestions]);

  const resetQuestionFilters = () => {
    setSearch('');
    setFilterMateri('ALL');
    setFilterKesulitan('ALL');
    setFilterJenis('ALL');
  };

  const formatMapelBreakdown = (items: Question[]) => {
    const mtk = items.filter((q) => q.mataUji === 'Matematika').length;
    const ind = items.filter((q) => q.mataUji === 'Bahasa Indonesia').length;
    if (mtk > 0 && ind > 0) {
      return ` (${mtk} Matematika, ${ind} Bahasa Indonesia)`;
    }
    if (fixedMataUji && mtk > 0 && fixedMataUji !== 'Matematika') {
      return ` (${mtk} soal Matematika — buka menu Bank Soal Matematika untuk melihatnya)`;
    }
    if (fixedMataUji && ind > 0 && fixedMataUji !== 'Bahasa Indonesia') {
      return ` (${ind} soal Bahasa Indonesia — buka menu Bank Soal Bahasa Indonesia untuk melihatnya)`;
    }
    return '';
  };

  const handleOpenNew = (initialTab: 'manual' | 'generator' = 'manual') => {
    setAddQuestionTab(initialTab);
    setQuestionFormError('');
    setGenMataUji(activeMataUji);
    setGenKisiTopic(TKA_KISI_KISI_CATALOG[activeMataUji][0].id);
    setGenMateriKhusus('');
    setGenError('');
    setGeneratedQuestions([]);
    setSelectedGenIds([]);
    setGenAlreadySaved(false);
    setGenSavedCount(0);
    setGenDurationSec(null);
    setEditing(createEmptyQuestion(activeMataUji));
  };

  const handleOpenEdit = (q: Question) => {
    setAddQuestionTab('manual');
    setQuestionFormError('');
    setEditing(JSON.parse(JSON.stringify(q)) as Question);
  };

  const handleDuplicate = async (q: Question) => {
    setFeedbackError('');
    try {
      const prefix = q.mataUji === 'Matematika' ? 'MTK' : 'IND';
      const copy: Question = {
        ...JSON.parse(JSON.stringify(q)),
        id: `${prefix}-${Date.now().toString().slice(-4)}`,
        createdAt: new Date().toISOString(),
      };
      await createQuestion(copy);
      resetQuestionFilters();
      await onRefreshState();
      setFeedback(`Soal "${q.id}" berhasil diduplikasi menjadi "${copy.id}" dan tersimpan permanen.`);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Gagal menduplikasi soal ke server.');
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;

    setQuestionSaving(true);
    setQuestionFormError('');
    setFeedbackError('');
    try {
      const isNew = !editing.id;
      const prefix = editing.mataUji === 'Matematika' ? 'MTK' : 'IND';
      const finalQ: Question = {
        ...editing,
        id: editing.id || `${prefix}-${Date.now().toString().slice(-4)}`,
      };

      if (isNew) {
        await createQuestion(finalQ);
        resetQuestionFilters();
        setFeedback(`Soal baru "${finalQ.id}" berhasil disimpan permanen ke bank soal.`);
      } else {
        await updateQuestion(finalQ);
        setFeedback(`Soal "${finalQ.id}" berhasil diperbarui dan tersimpan permanen.`);
      }
      setEditing(null);
      await onRefreshState();
    } catch (err) {
      setQuestionFormError(
        err instanceof Error ? err.message : 'Gagal menyimpan butir soal ke server.'
      );
    } finally {
      setQuestionSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteQ) return;
    setFeedbackError('');
    try {
      await deleteQuestion(confirmDeleteQ.id);
      setFeedback(`Soal "${confirmDeleteQ.id}" berhasil dihapus.`);
      setConfirmDeleteQ(null);
      await onRefreshState();
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Gagal menghapus soal dari server.');
      setConfirmDeleteQ(null);
    }
  };

  const normalizeImportedQuestion = (raw: Partial<Question>, idx: number): Question => {
    const mataUji: MataUji =
      raw.mataUji === 'Bahasa Indonesia' || raw.mataUji === 'Matematika'
        ? raw.mataUji
        : activeMataUji;
    const prefix = mataUji === 'Matematika' ? 'MTK' : 'IND';
    const validJenis: JenisSoal[] = ['PG', 'PGK', 'BS', 'MENJODOHKAN', 'ISIAN'];
    const jenisSoal: JenisSoal =
      raw.jenisSoal && validJenis.includes(raw.jenisSoal) ? raw.jenisSoal : 'PG';
    const validDiff: TingkatKesulitan[] = ['Mudah', 'Sedang', 'Sulit'];
    const tingkatKesulitan: TingkatKesulitan =
      raw.tingkatKesulitan && validDiff.includes(raw.tingkatKesulitan)
        ? raw.tingkatKesulitan
        : 'Sedang';
    return {
      ...createEmptyQuestion(mataUji),
      ...raw,
      id: raw.id && String(raw.id).trim() ? String(raw.id).trim() : `${prefix}-IMP-${Date.now().toString().slice(-4)}-${idx}`,
      mataUji,
      materi: raw.materi?.trim() || 'Umum',
      kompetensi: raw.kompetensi?.trim() || raw.materi?.trim() || 'Umum',
      indikator: raw.indikator?.trim() || 'Hasil impor soal',
      tingkatKesulitan,
      jenisSoal,
      pertanyaan: raw.pertanyaan?.trim() || `Butir Soal #${idx + 1}`,
      bobot: typeof raw.bobot === 'number' && raw.bobot > 0 ? raw.bobot : 5,
      pembahasan: raw.pembahasan || '',
      createdAt: raw.createdAt || new Date().toISOString(),
    };
  };

  const handleImportJsonOrCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeedback('');
    setFeedbackError('');
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.json')) {
        const parsed = JSON.parse(text);
        const rawList = Array.isArray(parsed) ? parsed : parsed.questions;
        if (!Array.isArray(rawList) || rawList.length === 0) {
          throw new Error('File JSON harus berisi array soal yang tidak kosong.');
        }
        const normalized = rawList.map((item, idx) =>
          normalizeImportedQuestion((item || {}) as Partial<Question>, idx)
        );
        const saved = await bulkImportQuestions(normalized);
        resetQuestionFilters();
        await onRefreshState();
        setFeedback(
          `${saved.addedCount} soal berhasil diimpor dari JSON dan disimpan permanen${formatMapelBreakdown(normalized)}.`
        );
      } else {
        // Simple CSV format: mataUji,materi,tingkatKesulitan,pertanyaan,opsiA,opsiB,opsiC,opsiD,kunciPG,pembahasan
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const imported: Question[] = [];
        lines.forEach((line, idx) => {
          if (idx === 0 && line.toLowerCase().includes('pertanyaan')) return;
          const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
          if (cols.length >= 9) {
            const col0Lower = cols[0].toLowerCase();
            const mataUji: MataUji = col0Lower.includes('indo')
              ? 'Bahasa Indonesia'
              : col0Lower.includes('mat') || col0Lower.includes('mtk')
                ? 'Matematika'
                : activeMataUji;
            imported.push({
              id: `${mataUji === 'Matematika' ? 'MTK' : 'IND'}-CSV-${Date.now().toString().slice(-3)}${idx}`,
              mataUji,
              materi: cols[1] || 'Umum',
              kompetensi: cols[1] || 'Umum',
              indikator: 'Hasil impor CSV',
              tingkatKesulitan:
                cols[2] === 'Mudah' || cols[2] === 'Sulit' ? cols[2] : 'Sedang',
              jenisSoal: 'PG',
              stimulus: { type: 'none' },
              pertanyaan: cols[3],
              pilihan: [
                { key: 'A', text: cols[4] || 'Opsi A' },
                { key: 'B', text: cols[5] || 'Opsi B' },
                { key: 'C', text: cols[6] || 'Opsi C' },
                { key: 'D', text: cols[7] || 'Opsi D' },
              ],
              kunciPG: (cols[8] || 'A').toUpperCase(),
              pembahasan: cols[9] || '',
              bobot: 5,
              createdAt: new Date().toISOString(),
            });
          }
        });
        if (imported.length === 0) {
          throw new Error(
            'Tidak ada baris soal yang valid dalam file CSV. Gunakan minimal 9 kolom dipisahkan koma.'
          );
        }
        const saved = await bulkImportQuestions(imported);
        resetQuestionFilters();
        await onRefreshState();
        setFeedback(
          `${saved.addedCount} soal Pilihan Ganda berhasil diimpor dari CSV dan disimpan permanen${formatMapelBreakdown(imported)}.`
        );
      }
    } catch (err) {
      setFeedbackError(
        err instanceof Error ? err.message : 'Gagal mengimpor file soal. Periksa formatnya.'
      );
    }
    e.target.value = '';
  };

  const handleStimulusImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    const reader = new FileReader();
    reader.onload = () => {
      setEditing({
        ...editing,
        stimulus: {
          ...(editing.stimulus || { type: 'gambar' }),
          type: 'gambar',
          imageUrl: String(reader.result || ''),
        },
      });
    };
    reader.readAsDataURL(file);
  };

  const handleOpenDocModal = () => {
    setDocFileInfo(null);
    setDocError('');
    setParsedQuestions([]);
    setSelectedParsedIds([]);
    setDocAiSolvedIds([]);
    setDocMissingKeyIds([]);
    setDocAlreadySaved(false);
    setDocSavedCount(0);
    setShowDocModal(true);
  };

  const handleSelectDocFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocError('');
    setParsedQuestions([]);
    setSelectedParsedIds([]);
    setDocAiSolvedIds([]);
    setDocMissingKeyIds([]);
    setDocAlreadySaved(false);
    setDocSavedCount(0);

    if (file.size > 15 * 1024 * 1024) {
      setDocError('Ukuran berkas maksimal 15 MB. Silakan perkecil atau bagi dokumen menjadi beberapa bagian.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      setDocFileInfo({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        base64,
      });
    };
    reader.onerror = () => {
      setDocError('Gagal membaca berkas dari perangkat Anda.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDownloadWordTemplate = () => {
    const sample = `CONTOH FORMAT SOAL WORD / PDF / TXT (MODE POLA STANDAR)
=========================================================

1. Hasil dari 2.450 + 1.325 - 875 adalah ....
A. 2.800
B. 2.900
C. 3.000
D. 3.100
Materi: Bilangan Cacah dan Operasi Hitung
Kesulitan: Mudah
Kunci: B
Pembahasan: 2.450 + 1.325 = 3.775, lalu 3.775 - 875 = 2.900.

2. Stimulus: Perhatikan bacaan berikut! Pagi itu warga Desa Paron bergotong royong membersihkan saluran air agar tidak tersumbat saat musim hujan tiba.
Ide pokok paragraf tersebut adalah ....
A. Musim hujan tiba di Desa Paron
B. Gotong royong warga Desa Paron membersihkan saluran air
C. Saluran air desa mulai rusak
D. Warga desa berkumpul di balai desa
Materi: Menemukan Ide Pokok
Kesulitan: Sedang
Kunci: B
Pembahasan: Kalimat utama menjelaskan kegiatan gotong royong warga membersihkan saluran air.

3. Pilihlah dua pernyataan yang benar mengenai bilangan prima kurang dari 10!
A. 2 adalah bilangan prima genap
B. 4 adalah bilangan prima
C. 7 adalah bilangan prima
D. 9 adalah bilangan prima
Jenis: PGK
Materi: Sifat Bilangan
Kunci: A, C
Pembahasan: Bilangan prima kurang dari 10 adalah 2, 3, 5, dan 7.

4. Berapa hasil dari 15 x 12?
Materi: Operasi Hitung Perkalian
Kunci: 180
Pembahasan: 15 x 10 + 15 x 2 = 150 + 30 = 180.
`;
    const blob = new Blob([sample], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contoh-format-bank-soal-tka.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleProcessDocument = async () => {
    if (!docFileInfo) {
      setDocError('Pilih berkas Word (.docx), PDF (.pdf), atau teks (.txt) terlebih dahulu.');
      return;
    }
    setDocParsing(true);
    setDocError('');
    setDocAiSolvedIds([]);
    setDocMissingKeyIds([]);
    setDocAlreadySaved(false);
    setDocSavedCount(0);
    try {
      const res = await parseQuestionDocument({
        fileName: docFileInfo.name,
        mimeType: docFileInfo.mimeType,
        fileBase64: docFileInfo.base64,
        defaultMataUji: docMataUji,
        mode: docMode,
        autoSolveMissingKeys: docAutoSolveKeys,
      });
      setParsedQuestions(res.questions);
      setSelectedParsedIds(res.questions.map((q) => q.id));
      setDocAiSolvedIds(res.aiSolvedIds || []);
      setDocMissingKeyIds(res.missingKeyIds || []);

      if (docAutoSave && res.questions.length > 0) {
        setDocSaving(true);
        try {
          const saved = await bulkImportQuestions(res.questions, { updateExistingIds: true });
          resetQuestionFilters();
          await onRefreshState();
          setDocAlreadySaved(true);
          setDocSavedCount(saved.addedCount + saved.updatedCount);
          const aiNote =
            res.aiSolvedIds && res.aiSolvedIds.length > 0
              ? ` (${res.aiSolvedIds.length} kunci jawaban dilengkapi AI)`
              : '';
          setFeedback(
            `${saved.addedCount} soal dari dokumen "${docFileInfo.name}"${aiNote} langsung disimpan permanen ke Bank Soal${formatMapelBreakdown(res.questions)}.`
          );
        } catch (saveErr) {
          setDocError(
            saveErr instanceof Error
              ? `Soal berhasil diekstrak, namun gagal menyimpan ke server: ${saveErr.message}. Silakan klik Simpan manual.`
              : 'Soal berhasil diekstrak, namun gagal menyimpan ke server. Silakan klik Simpan manual.'
          );
        } finally {
          setDocSaving(false);
        }
      }
    } catch (err) {
      setDocError(
        err instanceof Error ? err.message : 'Gagal mengekstrak soal dari dokumen.'
      );
    } finally {
      setDocParsing(false);
    }
  };

  const handleSolveDocKeysWithAI = async () => {
    if (parsedQuestions.length === 0) return;
    setDocSolvingKeys(true);
    setDocError('');
    try {
      const res = await solveQuestionKeys(parsedQuestions);
      setParsedQuestions(res.questions);
      const solvedSet = new Set(res.solvedIds || []);
      setDocAiSolvedIds((prev) => Array.from(new Set([...prev, ...(res.solvedIds || [])])));
      setDocMissingKeyIds((prev) => prev.filter((id) => !solvedSet.has(id)));

      if (docAlreadySaved) {
        await bulkImportQuestions(res.questions, { updateExistingIds: true });
        await onRefreshState();
        setFeedback(
          `AI berhasil melengkapi & memperbarui kunci jawaban serta pembahasan untuk ${(res.solvedIds || []).length} soal secara permanen.`
        );
      }
    } catch (err) {
      setDocError(
        err instanceof Error
          ? err.message
          : 'Gagal melengkapi kunci jawaban soal dengan AI.'
      );
    } finally {
      setDocSolvingKeys(false);
    }
  };

  const handleInlinePgKeyChange = (questionId: string, keyLetter: string) => {
    setParsedQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, kunciPG: keyLetter } : q))
    );
    setDocMissingKeyIds((prev) => prev.filter((id) => id !== questionId));
  };

  const handleSaveParsedQuestions = async () => {
    const selected = docAlreadySaved
      ? parsedQuestions
      : parsedQuestions.filter((q) => selectedParsedIds.includes(q.id));
    if (selected.length === 0) {
      setDocError('Pilih minimal satu butir soal untuk ditambahkan ke Bank Soal.');
      return;
    }
    setDocSaving(true);
    setDocError('');
    try {
      const saved = await bulkImportQuestions(selected, {
        updateExistingIds: true,
      });
      resetQuestionFilters();
      await onRefreshState();
      const total = saved.addedCount + saved.updatedCount;
      setDocAlreadySaved(true);
      setDocSavedCount(total > 0 ? total : selected.length);
      setShowDocModal(false);
      setFeedback(
        `${total > 0 ? total : selected.length} soal dari dokumen "${docFileInfo?.name}" berhasil disimpan permanen ke Bank Soal${formatMapelBreakdown(selected)}.`
      );
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Gagal menyimpan soal ke server.');
    } finally {
      setDocSaving(false);
    }
  };

  const handleRunKisiKisiGenerator = async () => {
    setGenLoading(true);
    setGenError('');
    setGeneratedQuestions([]);
    setSelectedGenIds([]);
    setGenAlreadySaved(false);
    setGenSavedCount(0);
    setGenDurationSec(null);
    const startedAt = performance.now();
    try {
      const materiTrim = genMateriKhusus.trim();
      const res = await generateKisiKisiQuestions({
        mataUji: genMataUji,
        kisiKisiTopic: genKisiTopic,
        materiKhusus: materiTrim || undefined,
        jenisSoal: genJenisSoal,
        tingkatKesulitan: genKesulitan,
        jumlahSoal: genJumlah,
        konteksTema: genTema.trim() || undefined,
      });
      const elapsedSec = Math.max(0.1, Number(((performance.now() - startedAt) / 1000).toFixed(1)));
      setGenDurationSec(elapsedSec);
      setGeneratedQuestions(res.questions);
      setSelectedGenIds(res.questions.map((q) => q.id));

      if (genAutoSave && res.questions.length > 0) {
        setGenSaving(true);
        try {
          const saved = await bulkImportQuestions(res.questions, { updateExistingIds: true });
          resetQuestionFilters();
          await onRefreshState();
          setGenAlreadySaved(true);
          setGenSavedCount(saved.addedCount + saved.updatedCount);
          const materiLabel = materiTrim ? ` materi "${materiTrim}"` : '';
          setFeedback(
            `${saved.addedCount} soal TKA ${genMataUji}${materiLabel} selesai disusun (${elapsedSec} dtk) dan langsung disimpan permanen ke Bank Soal${formatMapelBreakdown(res.questions)}.`
          );
        } catch (saveErr) {
          setGenError(
            saveErr instanceof Error
              ? `Soal berhasil dibuat, namun gagal menyimpan ke server: ${saveErr.message}. Silakan klik Simpan manual.`
              : 'Soal berhasil dibuat, namun gagal menyimpan ke server. Silakan klik Simpan manual.'
          );
        } finally {
          setGenSaving(false);
        }
      }
    } catch (err) {
      setGenError(
        err instanceof Error ? err.message : 'Gagal membuat soal otomatis sesuai kisi-kisi.'
      );
    } finally {
      setGenLoading(false);
    }
  };

  const handleSaveGeneratedQuestions = async () => {
    const selected = genAlreadySaved
      ? generatedQuestions
      : generatedQuestions.filter((q) => selectedGenIds.includes(q.id));
    if (selected.length === 0) {
      setGenError('Pilih minimal satu butir soal hasil generasi untuk disimpan.');
      return;
    }
    setGenSaving(true);
    setGenError('');
    try {
      const saved = await bulkImportQuestions(selected, { updateExistingIds: true });
      resetQuestionFilters();
      await onRefreshState();
      const total = saved.addedCount + saved.updatedCount;
      setGenAlreadySaved(true);
      setGenSavedCount(total > 0 ? total : selected.length);
      setEditing(null);
      setFeedback(
        `${total > 0 ? total : selected.length} soal TKA ${genMataUji} sesuai kisi-kisi berhasil disimpan permanen ke Bank Soal${formatMapelBreakdown(selected)}.`
      );
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Gagal menyimpan soal ke server.');
    } finally {
      setGenSaving(false);
    }
  };

  const renderQuestionRow = (q: Question) => (
    <div
      key={q.id}
      className="rounded-xl border border-slate-200 bg-white p-4 hover:border-sky-300 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-4"
    >
      <div className="space-y-1.5 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="font-mono font-bold text-[#0F2547]">{q.id}</span>
          <span aria-hidden="true">·</span>
          <span className="font-semibold text-sky-700">{q.mataUji}</span>
          <span aria-hidden="true">·</span>
          <span>{q.materi}</span>
          <span aria-hidden="true">·</span>
          <span>{JENIS_LABELS[q.jenisSoal]}</span>
          <span aria-hidden="true">·</span>
          <span
            className={`font-semibold ${
              q.tingkatKesulitan === 'Sulit'
                ? 'text-orange-700'
                : q.tingkatKesulitan === 'Sedang'
                  ? 'text-sky-700'
                  : 'text-emerald-700'
            }`}
          >
            {q.tingkatKesulitan}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">Bobot {q.bobot}</span>
        </div>

        <p className="text-sm font-medium text-slate-900 line-clamp-2">{q.pertanyaan}</p>
        {q.indikator && (
          <p className="text-xs text-slate-500 line-clamp-1">Indikator: {q.indikator}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setPreviewQ(q)}
          className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-[#0F2547] cursor-pointer"
          title="Pratinjau Soal"
        >
          <Eye className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => handleOpenEdit(q)}
          className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-sky-700 cursor-pointer"
          title="Edit Soal"
        >
          <Edit3 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => handleDuplicate(q)}
          className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-emerald-700 cursor-pointer"
          title="Duplikasi Soal"
        >
          <Copy className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setConfirmDeleteQ(q)}
          className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-600 cursor-pointer"
          title="Hapus Soal"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-[#0F2547]">
              {fixedMataUji ? `Bank Soal ${fixedMataUji}` : 'Bank Soal TKA'}
            </h2>
            {fixedMataUji && onSwitchMapel && (
              <button
                type="button"
                onClick={() =>
                  onSwitchMapel(fixedMataUji === 'Matematika' ? 'Bahasa Indonesia' : 'Matematika')
                }
                className="text-xs font-semibold text-sky-700 hover:underline cursor-pointer"
              >
                Pindah ke {fixedMataUji === 'Matematika' ? 'Bahasa Indonesia' : 'Matematika'} →
              </button>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Kelola soal {fixedMataUji || 'Matematika & Bahasa Indonesia'} berbagai bentuk (PG, PGK,
            Benar-Salah, Menjodohkan, Isian Singkat).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenDocModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 text-xs font-semibold text-[#0F2547] whitespace-nowrap cursor-pointer"
          >
            <FileText className="h-4 w-4 text-sky-700" />
            <span>Unggah Word / PDF</span>
          </button>
          <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap cursor-pointer">
            <Upload className="h-4 w-4" />
            <span>Impor JSON / CSV</span>
            <input
              type="file"
              accept=".json,.csv"
              onChange={handleImportJsonOrCsv}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={() => downloadJsonFile('bank-soal-tka-mi-psm-paron.json', filteredQuestions)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>Ekspor JSON</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenNew('generator')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-900 whitespace-nowrap cursor-pointer"
          >
            <Sparkles className="h-4 w-4 text-amber-600" />
            <span>Generator Soal TKA</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenNew('manual')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Tambah Soal</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 flex items-center justify-between gap-3">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback('')} className="cursor-pointer shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {feedbackError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{feedbackError}</span>
          </span>
          <button type="button" onClick={() => setFeedbackError('')} className="cursor-pointer shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kode soal, pertanyaan, materi, kompetensi..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <select
            value={filterMataUji}
            onChange={(e) => {
              setFilterMataUji(e.target.value as 'ALL' | MataUji);
              setFilterMateri('ALL');
            }}
            className="px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
          >
            <option value="ALL">Semua Mata Uji</option>
            <option value="Matematika">Matematika</option>
            <option value="Bahasa Indonesia">Bahasa Indonesia</option>
          </select>

          <select
            value={filterMateri}
            onChange={(e) => setFilterMateri(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
          >
            <option value="ALL">Semua Materi</option>
            {allMateri.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <select
              value={filterKesulitan}
              onChange={(e) =>
                setFilterKesulitan(e.target.value as 'ALL' | TingkatKesulitan)
              }
              className="w-1/2 px-2.5 py-2 rounded-xl border border-slate-300 text-sm bg-white"
            >
              <option value="ALL">Kesulitan</option>
              <option value="Mudah">Mudah</option>
              <option value="Sedang">Sedang</option>
              <option value="Sulit">Sulit</option>
            </select>
            <select
              value={filterJenis}
              onChange={(e) => setFilterJenis(e.target.value as 'ALL' | JenisSoal)}
              className="w-1/2 px-2.5 py-2 rounded-xl border border-slate-300 text-sm bg-white"
            >
              <option value="ALL">Jenis Soal</option>
              <option value="PG">PG</option>
              <option value="PGK">PGK</option>
              <option value="BS">Benar/Salah</option>
              <option value="MENJODOHKAN">Jodohkan</option>
              <option value="ISIAN">Isian</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
          <span className="tabular-nums">
            Menampilkan <strong>{filteredQuestions.length}</strong> dari {db.questions.length} soal
          </span>
          <label className="inline-flex items-center gap-2 cursor-pointer font-medium">
            <input
              type="checkbox"
              checked={groupByKompetensi}
              onChange={(e) => setGroupByKompetensi(e.target.checked)}
              className="rounded border-slate-300 text-sky-600"
            />
            <span>Kelompokkan Berdasarkan Kompetensi</span>
          </label>
        </div>
      </div>

      {/* Questions List */}
      {filteredQuestions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-700">
            Tidak ada soal yang cocok dengan filter saat ini.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setFilterMataUji('ALL');
              setFilterMateri('ALL');
              setFilterKesulitan('ALL');
              setFilterJenis('ALL');
            }}
            className="text-xs font-semibold text-sky-600 hover:underline cursor-pointer"
          >
            Reset Semua Filter
          </button>
        </div>
      ) : groupByKompetensi ? (
        <div className="space-y-5">
          {groupedByKompetensi.map(([groupName, items]) => (
            <div key={groupName} className="space-y-2.5">
              <h3 className="text-sm font-bold text-[#0F2547] px-1">
                {groupName} ({items.length} soal)
              </h3>
              <div className="space-y-2.5">{items.map(renderQuestionRow)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2.5">{filteredQuestions.map(renderQuestionRow)}</div>
      )}

      {/* Preview Modal */}
      {previewQ && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <p className="text-xs text-slate-500">
                  {previewQ.id} · {previewQ.mataUji} · {previewQ.materi}
                </p>
                <h3 className="text-base font-bold text-[#0F2547]">Pratinjau Butir Soal</h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewQ(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <StimulusRenderer stimulus={previewQ.stimulus} compact />

            <p className="text-sm font-medium text-slate-900 whitespace-pre-line">
              {previewQ.pertanyaan}
            </p>

            {(previewQ.jenisSoal === 'PG' || previewQ.jenisSoal === 'PGK') && (
              <div className="space-y-1.5 text-sm">
                {previewQ.pilihan?.map((p) => {
                  const isKey =
                    previewQ.jenisSoal === 'PG'
                      ? previewQ.kunciPG === p.key
                      : previewQ.kunciPGK?.includes(p.key);
                  return (
                    <div
                      key={p.key}
                      className={`px-3 py-2 rounded-lg border ${
                        isKey
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <span className="font-mono font-bold mr-2">{p.key}.</span>
                      {p.text}
                      {isKey && <span className="ml-2 text-xs text-emerald-700">(Kunci)</span>}
                    </div>
                  );
                })}
              </div>
            )}

            {previewQ.jenisSoal === 'BS' && (
              <div className="space-y-1.5 text-xs">
                {previewQ.pernyataanBS?.map((s) => (
                  <div
                    key={s.id}
                    className="flex justify-between gap-4 p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                  >
                    <span>{s.text}</span>
                    <span className="font-bold text-[#0F2547] shrink-0">
                      {s.answer ? 'Benar' : 'Salah'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {previewQ.jenisSoal === 'MENJODOHKAN' && (
              <div className="space-y-1.5 text-xs">
                {previewQ.pasanganJodoh?.map((p) => (
                  <div
                    key={p.id}
                    className="flex justify-between gap-4 p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                  >
                    <span>{p.left}</span>
                    <span className="font-bold text-emerald-700">→ {p.right}</span>
                  </div>
                ))}
              </div>
            )}

            {previewQ.jenisSoal === 'ISIAN' && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                <strong>Kunci Jawaban Diterima:</strong> {previewQ.kunciIsian?.join(', ')}
              </div>
            )}

            {previewQ.pembahasan && (
              <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-950 space-y-1">
                <p className="font-bold">Pembahasan:</p>
                <p>{previewQ.pembahasan}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Question Editor & Kisi-Kisi Generator Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-3xl w-full p-6 space-y-5 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-[#0F2547]">
                  {editing.id ? `Edit Soal ${editing.id}` : 'Tambah Butir Soal TKA'}
                </h3>
                {!editing.id && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    Buat soal secara manual atau gunakan Generator Otomatis sesuai Kisi-Kisi TKA
                    SD/MI Terbaru.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!editing.id && (
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100">
                <button
                  type="button"
                  onClick={() => setAddQuestionTab('manual')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    addQuestionTab === 'manual'
                      ? 'bg-white text-[#0F2547] shadow-sm'
                      : 'text-slate-600 hover:text-[#0F2547]'
                  }`}
                >
                  Input Manual (1 Soal)
                </button>
                <button
                  type="button"
                  onClick={() => setAddQuestionTab('generator')}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    addQuestionTab === 'generator'
                      ? 'bg-white text-amber-800 shadow-sm'
                      : 'text-slate-600 hover:text-[#0F2547]'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                  <span>Generator Soal Kisi-Kisi TKA SD/MI</span>
                </button>
              </div>
            )}

            {!editing.id && addQuestionTab === 'generator' ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Mata Uji Wajib TKA SD/MI
                      </label>
                      <select
                        value={genMataUji}
                        onChange={(e) => {
                          const nextMata = e.target.value as MataUji;
                          setGenMataUji(nextMata);
                          setGenKisiTopic(TKA_KISI_KISI_CATALOG[nextMata][0].id);
                          setGenMateriKhusus('');
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                      >
                        <option value="Matematika">Matematika (Numerasi &amp; Penalaran)</option>
                        <option value="Bahasa Indonesia">
                          Bahasa Indonesia (Literasi Membaca)
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Jumlah Soal Dibuat
                      </label>
                      <select
                        value={genJumlah}
                        onChange={(e) => setGenJumlah(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white font-mono"
                      >
                        <option value={3}>3 Butir Soal</option>
                        <option value={5}>5 Butir Soal</option>
                        <option value={10}>10 Butir Soal (Paralel Cepat)</option>
                        <option value={15}>15 Butir Soal (Paralel Cepat)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Elemen &amp; Materi Kisi-Kisi TKA SD/MI Terbaru (Pusmendik)
                    </label>
                    <select
                      value={genKisiTopic}
                      onChange={(e) => {
                        setGenKisiTopic(e.target.value);
                        setGenMateriKhusus('');
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                    >
                      {TKA_KISI_KISI_CATALOG[genMataUji].map((kisi) => (
                        <option key={kisi.id} value={kisi.id}>
                          {kisi.label}
                        </option>
                      ))}
                    </select>
                    {(() => {
                      const activeKisi = TKA_KISI_KISI_CATALOG[genMataUji].find(
                        (k) => k.id === genKisiTopic
                      );
                      return activeKisi ? (
                        <div className="mt-2 space-y-2">
                          <p className="text-[11px] text-slate-600 leading-relaxed">
                            <strong className="text-[#0F2547]">Cakupan Kisi-Kisi:</strong>{' '}
                            {activeKisi.cakupan}
                          </p>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <label className="block text-xs font-semibold text-slate-700">
                                Materi Spesifik yang Diujikan (Opsional — Mengunci 100% Fokus Soal)
                              </label>
                              {genMateriKhusus && (
                                <button
                                  type="button"
                                  onClick={() => setGenMateriKhusus('')}
                                  className="text-[11px] font-semibold text-slate-500 hover:text-red-600 cursor-pointer"
                                >
                                  Reset Materi
                                </button>
                              )}
                            </div>
                            <input
                              type="text"
                              value={genMateriKhusus}
                              onChange={(e) => setGenMateriKhusus(e.target.value)}
                              placeholder={`Kosongkan untuk mengikuti materi "${activeKisi.materiUtama}", atau ketik materi spesifik...`}
                              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                            />
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] text-slate-500 mr-1">
                                Pilih cepat:
                              </span>
                              {activeKisi.subMateriContoh.map((sub) => {
                                const isActive = genMateriKhusus === sub;
                                return (
                                  <button
                                    key={sub}
                                    type="button"
                                    onClick={() => setGenMateriKhusus(isActive ? '' : sub)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                                      isActive
                                        ? 'bg-[#0F2547] border-[#0F2547] text-white'
                                        : 'bg-white border-slate-300 text-slate-700 hover:border-sky-400 hover:text-sky-700'
                                    }`}
                                  >
                                    {sub}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Bentuk Soal TKA
                      </label>
                      <select
                        value={genJenisSoal}
                        onChange={(e) =>
                          setGenJenisSoal(e.target.value as JenisSoal | 'CAMPURAN_TKA')
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                      >
                        <option value="CAMPURAN_TKA">
                          Campuran Format TKA Terbaru (PG, PGK, Benar/Salah)
                        </option>
                        <option value="PG">Pilihan Ganda (PG)</option>
                        <option value="PGK">Pilihan Ganda Kompleks (MCMA)</option>
                        <option value="BS">Benar / Salah (Kategori)</option>
                        <option value="MENJODOHKAN">Menjodohkan</option>
                        <option value="ISIAN">Isian Singkat</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Level Kognitif &amp; Kesulitan
                      </label>
                      <select
                        value={genKesulitan}
                        onChange={(e) =>
                          setGenKesulitan(e.target.value as TingkatKesulitan | 'CAMPURAN')
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                      >
                        <option value="CAMPURAN">Campuran Berjenjang (L1, L2, L3/HOTS)</option>
                        <option value="Mudah">Mudah (Pemahaman / L1)</option>
                        <option value="Sedang">Sedang (Penerapan / L2)</option>
                        <option value="Sulit">Sulit (Penalaran HOTS / L3)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Konteks / Tema Tambahan (Opsional)
                    </label>
                    <input
                      type="text"
                      value={genTema}
                      onChange={(e) => setGenTema(e.target.value)}
                      placeholder="Contoh: Kegiatan koperasi madrasah, wisata edukasi, hemat energi, atau Ramadhan"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                    />
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={genAutoSave}
                      onChange={(e) => setGenAutoSave(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600"
                    />
                    <span>
                      Langsung simpan otomatis ke Bank Soal setelah soal selesai dibuat (disarankan agar soal tidak hilang)
                    </span>
                  </label>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <p className="text-[11px] text-slate-600">
                      Dilengkapi stimulus bacaan/tabel/diagram, indikator kisi-kisi, kunci jawaban,
                      dan pembahasan.
                    </p>
                    <button
                      type="button"
                      disabled={genLoading || genSaving}
                      onClick={handleRunKisiKisiGenerator}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F2547] hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {genLoading || genSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>{genSaving ? 'Menyimpan ke Server...' : 'Menyusun Soal TKA...'}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 text-amber-300" />
                          <span>Buat Soal Sesuai Kisi-Kisi</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {genError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{genError}</span>
                  </div>
                )}

                {generatedQuestions.length > 0 && (
                  <div className="space-y-3">
                    {genAlreadySaved ? (
                      <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>
                            {genSavedCount} soal TKA {genMataUji} sudah tersimpan permanen ke Bank Soal!
                          </span>
                        </span>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">
                          Soal hasil generator belum disimpan ke Bank Soal — klik Simpan agar tidak hilang.
                        </span>
                        <button
                          type="button"
                          disabled={genSaving || selectedGenIds.length === 0}
                          onClick={handleSaveGeneratedQuestions}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                        >
                          {genSaving ? 'Menyimpan...' : `Simpan ${selectedGenIds.length} Soal Sekarang`}
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span>
                          Berhasil menyusun {generatedQuestions.length} butir soal TKA
                          {genDurationSec ? ` dalam ${genDurationSec} detik` : ''}
                          {genAlreadySaved
                            ? ` · ${genSavedCount} tersimpan`
                            : ` · ${selectedGenIds.length} dipilih`}
                        </span>
                      </div>
                      {!genAlreadySaved && (
                        <div className="flex items-center gap-3 text-xs font-semibold">
                          <button
                            type="button"
                            onClick={() => setSelectedGenIds(generatedQuestions.map((q) => q.id))}
                            className="text-sky-700 hover:underline cursor-pointer"
                          >
                            Pilih Semua
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedGenIds([])}
                            className="text-slate-500 hover:underline cursor-pointer"
                          >
                            Kosongkan
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {generatedQuestions.map((gq, idx) => {
                        const checked = genAlreadySaved || selectedGenIds.includes(gq.id);
                        return (
                          <div
                            key={gq.id}
                            className={`rounded-xl border p-3.5 transition-colors flex items-start gap-3 ${
                              checked
                                ? 'border-sky-300 bg-sky-50/40'
                                : 'border-slate-200 bg-white opacity-70'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={genAlreadySaved}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedGenIds((prev) => [...prev, gq.id]);
                                } else {
                                  setSelectedGenIds((prev) => prev.filter((id) => id !== gq.id));
                                }
                              }}
                              className="mt-1 rounded border-slate-300 text-sky-600 cursor-pointer disabled:opacity-60"
                            />
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                                <span className="font-mono font-bold text-[#0F2547]">
                                  #{idx + 1}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-semibold text-sky-700">{gq.mataUji}</span>
                                <span aria-hidden="true">·</span>
                                <span>{JENIS_LABELS[gq.jenisSoal]}</span>
                                <span aria-hidden="true">·</span>
                                <span>{gq.tingkatKesulitan}</span>
                                <span aria-hidden="true">·</span>
                                <span>{gq.materi}</span>
                                {genAlreadySaved && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-semibold text-emerald-700">Tersimpan</span>
                                  </>
                                )}
                              </div>
                              <p className="text-xs font-medium text-slate-900 line-clamp-2">
                                {gq.pertanyaan}
                              </p>
                              {gq.indikator && (
                                <p className="text-[11px] text-slate-500 line-clamp-1">
                                  Indikator: {gq.indikator}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setPreviewQ(gq)}
                              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-[#0F2547] shrink-0 cursor-pointer"
                              title="Pratinjau Penuh (Stimulus, Kunci & Pembahasan)"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 cursor-pointer"
                  >
                    Tutup
                  </button>
                  {generatedQuestions.length > 0 && (
                    <button
                      type="button"
                      disabled={genSaving || (!genAlreadySaved && selectedGenIds.length === 0)}
                      onClick={handleSaveGeneratedQuestions}
                      className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer"
                    >
                      {genSaving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Menyimpan...</span>
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          <span>
                            {genAlreadySaved
                              ? `Simpan Permanen (${generatedQuestions.length} Soal)`
                              : `Simpan ${selectedGenIds.length} Soal ke Bank Soal`}
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveQuestion} className="space-y-5">

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mata Uji</label>
                <select
                  value={editing.mataUji}
                  onChange={(e) => setEditing({ ...editing, mataUji: e.target.value as MataUji })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                >
                  <option value="Matematika">Matematika</option>
                  <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Soal</label>
                <select
                  value={editing.jenisSoal}
                  onChange={(e) =>
                    setEditing({ ...editing, jenisSoal: e.target.value as JenisSoal })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                >
                  <option value="PG">Pilihan Ganda (PG)</option>
                  <option value="PGK">Pilihan Ganda Kompleks (PGK)</option>
                  <option value="BS">Benar atau Salah</option>
                  <option value="MENJODOHKAN">Menjodohkan</option>
                  <option value="ISIAN">Isian Singkat</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tingkat Kesulitan
                </label>
                <select
                  value={editing.tingkatKesulitan}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      tingkatKesulitan: e.target.value as TingkatKesulitan,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                >
                  <option value="Mudah">Mudah</option>
                  <option value="Sedang">Sedang</option>
                  <option value="Sulit">Sulit</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Materi</label>
                <input
                  type="text"
                  required
                  value={editing.materi}
                  onChange={(e) => setEditing({ ...editing, materi: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kompetensi
                </label>
                <input
                  type="text"
                  value={editing.kompetensi}
                  onChange={(e) => setEditing({ ...editing, kompetensi: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bobot Nilai
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={editing.bobot}
                  onChange={(e) => setEditing({ ...editing, bobot: Number(e.target.value) || 1 })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Indikator Soal
              </label>
              <input
                type="text"
                value={editing.indikator}
                onChange={(e) => setEditing({ ...editing, indikator: e.target.value })}
                placeholder="Contoh: Peserta didik mampu menentukan luas gabungan bangun datar"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            {/* Stimulus Editor */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold text-[#0F2547]">
                  Stimulus / Bacaan / Visual Soal
                </label>
                <select
                  value={editing.stimulus?.type || 'none'}
                  onChange={(e) => {
                    const t = e.target.value as StimulusType;
                    const base: StimulusData = { type: t, title: editing.stimulus?.title || '' };
                    if (t === 'tabel') {
                      base.tableHeaders = ['Kolom 1', 'Kolom 2'];
                      base.tableRows = [
                        ['Data A', '10'],
                        ['Data B', '20'],
                      ];
                    } else if (t === 'diagram_batang') {
                      base.chartData = [
                        { label: 'A', value: 20 },
                        { label: 'B', value: 35 },
                        { label: 'C', value: 25 },
                      ];
                    }
                    setEditing({ ...editing, stimulus: base });
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                >
                  <option value="none">Tanpa Stimulus</option>
                  <option value="bacaan">Teks Bacaan</option>
                  <option value="gambar">Unggah Gambar Ilustrasi</option>
                  <option value="tabel">Tabel Data</option>
                  <option value="diagram_batang">Diagram Batang</option>
                  <option value="bangun_datar">Ilustrasi Bangun Datar</option>
                  <option value="bangun_ruang">Ilustrasi Bangun Ruang</option>
                </select>
              </div>

              {editing.stimulus && editing.stimulus.type !== 'none' && (
                <div className="space-y-2.5">
                  <input
                    type="text"
                    placeholder="Judul Stimulus / Bacaan / Gambar"
                    value={editing.stimulus.title || ''}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        stimulus: { ...editing.stimulus!, title: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  />

                  {editing.stimulus.type === 'bacaan' && (
                    <textarea
                      rows={4}
                      placeholder="Tuliskan teks bacaan atau stimulus soal..."
                      value={editing.stimulus.content || ''}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          stimulus: { ...editing.stimulus!, content: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                    />
                  )}

                  {editing.stimulus.type === 'gambar' && (
                    <div className="space-y-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleStimulusImageUpload}
                        className="text-xs"
                      />
                      {editing.stimulus.imageUrl && (
                        <img
                          src={editing.stimulus.imageUrl}
                          alt="Preview"
                          className="max-h-40 rounded-lg border border-slate-200"
                        />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pertanyaan Soal
              </label>
              <textarea
                rows={3}
                required
                value={editing.pertanyaan}
                onChange={(e) => setEditing({ ...editing, pertanyaan: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            {/* Type-specific Answer Key Editors */}
            {(editing.jenisSoal === 'PG' || editing.jenisSoal === 'PGK') && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#0F2547]">
                    Pilihan Jawaban &amp; Kunci
                  </label>
                  {editing.jenisSoal === 'PGK' && (
                    <select
                      value={editing.metodeNilaiPGK || 'partial'}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          metodeNilaiPGK: e.target.value as 'exact' | 'partial',
                        })
                      }
                      className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs bg-white"
                    >
                      <option value="partial">Penilaian Proporsional (Parsial)</option>
                      <option value="exact">Harus Tepat Semua (Exact)</option>
                    </select>
                  )}
                </div>
                {(editing.pilihan || []).map((opt, idx) => {
                  const isCorrect =
                    editing.jenisSoal === 'PG'
                      ? editing.kunciPG === opt.key
                      : (editing.kunciPGK || []).includes(opt.key);
                  return (
                    <div key={opt.key} className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (editing.jenisSoal === 'PG') {
                            setEditing({ ...editing, kunciPG: opt.key });
                          } else {
                            const curr = editing.kunciPGK || [];
                            const next = curr.includes(opt.key)
                              ? curr.filter((k) => k !== opt.key)
                              : [...curr, opt.key];
                            setEditing({ ...editing, kunciPGK: next });
                          }
                        }}
                        className={`h-9 w-9 rounded-lg font-mono text-xs font-bold shrink-0 cursor-pointer border ${
                          isCorrect
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-slate-100 border-slate-300 text-slate-700'
                        }`}
                        title="Klik untuk menandai sebagai kunci jawaban"
                      >
                        {opt.key}
                      </button>
                      <input
                        type="text"
                        required
                        value={opt.text}
                        placeholder={`Isi pilihan ${opt.key}`}
                        onChange={(e) => {
                          const next = [...(editing.pilihan || [])];
                          next[idx] = { ...opt, text: e.target.value };
                          setEditing({ ...editing, pilihan: next });
                        }}
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-sm"
                      />
                    </div>
                  );
                })}
                <p className="text-[11px] text-slate-500">
                  Klik huruf A/B/C/D di sebelah kiri untuk memilih kunci jawaban (hijau = benar).
                </p>
              </div>
            )}

            {editing.jenisSoal === 'BS' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#0F2547]">
                    Daftar Pernyataan Benar / Salah
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        pernyataanBS: [
                          ...(editing.pernyataanBS || []),
                          { id: `bs${Date.now()}`, text: '', answer: true },
                        ],
                      })
                    }
                    className="text-xs font-semibold text-sky-600 cursor-pointer"
                  >
                    + Tambah Pernyataan
                  </button>
                </div>
                {(editing.pernyataanBS || []).map((st, idx) => (
                  <div key={st.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      value={st.text}
                      placeholder={`Pernyataan ${idx + 1}`}
                      onChange={(e) => {
                        const next = [...(editing.pernyataanBS || [])];
                        next[idx] = { ...st, text: e.target.value };
                        setEditing({ ...editing, pernyataanBS: next });
                      }}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-sm"
                    />
                    <select
                      value={st.answer ? 'true' : 'false'}
                      onChange={(e) => {
                        const next = [...(editing.pernyataanBS || [])];
                        next[idx] = { ...st, answer: e.target.value === 'true' };
                        setEditing({ ...editing, pernyataanBS: next });
                      }}
                      className="px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                    >
                      <option value="true">Benar</option>
                      <option value="false">Salah</option>
                    </select>
                  </div>
                ))}
              </div>
            )}

            {editing.jenisSoal === 'MENJODOHKAN' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#0F2547]">
                    Pasangan Soal &amp; Jawaban
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        pasanganJodoh: [
                          ...(editing.pasanganJodoh || []),
                          { id: `m${Date.now()}`, left: '', right: '' },
                        ],
                      })
                    }
                    className="text-xs font-semibold text-sky-600 cursor-pointer"
                  >
                    + Tambah Pasangan
                  </button>
                </div>
                {(editing.pasanganJodoh || []).map((pair, idx) => (
                  <div key={pair.id} className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      placeholder={`Pernyataan Kiri ${idx + 1}`}
                      value={pair.left}
                      onChange={(e) => {
                        const next = [...(editing.pasanganJodoh || [])];
                        next[idx] = { ...pair, left: e.target.value };
                        setEditing({ ...editing, pasanganJodoh: next });
                      }}
                      className="px-3 py-2 rounded-xl border border-slate-300 text-sm"
                    />
                    <input
                      type="text"
                      required
                      placeholder={`Pasangan Kanan ${idx + 1}`}
                      value={pair.right}
                      onChange={(e) => {
                        const next = [...(editing.pasanganJodoh || [])];
                        next[idx] = { ...pair, right: e.target.value };
                        setEditing({ ...editing, pasanganJodoh: next });
                      }}
                      className="px-3 py-2 rounded-xl border border-slate-300 text-sm"
                    />
                  </div>
                ))}
              </div>
            )}

            {editing.jenisSoal === 'ISIAN' && (
              <div>
                <label className="block text-xs font-bold text-[#0F2547] mb-1">
                  Kunci Jawaban Singkat (pisahkan dengan koma jika ada beberapa variasi benar)
                </label>
                <input
                  type="text"
                  required
                  value={(editing.kunciIsian || []).join(', ')}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      kunciIsian: e.target.value.split(',').map((s) => s.trim()),
                    })
                  }
                  placeholder="Contoh: 40, 40 kursi"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pembahasan Soal
              </label>
              <textarea
                rows={2}
                value={editing.pembahasan}
                onChange={(e) => setEditing({ ...editing, pembahasan: e.target.value })}
                placeholder="Penjelasan singkat langkah penyelesaian atau alasan jawaban benar..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>

            {questionFormError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{questionFormError}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={questionSaving}
                className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer"
              >
                {questionSaving ? 'Menyimpan...' : 'Simpan Soal'}
              </button>
            </div>
          </form>
            )}
          </div>
        </div>
      )}

      {/* Word / PDF Upload Modal */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-3xl w-full p-6 space-y-5 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3 gap-4">
              <div>
                <h3 className="text-lg font-bold text-[#0F2547]">
                  Unggah Soal dari Dokumen Word / PDF
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ekstrak butir soal otomatis dari file Microsoft Word (.docx), PDF (.pdf), atau teks (.txt).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDocModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Step 1: Configuration & File Picker */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mata Uji Default
                  </label>
                  <select
                    value={docMataUji}
                    onChange={(e) => setDocMataUji(e.target.value as 'AUTO' | MataUji)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    <option value="AUTO">Deteksi Otomatis per Soal</option>
                    <option value="Matematika">Matematika</option>
                    <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Metode Pembacaan Dokumen
                  </label>
                  <select
                    value={docMode}
                    onChange={(e) => setDocMode(e.target.value as 'ai' | 'pattern')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    <option value="ai">Ekstraksi Cerdas AI (Format Bebas &amp; PDF Scan)</option>
                    <option value="pattern">Format Pola Standar (Offline / Tanpa AI)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4">
                <div className="space-y-1 min-w-0">
                  <p className="text-xs font-semibold text-[#0F2547]">
                    {docFileInfo
                      ? `${docFileInfo.name} (${(docFileInfo.size / 1024).toFixed(0)} KB)`
                      : 'Belum ada file dokumen yang dipilih'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Mendukung Word modern (.docx), dokumen PDF (.pdf), dan teks (.txt) hingga 15 MB.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleDownloadWordTemplate}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Contoh Format</span>
                  </button>
                  <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0F2547] hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap cursor-pointer">
                    <Upload className="h-3.5 w-3.5" />
                    <span>Pilih File Word / PDF</span>
                    <input
                      type="file"
                      accept=".docx,.pdf,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={handleSelectDocFile}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={docAutoSolveKeys}
                    onChange={(e) => setDocAutoSolveKeys(e.target.checked)}
                    className="rounded border-slate-300 text-sky-600"
                  />
                  <span>
                    Jawab otomatis &amp; verifikasi dengan AI jika soal di Word/PDF belum memiliki
                    kunci jawaban
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={docAutoSave}
                    onChange={(e) => setDocAutoSave(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600"
                  />
                  <span>
                    Langsung simpan otomatis ke Bank Soal setelah dokumen diproses (disarankan agar
                    soal tidak hilang)
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">
                  {docMode === 'ai'
                    ? 'Mode AI mengenali PG, PGK, Benar-Salah, Menjodohkan, Isian, stimulus, dan mengerjakan kunci jawaban akurat.'
                    : 'Mode Offline membaca daftar bernomor (1. ... A. ... B. ... Kunci: A) serta dapat melengkapi kunci kosong dengan AI.'}
                </p>
                <button
                  type="button"
                  disabled={!docFileInfo || docParsing || docSaving}
                  onClick={handleProcessDocument}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap cursor-pointer shrink-0"
                >
                  {docParsing || docSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{docSaving ? 'Menyimpan Soal...' : 'Memproses Dokumen...'}</span>
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      <span>Proses &amp; Ekstrak Soal</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {docError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{docError}</span>
              </div>
            )}

            {/* Step 2: Extracted Questions Preview & Selection */}
            {parsedQuestions.length > 0 && (
              <div className="space-y-3">
                {docAiSolvedIds.length > 0 && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs text-sky-900 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-sky-600 shrink-0" />
                    <span>
                      AI mengerjakan &amp; melengkapi kunci jawaban akurat beserta pembahasan untuk{' '}
                      <strong>{docAiSolvedIds.length} butir soal</strong> yang sebelumnya belum
                      memiliki kunci.
                    </span>
                  </div>
                )}

                {docAlreadySaved ? (
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900 flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 font-semibold">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>
                        {docSavedCount} soal dari dokumen &ldquo;{docFileInfo?.name}&rdquo; sudah tersimpan permanen ke Bank Soal{formatMapelBreakdown(parsedQuestions)}!
                      </span>
                    </span>
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      Soal hasil unggahan belum disimpan ke Bank Soal — klik Simpan agar tidak hilang.
                    </span>
                    <button
                      type="button"
                      disabled={docSaving || selectedParsedIds.length === 0}
                      onClick={handleSaveParsedQuestions}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                    >
                      {docSaving ? 'Menyimpan...' : `Simpan ${selectedParsedIds.length} Soal Sekarang`}
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>
                      Berhasil mengekstrak {parsedQuestions.length} butir soal
                      {docAlreadySaved
                        ? ` · ${docSavedCount} tersimpan`
                        : ` · ${selectedParsedIds.length} dipilih untuk disimpan`}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                    <button
                      type="button"
                      disabled={docSolvingKeys || docSaving}
                      onClick={handleSolveDocKeysWithAI}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-900 disabled:opacity-50 cursor-pointer"
                    >
                      {docSolvingKeys ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Mengerjakan Kunci...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5 text-sky-700" />
                          <span>Jawab / Verifikasi Kunci AI</span>
                        </>
                      )}
                    </button>
                    {!docAlreadySaved && (
                      <>
                        <button
                          type="button"
                          onClick={() => setSelectedParsedIds(parsedQuestions.map((q) => q.id))}
                          className="text-sky-700 hover:underline cursor-pointer"
                        >
                          Pilih Semua
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedParsedIds([])}
                          className="text-slate-500 hover:underline cursor-pointer"
                        >
                          Kosongkan Pilihan
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {parsedQuestions.map((pq, idx) => {
                    const checked = docAlreadySaved || selectedParsedIds.includes(pq.id);
                    const isMissingKey = docMissingKeyIds.includes(pq.id);
                    const isAiSolved = docAiSolvedIds.includes(pq.id);
                    const kunciLabel = isMissingKey
                      ? 'Belum Ada Kunci'
                      : pq.jenisSoal === 'PG'
                        ? `Kunci: ${pq.kunciPG || '-'}`
                        : pq.jenisSoal === 'PGK'
                          ? `Kunci: ${(pq.kunciPGK || []).join(', ') || '-'}`
                          : pq.jenisSoal === 'ISIAN'
                            ? `Kunci: ${(pq.kunciIsian || []).join(' / ') || '-'}`
                            : pq.jenisSoal === 'BS'
                              ? `${pq.pernyataanBS?.length || 0} pernyataan`
                              : `${pq.pasanganJodoh?.length || 0} pasangan`;

                    return (
                      <div
                        key={pq.id}
                        className={`rounded-xl border p-3.5 transition-colors flex items-start gap-3 ${
                          checked
                            ? 'border-sky-300 bg-sky-50/40'
                            : 'border-slate-200 bg-white opacity-70'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={docAlreadySaved}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedParsedIds((prev) => [...prev, pq.id]);
                            } else {
                              setSelectedParsedIds((prev) => prev.filter((id) => id !== pq.id));
                            }
                          }}
                          className="mt-1 rounded border-slate-300 text-sky-600 cursor-pointer disabled:opacity-60"
                        />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                            <span className="font-mono font-bold text-[#0F2547]">
                              #{idx + 1}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-sky-700">{pq.mataUji}</span>
                            <span aria-hidden="true">·</span>
                            <span>{JENIS_LABELS[pq.jenisSoal]}</span>
                            <span aria-hidden="true">·</span>
                            <span>{pq.materi}</span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={`font-semibold ${
                                isMissingKey
                                  ? 'text-amber-700'
                                  : isAiSolved
                                    ? 'text-sky-700'
                                    : 'text-emerald-700'
                              }`}
                            >
                              {kunciLabel}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={`font-semibold ${
                                isMissingKey
                                  ? 'text-amber-700'
                                  : isAiSolved
                                    ? 'text-indigo-700'
                                    : 'text-emerald-700'
                              }`}
                            >
                              {isMissingKey
                                ? 'Perlu Kunci'
                                : isAiSolved
                                  ? 'Kunci Dijawab AI'
                                  : 'Kunci dari Dokumen'}
                            </span>
                            {docAlreadySaved && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-semibold text-emerald-700">Tersimpan</span>
                              </>
                            )}
                          </div>
                          <p className="text-xs font-medium text-slate-900 line-clamp-2">
                            {pq.pertanyaan}
                          </p>
                          {pq.jenisSoal === 'PG' && pq.pilihan && pq.pilihan.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              <span className="text-[11px] text-slate-500 mr-1">Ubah Kunci:</span>
                              {pq.pilihan.map((opt) => (
                                <button
                                  key={opt.key}
                                  type="button"
                                  onClick={() => handleInlinePgKeyChange(pq.id, opt.key)}
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border cursor-pointer ${
                                    !isMissingKey && pq.kunciPG === opt.key
                                      ? 'bg-emerald-600 border-emerald-600 text-white'
                                      : 'bg-white border-slate-300 text-slate-600 hover:border-sky-400'
                                  }`}
                                >
                                  {opt.key}
                                </button>
                              ))}
                            </div>
                          )}
                          {pq.stimulus?.type === 'bacaan' && pq.stimulus.content && (
                            <p className="text-[11px] text-slate-500 line-clamp-1">
                              Stimulus: {pq.stimulus.content}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreviewQ(pq)}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-[#0F2547] shrink-0 cursor-pointer"
                          title="Pratinjau Butir Soal"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowDocModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 cursor-pointer"
              >
                Tutup
              </button>
              {parsedQuestions.length > 0 && (
                <button
                  type="button"
                  disabled={
                    docSaving ||
                    docSolvingKeys ||
                    (!docAlreadySaved && selectedParsedIds.length === 0)
                  }
                  onClick={handleSaveParsedQuestions}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer"
                >
                  {docSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>
                        {docAlreadySaved
                          ? `Simpan Permanen (${parsedQuestions.length} Soal)`
                          : `Simpan ${selectedParsedIds.length} Soal ke Bank Soal`}
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {confirmDeleteQ && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-[#0F2547]">Hapus Butir Soal?</h3>
            <p className="text-sm text-slate-600">
              Soal <strong>{confirmDeleteQ.id}</strong> akan dihapus permanen dari bank soal.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteQ(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDelete}
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

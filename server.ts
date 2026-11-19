import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createInitialDemoDatabase, DEFAULT_SCHOOL_LOGO } from './src/data/demoData.ts';
import { evaluateExamSession } from './src/utils/scoring.ts';
import { parseQuestionsFromDocument, solveQuestionKeysWithAI } from './server/documentParser.ts';
import { generateTkaQuestions } from './server/questionGenerator.ts';
import type {
  AdminAccount,
  AppDatabase,
  ClassGroup,
  ExamConfig,
  ExamSession,
  Question,
  SchoolProfile,
  Student,
  StudentAnswerValue,
} from './src/types.ts';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'tka-store.json');
const BACKUP_PATH = path.join(DATA_DIR, 'tka-store.backup.json');

function normalizeLoadedDatabase(parsed: AppDatabase): AppDatabase {
  const LEGACY_DEFAULT_LOGO = '/src/assets/images/school_emblem_logo_1794917028875.jpg';
  if (!parsed.school.logoUrl || parsed.school.logoUrl === LEGACY_DEFAULT_LOGO) {
    parsed.school.logoUrl = DEFAULT_SCHOOL_LOGO;
  }
  if (!Array.isArray(parsed.classes)) parsed.classes = [];
  if (!Array.isArray(parsed.students)) parsed.students = [];
  if (!Array.isArray(parsed.questions)) parsed.questions = [];
  if (!Array.isArray(parsed.exams)) parsed.exams = [];
  if (!Array.isArray(parsed.sessions)) parsed.sessions = [];
  return parsed;
}

function saveStore(db: AppDatabase) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const serialized = JSON.stringify(db, null, 2);
  const tmpStore = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmpStore, serialized, 'utf-8');
  fs.renameSync(tmpStore, STORE_PATH);

  const tmpBackup = `${BACKUP_PATH}.tmp`;
  fs.writeFileSync(tmpBackup, serialized, 'utf-8');
  fs.renameSync(tmpBackup, BACKUP_PATH);
}

function ensureStore(): AppDatabase {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    if (fs.existsSync(BACKUP_PATH)) {
      try {
        const backupRaw = fs.readFileSync(BACKUP_PATH, 'utf-8');
        const backupParsed = JSON.parse(backupRaw) as AppDatabase;
        if (backupParsed && backupParsed.school && Array.isArray(backupParsed.questions)) {
          const normalized = normalizeLoadedDatabase(backupParsed);
          saveStore(normalized);
          return normalized;
        }
      } catch {
        // fall through to initial
      }
    }
    const initial = createInitialDemoDatabase();
    saveStore(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as AppDatabase;
    if (!parsed || !parsed.school || !Array.isArray(parsed.questions)) {
      throw new Error('Invalid store format');
    }
    const prevLogo = parsed.school.logoUrl;
    const normalized = normalizeLoadedDatabase(parsed);
    if (prevLogo !== normalized.school.logoUrl) {
      saveStore(normalized);
    }
    return normalized;
  } catch {
    if (fs.existsSync(BACKUP_PATH)) {
      try {
        const backupRaw = fs.readFileSync(BACKUP_PATH, 'utf-8');
        const backupParsed = JSON.parse(backupRaw) as AppDatabase;
        if (backupParsed && backupParsed.school && Array.isArray(backupParsed.questions)) {
          const normalized = normalizeLoadedDatabase(backupParsed);
          saveStore(normalized);
          return normalized;
        }
      } catch {
        // fall through
      }
    }
    const fallback = createInitialDemoDatabase();
    saveStore(fallback);
    return fallback;
  }
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sanitizeDatabaseForClient(db: AppDatabase) {
  return db;
}

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function isWithinExamSchedule(exam: ExamConfig): { ok: boolean; message?: string } {
  if (!exam.aktif) {
    return { ok: false, message: 'Ujian sedang dinonaktifkan oleh proktor atau guru.' };
  }
  const [y, m, d] = (exam.tanggalUjian || '').split('-').map(Number);
  if (!y || !m || !d) return { ok: true };

  const [startH, startM] = (exam.jamMulai || '00:00').split(':').map(Number);
  const [endH, endM] = (exam.jamSelesai || '23:59').split(':').map(Number);

  const startUtcMs = Date.UTC(y, m - 1, d, startH || 0, startM || 0, 0, 0) - WIB_OFFSET_MS;
  let endUtcMs =
    Date.UTC(y, m - 1, d, Number.isFinite(endH) ? endH : 23, Number.isFinite(endM) ? endM : 59, 59, 999) -
    WIB_OFFSET_MS;

  if (endUtcMs < startUtcMs) {
    endUtcMs += 24 * 60 * 60 * 1000;
  }

  const nowMs = Date.now();

  if (nowMs < startUtcMs) {
    return {
      ok: false,
      message: `Ujian belum dimulai. Jadwal mulai: ${exam.tanggalUjian} pukul ${exam.jamMulai} WIB.`,
    };
  }
  if (nowMs > endUtcMs) {
    return {
      ok: false,
      message: `Waktu jadwal ujian telah berakhir (${exam.tanggalUjian} pukul ${exam.jamSelesai} WIB).`,
    };
  }
  return { ok: true };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  let db = ensureStore();

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', school: db.school.namaSekolah });
  });

  app.get('/api/state', (_req, res) => {
    db = ensureStore();
    res.json(sanitizeDatabaseForClient(db));
  });

  app.post('/api/auth/login', (req, res) => {
    const { role, identifier, password } = req.body as {
      role?: 'admin' | 'student';
      identifier?: string;
      password?: string;
    };

    const idNorm = String(identifier || '').trim();
    const pwNorm = String(password || '').trim();

    if (!idNorm || !pwNorm) {
      return res.status(400).json({ error: 'Username/Nomor Peserta dan kata sandi wajib diisi.' });
    }

    if (role === 'admin') {
      if (idNorm.toLowerCase() === db.admin.username.toLowerCase() && pwNorm === db.admin.password) {
        return res.json({
          user: { role: 'admin', userId: db.admin.id, name: db.admin.name },
        });
      }
      return res.status(401).json({ error: 'Username atau kata sandi Admin/Guru tidak sesuai.' });
    }

    const student = db.students.find(
      (s) =>
        (s.username.toLowerCase() === idNorm.toLowerCase() ||
          s.nomorPeserta.toLowerCase() === idNorm.toLowerCase()) &&
        s.password === pwNorm
    );

    if (!student) {
      return res.status(401).json({ error: 'Nomor peserta/username atau kata sandi siswa salah.' });
    }

    return res.json({
      user: { role: 'student', userId: student.id, name: student.nama },
    });
  });

  app.post('/api/exam/start', (req, res) => {
    db = ensureStore();
    const { examId, studentId, token } = req.body as {
      examId?: string;
      studentId?: string;
      token?: string;
    };

    const student = db.students.find((s) => s.id === studentId);
    if (!student) {
      return res.status(404).json({ error: 'Data peserta didik tidak ditemukan.' });
    }

    const tokenInput = String(token || '').trim().replace(/\s+/g, '').toUpperCase();
    if (!tokenInput) {
      return res.status(400).json({ error: 'Token ujian wajib diisi.' });
    }

    let exam = db.exams.find((e) => e.id === examId);

    // If selected exam token does not match, check if token matches another active exam for this student's class
    if (!exam || exam.token.trim().replace(/\s+/g, '').toUpperCase() !== tokenInput) {
      const matchedByToken = db.exams.find(
        (e) =>
          e.kelasIds.includes(student.kelasId) &&
          e.token.trim().replace(/\s+/g, '').toUpperCase() === tokenInput
      );
      if (matchedByToken) {
        exam = matchedByToken;
      }
    }

    if (!exam) {
      return res.status(404).json({ error: 'Data ujian tidak ditemukan atau token tidak sesuai.' });
    }

    if (!exam.kelasIds.includes(student.kelasId)) {
      return res.status(403).json({ error: 'Kelas Anda tidak terdaftar pada ujian ini.' });
    }

    // Check if there is already an active in-progress session to resume
    const existingInProgress = db.sessions.find(
      (s) => s.examId === exam.id && s.studentId === student.id && s.status === 'in_progress'
    );

    const scheduleCheck = isWithinExamSchedule(exam);
    if (!scheduleCheck.ok && !existingInProgress) {
      return res.status(403).json({ error: scheduleCheck.message });
    }

    const expectedToken = exam.token.trim().replace(/\s+/g, '').toUpperCase();
    if (tokenInput !== expectedToken) {
      return res.status(403).json({
        error: 'Token ujian tidak valid. Periksa kembali token dari guru/proktor.',
      });
    }

    if (existingInProgress) {
      if (Date.now() >= existingInProgress.endsAt) {
        const finalized = evaluateExamSession(existingInProgress, exam, db.questions);
        db.sessions = db.sessions.map((s) => (s.id === finalized.id ? finalized : s));
        saveStore(db);
        return res.status(409).json({
          error: 'Waktu sesi ujian sebelumnya sudah habis dan jawaban telah dikumpulkan otomatis.',
          session: finalized,
        });
      }
      return res.json({ session: existingInProgress });
    }

    const completedCount = db.sessions.filter(
      (s) => s.examId === exam.id && s.studentId === student.id && s.status === 'submitted'
    ).length;

    if (completedCount >= Math.max(1, exam.kesempatan)) {
      return res.status(403).json({
        error: `Kesempatan mengerjakan ujian ini (${exam.kesempatan}x) sudah habis. Hubungi guru jika perlu reset ujian.`,
      });
    }

    const validQuestionIds = exam.questionIds.filter((qid) =>
      db.questions.some((q) => q.id === qid)
    );

    if (validQuestionIds.length === 0) {
      return res.status(400).json({ error: 'Ujian ini belum memiliki daftar soal yang valid.' });
    }

    const questionOrder = exam.acakSoal
      ? shuffleArray(validQuestionIds)
      : [...validQuestionIds];

    const optionOrders: Record<string, string[]> = {};
    if (exam.acakPilihan) {
      for (const qid of questionOrder) {
        const q = db.questions.find((item) => item.id === qid);
        if (q?.pilihan && q.pilihan.length > 0) {
          optionOrders[qid] = shuffleArray(q.pilihan.map((p) => p.key));
        }
      }
    }

    const now = Date.now();
    const newSession: ExamSession = {
      id: `SES-${now}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      examId: exam.id,
      studentId: student.id,
      attemptNumber: completedCount + 1,
      status: 'in_progress',
      locked: false,
      questionOrder,
      optionOrders,
      answers: {},
      flaggedIds: [],
      startedAt: now,
      endsAt: now + exam.durasiMenit * 60 * 1000,
      tabLeaveCount: 0,
      jumlahSoal: questionOrder.length,
      jumlahBenar: 0,
      jumlahSalah: 0,
      tidakDijawab: questionOrder.length,
      skorDiperoleh: 0,
      skorMaksimal: 0,
      nilaiAkhir: 0,
      persentaseBenar: 0,
      tuntas: false,
      materiBreakdown: [],
      questionDetails: [],
    };

    db.sessions.push(newSession);
    saveStore(db);
    return res.json({ session: newSession });
  });

  app.post('/api/exam/autosave', (req, res) => {
    const { sessionId, answers, flaggedIds, tabLeaveCount } = req.body as {
      sessionId?: string;
      answers?: Record<string, StudentAnswerValue>;
      flaggedIds?: string[];
      tabLeaveCount?: number;
    };

    const idx = db.sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Sesi ujian tidak ditemukan.' });
    }

    const session = db.sessions[idx];
    if (session.locked || session.status === 'submitted') {
      return res.status(409).json({ error: 'Ujian sudah dikunci dan dikirim.', session });
    }

    db.sessions[idx] = {
      ...session,
      answers: answers ?? session.answers,
      flaggedIds: flaggedIds ?? session.flaggedIds,
      tabLeaveCount:
        typeof tabLeaveCount === 'number'
          ? Math.max(session.tabLeaveCount, tabLeaveCount)
          : session.tabLeaveCount,
    };
    saveStore(db);
    return res.json({ session: db.sessions[idx] });
  });

  app.post('/api/exam/submit', (req, res) => {
    const { sessionId, answers, flaggedIds, tabLeaveCount } = req.body as {
      sessionId?: string;
      answers?: Record<string, StudentAnswerValue>;
      flaggedIds?: string[];
      tabLeaveCount?: number;
    };

    const idx = db.sessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Sesi ujian tidak ditemukan.' });
    }

    const session = db.sessions[idx];
    if (session.locked || session.status === 'submitted') {
      return res.json({ session, alreadySubmitted: true });
    }

    const exam = db.exams.find((e) => e.id === session.examId);
    if (!exam) {
      return res.status(404).json({ error: 'Konfigurasi ujian tidak ditemukan.' });
    }

    const merged: ExamSession = {
      ...session,
      answers: answers ?? session.answers,
      flaggedIds: flaggedIds ?? session.flaggedIds,
      tabLeaveCount:
        typeof tabLeaveCount === 'number'
          ? Math.max(session.tabLeaveCount, tabLeaveCount)
          : session.tabLeaveCount,
      submittedAt: Date.now(),
    };

    const evaluated = evaluateExamSession(merged, exam, db.questions);
    db.sessions[idx] = evaluated;
    saveStore(db);
    return res.json({ session: evaluated });
  });

  // Admin School & Account Settings
  app.put('/api/school', (req, res) => {
    db = ensureStore();
    db.school = req.body as SchoolProfile;
    saveStore(db);
    res.json({ school: db.school });
  });

  app.put('/api/admin-account', (req, res) => {
    db = ensureStore();
    db.admin = req.body as AdminAccount;
    saveStore(db);
    res.json({ admin: db.admin });
  });

  // Classes CRUD
  app.post('/api/classes', (req, res) => {
    db = ensureStore();
    const item = req.body as ClassGroup;
    db.classes.push(item);
    saveStore(db);
    res.json({ classes: db.classes });
  });

  app.put('/api/classes/:id', (req, res) => {
    db = ensureStore();
    const updated = req.body as ClassGroup;
    db.classes = db.classes.map((c) => (c.id === req.params.id ? updated : c));
    saveStore(db);
    res.json({ classes: db.classes });
  });

  app.delete('/api/classes/:id', (req, res) => {
    db = ensureStore();
    db.classes = db.classes.filter((c) => c.id !== req.params.id);
    saveStore(db);
    res.json({ classes: db.classes });
  });

  // Students CRUD
  app.post('/api/students', (req, res) => {
    db = ensureStore();
    const item = req.body as Student;
    db.students.push(item);
    saveStore(db);
    res.json({ students: db.students });
  });

  app.post('/api/students/bulk', (req, res) => {
    db = ensureStore();
    const body = req.body as Student[] | { students?: Student[]; updateExisting?: boolean };
    const incoming = Array.isArray(body) ? body : body?.students || [];
    const updateExisting = !Array.isArray(body) && Boolean(body?.updateExisting);
    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    if (Array.isArray(incoming)) {
      const existingByNumber = new Map(
        db.students.map((s) => [s.nomorPeserta.trim().toLowerCase(), s])
      );
      const existingIds = new Set(db.students.map((s) => s.id));
      const validClassIds = new Set(db.classes.map((c) => c.id));
      const fallbackClassId = db.classes[0]?.id || 'KLS-6A';
      const additions: Student[] = [];
      const updatesById = new Map<string, Student>();

      incoming.forEach((s, idx) => {
        const nomor = String(s.nomorPeserta || '').trim();
        const nama = String(s.nama || '').trim();
        const key = nomor.toLowerCase();
        if (!key || !nama) {
          skippedCount += 1;
          return;
        }
        const matchedExisting = existingByNumber.get(key);
        if (matchedExisting) {
          if (updateExisting) {
            const nextStudent: Student = {
              ...matchedExisting,
              username: String(s.username || '').trim() || matchedExisting.username,
              password: String(s.password || '').trim() || matchedExisting.password,
              nama,
              kelasId: validClassIds.has(s.kelasId) ? s.kelasId : matchedExisting.kelasId,
              jenisKelamin: s.jenisKelamin === 'P' ? 'P' : 'L',
            };
            updatesById.set(matchedExisting.id, nextStudent);
            updatedCount += 1;
          } else {
            skippedCount += 1;
          }
          return;
        }

        let finalId = String(s.id || '').trim();
        if (!finalId || existingIds.has(finalId)) {
          finalId = `STD-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
        }
        existingIds.add(finalId);

        const newStudent: Student = {
          id: finalId,
          nomorPeserta: nomor,
          username: String(s.username || '').trim() || nomor,
          password: String(s.password || '').trim() || '123',
          nama,
          kelasId: validClassIds.has(s.kelasId) ? s.kelasId : fallbackClassId,
          jenisKelamin: s.jenisKelamin === 'P' ? 'P' : 'L',
        };
        existingByNumber.set(key, newStudent);
        additions.push(newStudent);
      });

      if (updatesById.size > 0) {
        db.students = db.students.map((st) => updatesById.get(st.id) || st);
      }
      db.students.push(...additions);
      addedCount = additions.length;
      saveStore(db);
    }
    res.json({ students: db.students, addedCount, updatedCount, skippedCount });
  });

  app.put('/api/students/:id', (req, res) => {
    db = ensureStore();
    const updated = req.body as Student;
    db.students = db.students.map((s) => (s.id === req.params.id ? updated : s));
    saveStore(db);
    res.json({ students: db.students });
  });

  app.delete('/api/students/:id', (req, res) => {
    db = ensureStore();
    db.students = db.students.filter((s) => s.id !== req.params.id);
    db.sessions = db.sessions.filter((ses) => ses.studentId !== req.params.id);
    saveStore(db);
    res.json({ students: db.students, sessions: db.sessions });
  });

  // Questions CRUD
  app.post('/api/questions', (req, res) => {
    db = ensureStore();
    const item = req.body as Question;
    db.questions.unshift(item);
    saveStore(db);
    res.json({ questions: db.questions });
  });

  app.post('/api/questions/bulk', (req, res) => {
    db = ensureStore();
    const body = req.body as Question[] | { questions?: Question[]; updateExistingIds?: boolean };
    const incoming = Array.isArray(body) ? body : body?.questions || [];
    const updateExistingIds = !Array.isArray(body) && Boolean(body?.updateExistingIds);
    let addedCount = 0;
    let updatedCount = 0;
    if (Array.isArray(incoming)) {
      const existingIds = new Set(db.questions.map((q) => q.id));
      const cleanedAdditions: Question[] = [];
      const updatesById = new Map<string, Question>();

      incoming.forEach((q, idx) => {
        if (!q || !String(q.pertanyaan || '').trim()) return;
        const mataUji = q.mataUji === 'Bahasa Indonesia' ? 'Bahasa Indonesia' : 'Matematika';
        const prefix = mataUji === 'Matematika' ? 'MTK' : 'IND';
        const rawId = String(q.id || '').trim();
        const isExisting = Boolean(rawId) && existingIds.has(rawId);

        let finalId = rawId;
        if (!isExisting) {
          if (!finalId || existingIds.has(finalId)) {
            finalId = `${finalId || `${prefix}-IMP`}-${Date.now().toString().slice(-4)}${idx}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
          }
          existingIds.add(finalId);
        } else if (!updateExistingIds) {
          finalId = `${finalId}-${Date.now().toString().slice(-4)}${idx}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
          existingIds.add(finalId);
        }

        const normalizedQ: Question = {
          ...q,
          id: finalId,
          mataUji,
          materi: String(q.materi || 'Umum').trim(),
          kompetensi: String(q.kompetensi || q.materi || 'Umum').trim(),
          indikator: String(q.indikator || '').trim(),
          tingkatKesulitan:
            q.tingkatKesulitan === 'Mudah' || q.tingkatKesulitan === 'Sulit'
              ? q.tingkatKesulitan
              : 'Sedang',
          jenisSoal:
            q.jenisSoal === 'PGK' ||
            q.jenisSoal === 'BS' ||
            q.jenisSoal === 'MENJODOHKAN' ||
            q.jenisSoal === 'ISIAN'
              ? q.jenisSoal
              : 'PG',
          pertanyaan: String(q.pertanyaan).trim(),
          bobot: Number(q.bobot) > 0 ? Number(q.bobot) : 5,
          pembahasan: String(q.pembahasan || '').trim(),
          createdAt: q.createdAt || new Date().toISOString(),
        };

        if (isExisting && updateExistingIds) {
          updatesById.set(finalId, normalizedQ);
          updatedCount += 1;
        } else {
          cleanedAdditions.push(normalizedQ);
        }
      });

      if (updatesById.size > 0) {
        db.questions = db.questions.map((item) => updatesById.get(item.id) || item);
      }
      db.questions.unshift(...cleanedAdditions);
      addedCount = cleanedAdditions.length;
      saveStore(db);
    }
    res.json({ questions: db.questions, addedCount, updatedCount });
  });

  app.post('/api/questions/parse-document', async (req, res) => {
    try {
      const { fileName, mimeType, fileBase64, defaultMataUji, mode, autoSolveMissingKeys } =
        req.body as {
          fileName?: string;
          mimeType?: string;
          fileBase64?: string;
          defaultMataUji?: 'Matematika' | 'Bahasa Indonesia' | 'AUTO';
          mode?: 'ai' | 'pattern';
          autoSolveMissingKeys?: boolean;
        };

      if (!fileName || !fileBase64) {
        return res.status(400).json({ error: 'Berkas dokumen (.docx/.pdf/.txt) wajib diunggah.' });
      }

      const result = await parseQuestionsFromDocument({
        fileName,
        mimeType: mimeType || 'application/octet-stream',
        fileBase64,
        defaultMataUji: defaultMataUji || 'AUTO',
        mode: mode === 'pattern' ? 'pattern' : 'ai',
        autoSolveMissingKeys: autoSolveMissingKeys !== false,
      });

      return res.json(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Gagal membaca dokumen soal pada server.';
      const status =
        message.includes('GEMINI_API_KEY') || message.includes('AI') ? 500 : 400;
      return res.status(status).json({ error: message });
    }
  });

  app.post('/api/questions/solve-keys', async (req, res) => {
    try {
      const { questions } = req.body as { questions?: Question[] };
      if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: 'Daftar soal untuk dilengkapi kunci jawabannya kosong.' });
      }
      const result = await solveQuestionKeysWithAI(questions);
      return res.json(result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Gagal melengkapi kunci jawaban soal dengan AI.';
      const status = message.includes('GEMINI_API_KEY') ? 500 : 400;
      return res.status(status).json({ error: message });
    }
  });

  app.post('/api/store/flush', (_req, res) => {
    db = ensureStore();
    saveStore(db);
    res.json({
      savedAt: new Date().toISOString(),
      counts: {
        classes: db.classes.length,
        students: db.students.length,
        questions: db.questions.length,
        exams: db.exams.length,
        sessions: db.sessions.length,
      },
      database: db,
    });
  });

  app.post('/api/store/merge-backup', (req, res) => {
    db = ensureStore();
    const payload = req.body as Partial<AppDatabase>;
    let addedClasses = 0;
    let addedStudents = 0;
    let addedQuestions = 0;
    let addedExams = 0;

    if (Array.isArray(payload.classes)) {
      const clsIds = new Set(db.classes.map((c) => c.id));
      payload.classes.forEach((c) => {
        if (c && c.id && c.namaKelas && !clsIds.has(c.id)) {
          clsIds.add(c.id);
          db.classes.push(c);
          addedClasses += 1;
        }
      });
    }

    if (Array.isArray(payload.students)) {
      const stdNums = new Set(db.students.map((s) => s.nomorPeserta.trim().toLowerCase()));
      const stdIds = new Set(db.students.map((s) => s.id));
      payload.students.forEach((s) => {
        const key = String(s?.nomorPeserta || '').trim().toLowerCase();
        if (s && s.id && key && s.nama && !stdNums.has(key) && !stdIds.has(s.id)) {
          stdNums.add(key);
          stdIds.add(s.id);
          db.students.push(s);
          addedStudents += 1;
        }
      });
    }

    if (Array.isArray(payload.questions)) {
      const qIds = new Set(db.questions.map((q) => q.id));
      const newQs: Question[] = [];
      payload.questions.forEach((q) => {
        if (q && q.id && q.pertanyaan && !qIds.has(q.id)) {
          qIds.add(q.id);
          newQs.push(q);
          addedQuestions += 1;
        }
      });
      if (newQs.length > 0) {
        db.questions.unshift(...newQs);
      }
    }

    if (Array.isArray(payload.exams)) {
      const exIds = new Set(db.exams.map((e) => e.id));
      payload.exams.forEach((ex) => {
        if (ex && ex.id && ex.namaUjian && !exIds.has(ex.id)) {
          exIds.add(ex.id);
          db.exams.push(ex);
          addedExams += 1;
        }
      });
    }

    saveStore(db);
    res.json({
      database: db,
      merged: { addedClasses, addedStudents, addedQuestions, addedExams },
    });
  });

  app.post('/api/questions/generate', async (req, res) => {
    try {
      const {
        mataUji,
        kisiKisiTopic,
        materiKhusus,
        jenisSoal,
        tingkatKesulitan,
        jumlahSoal,
        konteksTema,
      } = req.body as {
        mataUji?: 'Matematika' | 'Bahasa Indonesia';
        kisiKisiTopic?: string;
        materiKhusus?: string;
        jenisSoal?: 'PG' | 'PGK' | 'BS' | 'MENJODOHKAN' | 'ISIAN' | 'CAMPURAN_TKA';
        tingkatKesulitan?: 'Mudah' | 'Sedang' | 'Sulit' | 'CAMPURAN';
        jumlahSoal?: number;
        konteksTema?: string;
      };

      const questions = await generateTkaQuestions({
        mataUji: mataUji === 'Bahasa Indonesia' ? 'Bahasa Indonesia' : 'Matematika',
        kisiKisiTopic: kisiKisiTopic || 'ALL_MTK',
        materiKhusus: materiKhusus?.trim() || undefined,
        jenisSoal: jenisSoal || 'CAMPURAN_TKA',
        tingkatKesulitan: tingkatKesulitan || 'CAMPURAN',
        jumlahSoal: Number(jumlahSoal) || 5,
        konteksTema,
      });

      return res.json({ questions });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Gagal membuat soal otomatis di server.';
      const status = message.includes('GEMINI_API_KEY') ? 500 : 400;
      return res.status(status).json({ error: message });
    }
  });

  app.put('/api/questions/:id', (req, res) => {
    db = ensureStore();
    const updated = req.body as Question;
    db.questions = db.questions.map((q) => (q.id === req.params.id ? updated : q));
    saveStore(db);
    res.json({ questions: db.questions });
  });

  app.delete('/api/questions/:id', (req, res) => {
    db = ensureStore();
    db.questions = db.questions.filter((q) => q.id !== req.params.id);
    saveStore(db);
    res.json({ questions: db.questions });
  });

  // Exams CRUD
  app.post('/api/exams', (req, res) => {
    db = ensureStore();
    const item = req.body as ExamConfig;
    db.exams.unshift(item);
    saveStore(db);
    res.json({ exams: db.exams });
  });

  app.put('/api/exams/:id', (req, res) => {
    db = ensureStore();
    const updated = req.body as ExamConfig;
    db.exams = db.exams.map((e) => (e.id === req.params.id ? updated : e));
    saveStore(db);
    res.json({ exams: db.exams });
  });

  app.delete('/api/exams/:id', (req, res) => {
    db = ensureStore();
    db.exams = db.exams.filter((e) => e.id !== req.params.id);
    db.sessions = db.sessions.filter((s) => s.examId !== req.params.id);
    saveStore(db);
    res.json({ exams: db.exams, sessions: db.sessions });
  });

  // Reset student exam attempts
  app.delete('/api/sessions/reset', (req, res) => {
    db = ensureStore();
    const { examId, studentId } = req.body as { examId?: string; studentId?: string };
    db.sessions = db.sessions.filter(
      (s) => !(s.examId === examId && s.studentId === studentId)
    );
    saveStore(db);
    res.json({ sessions: db.sessions });
  });

  // Full database import / reset
  app.post('/api/database/import', (req, res) => {
    const incoming = req.body as AppDatabase;
    if (!incoming || !incoming.school || !Array.isArray(incoming.questions)) {
      return res.status(400).json({ error: 'Format file backup JSON tidak valid.' });
    }
    db = incoming;
    saveStore(db);
    return res.json(db);
  });

  app.post('/api/database/reset-demo', (_req, res) => {
    db = createInitialDemoDatabase();
    saveStore(db);
    res.json(db);
  });

  // Vite dev middleware vs static production serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TKA SMART EXAM MI/SD running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

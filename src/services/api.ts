import { createInitialDemoDatabase } from '../data/demoData.ts';
import type {
  AdminAccount,
  AppDatabase,
  AuthSession,
  ClassGroup,
  ExamConfig,
  ExamSession,
  Question,
  SchoolProfile,
  Student,
  StudentAnswerValue,
} from '../types.ts';

const CACHE_KEY = 'tka_smart_exam_db_cache_v1';
const AUTH_KEY = 'tka_smart_exam_auth_v1';

export function readCachedDb(): AppDatabase {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppDatabase;
      if (parsed && parsed.school && Array.isArray(parsed.questions)) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return createInitialDemoDatabase();
}

export function writeCachedDb(db: AppDatabase) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(db));
  } catch {
    try {
      // If quota exceeded due to large inline image data URLs, strip heavy imageUrl fields for cache only
      const lightweight: AppDatabase = {
        ...db,
        questions: db.questions.map((q) =>
          q.stimulus?.imageUrl && q.stimulus.imageUrl.length > 8192
            ? { ...q, stimulus: { ...q.stimulus, imageUrl: '' } }
            : q
        ),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(lightweight));
    } catch {
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch {
        // ignore
      }
    }
  }
}

export function patchCachedDb(partial: Partial<AppDatabase>) {
  try {
    const current = readCachedDb();
    writeCachedDb({ ...current, ...partial });
  } catch {
    // ignore
  }
}

export function readSavedAuth(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

export function writeSavedAuth(auth: AuthSession | null) {
  try {
    if (auth) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    } else {
      localStorage.removeItem(AUTH_KEY);
    }
  } catch {
    // ignore
  }
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data && data.error) || 'Terjadi kesalahan pada server.');
  }
  return data as T;
}

export async function fetchDatabaseState(): Promise<AppDatabase> {
  const db = await requestJson<AppDatabase>('/api/state');
  writeCachedDb(db);
  return db;
}

export async function loginUser(
  role: 'admin' | 'student',
  identifier: string,
  password: string
): Promise<AuthSession> {
  const data = await requestJson<{ user: AuthSession }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ role, identifier, password }),
  });
  return data.user;
}

export async function startExamSession(
  examId: string,
  studentId: string,
  token: string
): Promise<ExamSession> {
  const data = await requestJson<{ session: ExamSession }>('/api/exam/start', {
    method: 'POST',
    body: JSON.stringify({ examId, studentId, token }),
  });
  return data.session;
}

export async function autosaveExamSession(
  sessionId: string,
  answers: Record<string, StudentAnswerValue>,
  flaggedIds: string[],
  tabLeaveCount: number
): Promise<ExamSession> {
  const data = await requestJson<{ session: ExamSession }>('/api/exam/autosave', {
    method: 'POST',
    body: JSON.stringify({ sessionId, answers, flaggedIds, tabLeaveCount }),
  });
  return data.session;
}

export async function submitExamSession(
  sessionId: string,
  answers: Record<string, StudentAnswerValue>,
  flaggedIds: string[],
  tabLeaveCount: number
): Promise<ExamSession> {
  const data = await requestJson<{ session: ExamSession }>('/api/exam/submit', {
    method: 'POST',
    body: JSON.stringify({ sessionId, answers, flaggedIds, tabLeaveCount }),
  });
  return data.session;
}

export async function updateSchoolProfile(school: SchoolProfile): Promise<SchoolProfile> {
  const data = await requestJson<{ school: SchoolProfile }>('/api/school', {
    method: 'PUT',
    body: JSON.stringify(school),
  });
  patchCachedDb({ school: data.school });
  return data.school;
}

export async function updateAdminAccount(admin: AdminAccount): Promise<AdminAccount> {
  const data = await requestJson<{ admin: AdminAccount }>('/api/admin-account', {
    method: 'PUT',
    body: JSON.stringify(admin),
  });
  patchCachedDb({ admin: data.admin });
  return data.admin;
}

export async function createClassGroup(cls: ClassGroup): Promise<ClassGroup[]> {
  const data = await requestJson<{ classes: ClassGroup[] }>('/api/classes', {
    method: 'POST',
    body: JSON.stringify(cls),
  });
  patchCachedDb({ classes: data.classes });
  return data.classes;
}

export async function updateClassGroup(cls: ClassGroup): Promise<ClassGroup[]> {
  const data = await requestJson<{ classes: ClassGroup[] }>(`/api/classes/${cls.id}`, {
    method: 'PUT',
    body: JSON.stringify(cls),
  });
  patchCachedDb({ classes: data.classes });
  return data.classes;
}

export async function deleteClassGroup(id: string): Promise<ClassGroup[]> {
  const data = await requestJson<{ classes: ClassGroup[] }>(`/api/classes/${id}`, {
    method: 'DELETE',
  });
  patchCachedDb({ classes: data.classes });
  return data.classes;
}

export async function createStudent(student: Student): Promise<Student[]> {
  const data = await requestJson<{ students: Student[] }>('/api/students', {
    method: 'POST',
    body: JSON.stringify(student),
  });
  patchCachedDb({ students: data.students });
  return data.students;
}

export async function bulkImportStudents(
  students: Student[],
  options?: { updateExisting?: boolean }
): Promise<{
  students: Student[];
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
}> {
  const payload = options?.updateExisting
    ? { students, updateExisting: true }
    : students;
  const data = await requestJson<{
    students: Student[];
    addedCount?: number;
    updatedCount?: number;
    skippedCount?: number;
  }>('/api/students/bulk', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  patchCachedDb({ students: data.students });
  return {
    students: data.students,
    addedCount: data.addedCount ?? students.length,
    updatedCount: data.updatedCount ?? 0,
    skippedCount: data.skippedCount ?? 0,
  };
}

export async function updateStudent(student: Student): Promise<Student[]> {
  const data = await requestJson<{ students: Student[] }>(`/api/students/${student.id}`, {
    method: 'PUT',
    body: JSON.stringify(student),
  });
  patchCachedDb({ students: data.students });
  return data.students;
}

export async function deleteStudent(
  id: string
): Promise<{ students: Student[]; sessions: ExamSession[] }> {
  const data = await requestJson<{ students: Student[]; sessions: ExamSession[] }>(
    `/api/students/${id}`,
    {
      method: 'DELETE',
    }
  );
  patchCachedDb({ students: data.students, sessions: data.sessions });
  return data;
}

export async function createQuestion(question: Question): Promise<Question[]> {
  const data = await requestJson<{ questions: Question[] }>('/api/questions', {
    method: 'POST',
    body: JSON.stringify(question),
  });
  patchCachedDb({ questions: data.questions });
  return data.questions;
}

export async function bulkImportQuestions(
  questions: Question[],
  options?: { updateExistingIds?: boolean }
): Promise<{ questions: Question[]; addedCount: number; updatedCount: number }> {
  const payload = options?.updateExistingIds
    ? { questions, updateExistingIds: true }
    : questions;
  const data = await requestJson<{
    questions: Question[];
    addedCount?: number;
    updatedCount?: number;
  }>('/api/questions/bulk', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  patchCachedDb({ questions: data.questions });
  return {
    questions: data.questions,
    addedCount: data.addedCount ?? questions.length,
    updatedCount: data.updatedCount ?? 0,
  };
}

export async function parseQuestionDocument(payload: {
  fileName: string;
  mimeType: string;
  fileBase64: string;
  defaultMataUji: 'Matematika' | 'Bahasa Indonesia' | 'AUTO';
  mode: 'ai' | 'pattern';
  autoSolveMissingKeys?: boolean;
}): Promise<{
  questions: Question[];
  extractedPreviewText: string;
  aiSolvedIds: string[];
  missingKeyIds: string[];
}> {
  return requestJson<{
    questions: Question[];
    extractedPreviewText: string;
    aiSolvedIds: string[];
    missingKeyIds: string[];
  }>('/api/questions/parse-document', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function solveQuestionKeys(
  questions: Question[]
): Promise<{ questions: Question[]; solvedIds: string[] }> {
  return requestJson<{ questions: Question[]; solvedIds: string[] }>(
    '/api/questions/solve-keys',
    {
      method: 'POST',
      body: JSON.stringify({ questions }),
    }
  );
}

export async function generateKisiKisiQuestions(payload: {
  mataUji: 'Matematika' | 'Bahasa Indonesia';
  kisiKisiTopic: string;
  materiKhusus?: string;
  jenisSoal: 'PG' | 'PGK' | 'BS' | 'MENJODOHKAN' | 'ISIAN' | 'CAMPURAN_TKA';
  tingkatKesulitan: 'Mudah' | 'Sedang' | 'Sulit' | 'CAMPURAN';
  jumlahSoal: number;
  konteksTema?: string;
}): Promise<{ questions: Question[] }> {
  return requestJson<{ questions: Question[] }>('/api/questions/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateQuestion(question: Question): Promise<Question[]> {
  const data = await requestJson<{ questions: Question[] }>(`/api/questions/${question.id}`, {
    method: 'PUT',
    body: JSON.stringify(question),
  });
  patchCachedDb({ questions: data.questions });
  return data.questions;
}

export async function deleteQuestion(id: string): Promise<Question[]> {
  const data = await requestJson<{ questions: Question[] }>(`/api/questions/${id}`, {
    method: 'DELETE',
  });
  patchCachedDb({ questions: data.questions });
  return data.questions;
}

export async function createExam(exam: ExamConfig): Promise<ExamConfig[]> {
  const data = await requestJson<{ exams: ExamConfig[] }>('/api/exams', {
    method: 'POST',
    body: JSON.stringify(exam),
  });
  patchCachedDb({ exams: data.exams });
  return data.exams;
}

export async function updateExam(exam: ExamConfig): Promise<ExamConfig[]> {
  const data = await requestJson<{ exams: ExamConfig[] }>(`/api/exams/${exam.id}`, {
    method: 'PUT',
    body: JSON.stringify(exam),
  });
  patchCachedDb({ exams: data.exams });
  return data.exams;
}

export async function deleteExam(
  id: string
): Promise<{ exams: ExamConfig[]; sessions: ExamSession[] }> {
  const data = await requestJson<{ exams: ExamConfig[]; sessions: ExamSession[] }>(
    `/api/exams/${id}`,
    {
      method: 'DELETE',
    }
  );
  patchCachedDb({ exams: data.exams, sessions: data.sessions });
  return data;
}

export async function resetStudentExamSessions(
  examId: string,
  studentId: string
): Promise<ExamSession[]> {
  const data = await requestJson<{ sessions: ExamSession[] }>('/api/sessions/reset', {
    method: 'DELETE',
    body: JSON.stringify({ examId, studentId }),
  });
  patchCachedDb({ sessions: data.sessions });
  return data.sessions;
}

export async function flushDatabaseToServer(): Promise<{
  savedAt: string;
  counts: {
    classes: number;
    students: number;
    questions: number;
    exams: number;
    sessions: number;
  };
  database: AppDatabase;
}> {
  const data = await requestJson<{
    savedAt: string;
    counts: {
      classes: number;
      students: number;
      questions: number;
      exams: number;
      sessions: number;
    };
    database: AppDatabase;
  }>('/api/store/flush', {
    method: 'POST',
  });
  writeCachedDb(data.database);
  return data;
}

export async function mergeBackupToServer(backup: Partial<AppDatabase>): Promise<{
  database: AppDatabase;
  merged: {
    addedClasses: number;
    addedStudents: number;
    addedQuestions: number;
    addedExams: number;
  };
}> {
  const data = await requestJson<{
    database: AppDatabase;
    merged: {
      addedClasses: number;
      addedStudents: number;
      addedQuestions: number;
      addedExams: number;
    };
  }>('/api/store/merge-backup', {
    method: 'POST',
    body: JSON.stringify(backup),
  });
  writeCachedDb(data.database);
  return data;
}

export async function importFullDatabase(db: AppDatabase): Promise<AppDatabase> {
  const updated = await requestJson<AppDatabase>('/api/database/import', {
    method: 'POST',
    body: JSON.stringify(db),
  });
  writeCachedDb(updated);
  return updated;
}

export async function resetDemoDatabase(): Promise<AppDatabase> {
  const updated = await requestJson<AppDatabase>('/api/database/reset-demo', {
    method: 'POST',
  });
  writeCachedDb(updated);
  return updated;
}

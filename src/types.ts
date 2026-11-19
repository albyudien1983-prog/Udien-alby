export type UserRole = 'admin' | 'student';

export type MataUji = 'Matematika' | 'Bahasa Indonesia';

export type JenisSoal = 'PG' | 'PGK' | 'BS' | 'MENJODOHKAN' | 'ISIAN';

export type TingkatKesulitan = 'Mudah' | 'Sedang' | 'Sulit';

export type StimulusType =
  | 'none'
  | 'bacaan'
  | 'tabel'
  | 'diagram_batang'
  | 'bangun_datar'
  | 'bangun_ruang'
  | 'gambar';

export interface StimulusData {
  type: StimulusType;
  title?: string;
  content?: string;
  imageUrl?: string;
  tableHeaders?: string[];
  tableRows?: string[][];
  chartData?: { label: string; value: number; unit?: string }[];
  geometryKind?: 'gabungan_persegi_segitiga' | 'taman_lingkaran' | 'balok_kubus' | 'prisma_segitiga';
  geometryLabels?: string[];
  formula?: string;
}

export interface MatchingPair {
  id: string;
  left: string;
  right: string;
}

export interface BSStatement {
  id: string;
  text: string;
  answer: boolean;
}

export interface Question {
  id: string;
  mataUji: MataUji;
  materi: string;
  kompetensi: string;
  indikator: string;
  tingkatKesulitan: TingkatKesulitan;
  jenisSoal: JenisSoal;
  stimulus?: StimulusData;
  pertanyaan: string;
  bobot: number;
  pembahasan: string;
  // For PG (single key: 'A' | 'B' | 'C' | 'D') & PGK (array of keys: ['A', 'C'])
  pilihan?: { key: string; text: string }[];
  kunciPG?: string;
  kunciPGK?: string[];
  metodeNilaiPGK?: 'exact' | 'partial';
  // For BS (Benar / Salah statements)
  pernyataanBS?: BSStatement[];
  // For MENJODOHKAN
  pasanganJodoh?: MatchingPair[];
  // For ISIAN
  kunciIsian?: string[];
  createdAt: string;
}

export interface SchoolProfile {
  namaSekolah: string;
  jenjang: string;
  tahunPelajaran: string;
  kelasDefault: string;
  logoUrl: string;
  namaKepalaMadrasah: string;
  namaOperator: string;
  alamat?: string;
}

export interface AdminAccount {
  id: string;
  name: string;
  username: string;
  password: string;
  jabatan: string;
}

export interface ClassGroup {
  id: string;
  namaKelas: string;
  tingkat: string;
  waliKelas: string;
}

export interface Student {
  id: string;
  nomorPeserta: string;
  username: string;
  password: string;
  nama: string;
  kelasId: string;
  jenisKelamin: 'L' | 'P';
}

export interface ExamConfig {
  id: string;
  namaUjian: string;
  tahunPelajaran: string;
  kelasIds: string[];
  mataUji: MataUji | 'Campuran';
  tanggalUjian: string;
  jamMulai: string;
  jamSelesai: string;
  durasiMenit: number;
  jumlahSoal: number;
  nilaiMinimum: number;
  token: string;
  acakSoal: boolean;
  acakPilihan: boolean;
  kesempatan: number;
  tampilkanHasil: boolean;
  aktif: boolean;
  questionIds: string[];
  createdAt: string;
}

export type StudentAnswerValue =
  | string // PG or ISIAN
  | string[] // PGK
  | Record<string, boolean> // BS: { statementId: true/false }
  | Record<string, string>; // MENJODOHKAN: { leftPairId: rightText }

export interface MateriBreakdown {
  materi: string;
  mataUji: MataUji;
  totalQuestions: number;
  correctCount: number;
  earnedScore: number;
  maxScore: number;
  percentage: number;
}

export interface QuestionResultDetail {
  questionId: string;
  isCorrect: boolean;
  isPartial: boolean;
  isAnswered: boolean;
  earnedScore: number;
  maxScore: number;
  studentAnswer?: StudentAnswerValue;
}

export interface ExamSession {
  id: string;
  examId: string;
  studentId: string;
  attemptNumber: number;
  status: 'in_progress' | 'submitted';
  locked: boolean;
  questionOrder: string[];
  optionOrders: Record<string, string[]>;
  answers: Record<string, StudentAnswerValue>;
  flaggedIds: string[];
  startedAt: number;
  endsAt: number;
  submittedAt?: number;
  tabLeaveCount: number;
  // Evaluated metrics when submitted
  jumlahSoal: number;
  jumlahBenar: number;
  jumlahSalah: number;
  tidakDijawab: number;
  skorDiperoleh: number;
  skorMaksimal: number;
  nilaiAkhir: number;
  persentaseBenar: number;
  tuntas: boolean;
  materiBreakdown: MateriBreakdown[];
  questionDetails: QuestionResultDetail[];
}

export interface AppDatabase {
  school: SchoolProfile;
  admin: AdminAccount;
  classes: ClassGroup[];
  students: Student[];
  questions: Question[];
  exams: ExamConfig[];
  sessions: ExamSession[];
}

export interface AuthSession {
  role: UserRole;
  userId: string;
  name: string;
}

import * as XLSX from 'xlsx';
import type { ClassGroup, Student } from '../types.ts';

export interface ParsedStudentRow {
  student: Student;
  matchedClassName: string;
  usedFallbackClass: boolean;
  isDuplicate: boolean;
}

function normKey(val: unknown): string {
  return String(val ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function findClassId(
  rawKelas: string,
  classes: ClassGroup[],
  fallbackClassId: string
): { classId: string; className: string; usedFallback: boolean } {
  const cleaned = normKey(rawKelas).replace(/^kelas/, '');
  if (cleaned) {
    const matched = classes.find((c) => {
      const target = normKey(c.namaKelas).replace(/^kelas/, '');
      return target === cleaned || normKey(c.id) === normKey(rawKelas);
    });
    if (matched) {
      return { classId: matched.id, className: matched.namaKelas, usedFallback: false };
    }
  }
  const fallback = classes.find((c) => c.id === fallbackClassId) || classes[0];
  return {
    classId: fallback?.id || fallbackClassId || 'KLS-6A',
    className: fallback?.namaKelas || '-',
    usedFallback: true,
  };
}

function normalizeGender(raw: unknown): 'L' | 'P' {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'p' || s.startsWith('perempuan') || s === 'wanita' || s === 'pr') {
    return 'P';
  }
  return 'L';
}

export async function parseStudentsFromSpreadsheet(
  file: File,
  classes: ClassGroup[],
  existingStudents: Student[],
  fallbackClassId: string
): Promise<{ rows: ParsedStudentRow[]; sheetName: string }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('File Excel/CSV tidak memiliki lembar kerja (sheet) yang dapat dibaca.');
  }

  const sheet = workbook.Sheets[sheetName];
  const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (!rawMatrix || rawMatrix.length === 0) {
    throw new Error('Isi file Excel/CSV kosong.');
  }

  // Locate header row within the first 5 non-empty rows
  let headerRowIdx = -1;
  let colMap = {
    nomor: -1,
    nama: -1,
    kelas: -1,
    jk: -1,
    username: -1,
    password: -1,
  };

  for (let r = 0; r < Math.min(5, rawMatrix.length); r += 1) {
    const row = rawMatrix[r] || [];
    const keys = row.map(normKey);
    const hasNama = keys.some((k) =>
      ['nama', 'namalengkap', 'namasiswa', 'namapeserta', 'studentname'].includes(k)
    );
    const hasNomor = keys.some((k) =>
      ['nomorpeserta', 'nopeserta', 'nomor', 'nisn', 'nis', 'idpeserta', 'nopst'].includes(k)
    );
    if (hasNama || hasNomor) {
      headerRowIdx = r;
      keys.forEach((k, idx) => {
        if (
          colMap.nomor === -1 &&
          ['nomorpeserta', 'nopeserta', 'nomor', 'nisn', 'nis', 'idpeserta', 'nopst'].includes(k)
        ) {
          colMap.nomor = idx;
        } else if (
          colMap.nama === -1 &&
          ['namalengkap', 'namasiswa', 'namapeserta', 'nama', 'studentname'].includes(k)
        ) {
          colMap.nama = idx;
        } else if (colMap.kelas === -1 && ['kelas', 'rombel', 'namakelas', 'class'].includes(k)) {
          colMap.kelas = idx;
        } else if (
          colMap.jk === -1 &&
          ['lp', 'jeniskelamin', 'jk', 'kelamin', 'gender'].includes(k)
        ) {
          colMap.jk = idx;
        } else if (colMap.username === -1 && ['username', 'user', 'akun'].includes(k)) {
          colMap.username = idx;
        } else if (
          colMap.password === -1 &&
          ['password', 'katasandi', 'sandi', 'pass', 'pin'].includes(k)
        ) {
          colMap.password = idx;
        }
      });
      break;
    }
  }

  // Positional fallback when no header row is found
  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  if (headerRowIdx === -1) {
    colMap = {
      nomor: 0,
      nama: 1,
      kelas: -1,
      jk: 2,
      username: -1,
      password: 3,
    };
  }

  const existingNumbers = new Set(
    existingStudents.map((s) => s.nomorPeserta.trim().toLowerCase())
  );
  const existingUsernames = new Set(
    existingStudents.map((s) => s.username.trim().toLowerCase())
  );
  const seenInFile = new Set<string>();

  const rows: ParsedStudentRow[] = [];
  const baseTime = Date.now();

  for (let r = startRow; r < rawMatrix.length; r += 1) {
    const row = rawMatrix[r] || [];
    const nonEmpty = row.some((cell) => String(cell ?? '').trim() !== '');
    if (!nonEmpty) continue;

    const nama =
      colMap.nama >= 0 ? String(row[colMap.nama] ?? '').trim() : String(row[1] ?? '').trim();
    if (!nama) continue;

    const rawNomor =
      colMap.nomor >= 0 ? String(row[colMap.nomor] ?? '').trim() : String(row[0] ?? '').trim();
    const nomorPeserta =
      rawNomor || `2606${String(existingStudents.length + rows.length + 1).padStart(3, '0')}`;

    const rawUsername =
      colMap.username >= 0 ? String(row[colMap.username] ?? '').trim() : '';
    const username = rawUsername || nomorPeserta;

    const rawPassword =
      colMap.password >= 0 ? String(row[colMap.password] ?? '').trim() : '';
    const password = rawPassword || '123';

    const rawKelas = colMap.kelas >= 0 ? String(row[colMap.kelas] ?? '').trim() : '';
    const { classId, className, usedFallback } = findClassId(rawKelas, classes, fallbackClassId);

    const jk = colMap.jk >= 0 ? normalizeGender(row[colMap.jk]) : 'L';

    const normNomor = nomorPeserta.toLowerCase();
    const normUser = username.toLowerCase();
    const isDuplicate =
      existingNumbers.has(normNomor) ||
      existingUsernames.has(normUser) ||
      seenInFile.has(normNomor);

    seenInFile.add(normNomor);

    rows.push({
      student: {
        id: `STD-${baseTime}-${rows.length}`,
        nomorPeserta,
        username,
        password,
        nama,
        kelasId: classId,
        jenisKelamin: jk,
      },
      matchedClassName: className,
      usedFallbackClass: usedFallback,
      isDuplicate,
    });
  }

  if (rows.length === 0) {
    throw new Error(
      'Tidak ada baris data siswa yang valid di file ini. Pastikan terdapat kolom "Nama Lengkap" dan "Nomor Peserta".'
    );
  }

  return { rows, sheetName };
}

export function downloadStudentExcelTemplate(classes: ClassGroup[]) {
  const defaultClass = classes[0]?.namaKelas || 'VI-A';
  const sampleRows = [
    {
      'Nomor Peserta': '2606001',
      'Nama Lengkap': 'Ahmad Fauzan',
      Kelas: defaultClass,
      'L/P': 'L',
      Username: '2606001',
      Password: '123',
    },
    {
      'Nomor Peserta': '2606002',
      'Nama Lengkap': 'Siti Aisyah',
      Kelas: defaultClass,
      'L/P': 'P',
      Username: '2606002',
      Password: '123',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  worksheet['!cols'] = [
    { wch: 16 },
    { wch: 28 },
    { wch: 12 },
    { wch: 8 },
    { wch: 16 },
    { wch: 14 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Peserta TKA');
  XLSX.writeFile(workbook, 'template-peserta-tka.xlsx');
}

export function exportStudentsToExcel(students: Student[], classes: ClassGroup[]) {
  const classMap = new Map(classes.map((c) => [c.id, c.namaKelas]));
  const rows = students.map((s) => ({
    'Nomor Peserta': s.nomorPeserta,
    'Nama Lengkap': s.nama,
    Kelas: classMap.get(s.kelasId) || '-',
    'L/P': s.jenisKelamin,
    Username: s.username,
    Password: s.password,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 16 },
    { wch: 28 },
    { wch: 14 },
    { wch: 8 },
    { wch: 16 },
    { wch: 14 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Peserta');
  XLSX.writeFile(workbook, 'data-peserta-tka.xlsx');
}

import { GoogleGenAI, ThinkingLevel, Type, type Schema } from '@google/genai';
import mammoth from 'mammoth';
import { extractText } from 'unpdf';
import type { JenisSoal, MataUji, Question, TingkatKesulitan } from '../src/types.ts';

export interface ParseDocumentInput {
  fileName: string;
  mimeType: string;
  fileBase64: string;
  defaultMataUji: MataUji | 'AUTO';
  mode: 'ai' | 'pattern';
  autoSolveMissingKeys?: boolean;
}

interface RawParsedQuestion {
  mataUji?: string;
  materi?: string;
  kompetensi?: string;
  indikator?: string;
  tingkatKesulitan?: string;
  jenisSoal?: string;
  stimulusJudul?: string;
  stimulusIsi?: string;
  pertanyaan?: string;
  pilihan?: { key: string; text: string }[];
  kunciPG?: string;
  kunciPGK?: string[];
  pernyataanBS?: { text: string; answer: boolean }[];
  pasanganJodoh?: { left: string; right: string }[];
  kunciIsian?: string[];
  pembahasan?: string;
  bobot?: number;
  kunciDariAI?: boolean;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY belum tersedia di environment server. Tambahkan key di Settings > Secrets atau pilih Mode Format Pola Standar (Offline).'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown): string {
  const rawMsg = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(rawMsg) as {
      error?: { code?: number; message?: string; status?: string };
    };
    if (parsed?.error?.code === 503 || parsed?.error?.status === 'UNAVAILABLE') {
      return 'Layanan AI pembaca dokumen sedang padat (503). Silakan klik ulang beberapa detik lagi.';
    }
    if (parsed?.error?.code === 429) {
      return 'Batas permintaan layanan AI tercapai sementara (429). Tunggu sejenak lalu coba kembali.';
    }
    if (parsed?.error?.code === 403 || parsed?.error?.code === 400) {
      return `Permintaan AI ditolak (${parsed.error.code}): ${parsed.error.message || 'Periksa konfigurasi API key di Settings > Secrets.'}`;
    }
    if (parsed?.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // not JSON
  }
  if (/deadline|timed out|timeout/i.test(rawMsg)) {
    return 'Waktu tunggu layanan AI habis saat memproses dokumen. Coba bagi dokumen menjadi beberapa bagian atau klik ulang.';
  }
  return rawMsg;
}

async function generateWithRetryFallback<T>(
  ai: GoogleGenAI,
  buildRequest: (model: string, thinkingLevel: ThinkingLevel, timeoutMs: number) => Promise<T>
): Promise<T> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const attempts: {
    model: string;
    thinkingLevel: ThinkingLevel;
    timeoutMs: number;
    delayAfterFailMs: number;
  }[] = [
    {
      model: 'gemini-4-hydrogen',
      thinkingLevel: ThinkingLevel.MEDIUM,
      timeoutMs: 22000,
      delayAfterFailMs: 600,
    },
    {
      model: 'gemini-3.1-flash-lite',
      thinkingLevel: ThinkingLevel.LOW,
      timeoutMs: 24000,
      delayAfterFailMs: 900,
    },
    {
      model: 'gemini-4-hydrogen',
      thinkingLevel: ThinkingLevel.LOW,
      timeoutMs: 25000,
      delayAfterFailMs: 0,
    },
  ];

  let lastErr: unknown;
  for (let i = 0; i < attempts.length; i += 1) {
    const { model, thinkingLevel, timeoutMs, delayAfterFailMs } = attempts[i];
    try {
      return await buildRequest(model, thinkingLevel, timeoutMs);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        /503|504|502|429|unavailable|timeout|deadline|abort|overloaded|timed out/i.test(
          msg
        );
      if (!isTransient || i === attempts.length - 1) {
        throw new Error(formatGeminiError(err));
      }
      if (delayAfterFailMs > 0) {
        await sleep(delayAfterFailMs);
      }
    }
  }
  throw new Error(formatGeminiError(lastErr));
}

function hasValidKeyOnRaw(raw: RawParsedQuestion, jenisSoal: JenisSoal, optionKeys: string[]): boolean {
  if (jenisSoal === 'PG') {
    const key = (raw.kunciPG || '').trim().toUpperCase().slice(0, 1);
    return Boolean(key) && (optionKeys.length === 0 || optionKeys.includes(key));
  }
  if (jenisSoal === 'PGK') {
    const keys = (raw.kunciPGK || [])
      .map((k) => k.trim().toUpperCase().slice(0, 1))
      .filter((k) => Boolean(k) && (optionKeys.length === 0 || optionKeys.includes(k)));
    return keys.length > 0;
  }
  if (jenisSoal === 'BS') {
    return (
      Array.isArray(raw.pernyataanBS) &&
      raw.pernyataanBS.length > 0 &&
      raw.pernyataanBS.every((s) => typeof s.answer === 'boolean' && Boolean(s.text?.trim()))
    );
  }
  if (jenisSoal === 'MENJODOHKAN') {
    return (
      Array.isArray(raw.pasanganJodoh) &&
      raw.pasanganJodoh.length > 0 &&
      raw.pasanganJodoh.every((p) => Boolean(p.left?.trim()) && Boolean(p.right?.trim()))
    );
  }
  if (jenisSoal === 'ISIAN') {
    return (
      Array.isArray(raw.kunciIsian) &&
      raw.kunciIsian.some((k) => Boolean(k && k.trim()))
    );
  }
  return false;
}

function normalizeQuestion(
  raw: RawParsedQuestion,
  idx: number,
  defaultMataUji: MataUji | 'AUTO'
): { question: Question; hasValidKey: boolean; aiSolved: boolean } {
  const mataUji: MataUji =
    raw.mataUji === 'Bahasa Indonesia' ||
    (raw.mataUji && raw.mataUji.toLowerCase().includes('indo'))
      ? 'Bahasa Indonesia'
      : raw.mataUji === 'Matematika' ||
          (raw.mataUji && raw.mataUji.toLowerCase().includes('mat'))
        ? 'Matematika'
        : defaultMataUji === 'Bahasa Indonesia'
          ? 'Bahasa Indonesia'
          : 'Matematika';

  const jenisRaw = (raw.jenisSoal || 'PG').toUpperCase().trim();
  const jenisSoal: JenisSoal =
    jenisRaw === 'PGK' ||
    jenisRaw === 'BS' ||
    jenisRaw === 'MENJODOHKAN' ||
    jenisRaw === 'ISIAN'
      ? jenisRaw
      : 'PG';

  const levelRaw = (raw.tingkatKesulitan || 'Sedang').trim();
  const tingkatKesulitan: TingkatKesulitan =
    levelRaw === 'Mudah' || levelRaw === 'Sulit' ? levelRaw : 'Sedang';

  const prefix = mataUji === 'Matematika' ? 'MTK' : 'IND';
  const id = `${prefix}-IMP-${Date.now().toString().slice(-4)}${String(idx + 1).padStart(2, '0')}`;

  const q: Question = {
    id,
    mataUji,
    materi: (raw.materi || 'Umum').trim(),
    kompetensi: (raw.kompetensi || raw.materi || 'Literasi & Numerasi').trim(),
    indikator: (raw.indikator || 'Impor dokumen soal').trim(),
    tingkatKesulitan,
    jenisSoal,
    pertanyaan: (raw.pertanyaan || '').trim(),
    bobot: Number(raw.bobot) > 0 ? Number(raw.bobot) : 5,
    pembahasan: (raw.pembahasan || '').trim(),
    createdAt: new Date().toISOString(),
  };

  if (raw.stimulusIsi && raw.stimulusIsi.trim()) {
    q.stimulus = {
      type: 'bacaan',
      title: raw.stimulusJudul?.trim() || 'Bacaan / Stimulus',
      content: raw.stimulusIsi.trim(),
    };
  } else {
    q.stimulus = { type: 'none' };
  }

  let optionKeys: string[] = [];
  if (jenisSoal === 'PG' || jenisSoal === 'PGK') {
    const cleanOptions = (raw.pilihan || [])
      .filter((o) => o && o.text && o.text.trim())
      .map((o, oIdx) => ({
        key: (o.key || String.fromCharCode(65 + oIdx)).trim().toUpperCase().slice(0, 1),
        text: o.text.trim(),
      }));
    q.pilihan =
      cleanOptions.length > 0
        ? cleanOptions
        : [
            { key: 'A', text: 'Pilihan A' },
            { key: 'B', text: 'Pilihan B' },
            { key: 'C', text: 'Pilihan C' },
            { key: 'D', text: 'Pilihan D' },
          ];
    optionKeys = q.pilihan.map((o) => o.key);
  }

  const validKey = hasValidKeyOnRaw(raw, jenisSoal, optionKeys);

  if (jenisSoal === 'PG') {
    const rawKey = (raw.kunciPG || '').trim().toUpperCase().slice(0, 1);
    q.kunciPG = optionKeys.includes(rawKey) ? rawKey : optionKeys[0] || 'A';
  } else if (jenisSoal === 'PGK') {
    const cleanKeys = (raw.kunciPGK || [])
      .map((k) => k.trim().toUpperCase().slice(0, 1))
      .filter((k) => optionKeys.includes(k));
    q.kunciPGK = cleanKeys.length > 0 ? cleanKeys : [optionKeys[0] || 'A'];
    q.metodeNilaiPGK = 'partial';
  } else if (jenisSoal === 'BS') {
    q.pernyataanBS = (raw.pernyataanBS || []).map((st, sIdx) => ({
      id: `bs${sIdx + 1}`,
      text: (st.text || '').trim(),
      answer: Boolean(st.answer),
    }));
  } else if (jenisSoal === 'MENJODOHKAN') {
    q.pasanganJodoh = (raw.pasanganJodoh || []).map((p, pIdx) => ({
      id: `m${pIdx + 1}`,
      left: (p.left || '').trim(),
      right: (p.right || '').trim(),
    }));
  } else if (jenisSoal === 'ISIAN') {
    q.kunciIsian =
      raw.kunciIsian && raw.kunciIsian.length > 0
        ? raw.kunciIsian.map((k) => k.trim()).filter(Boolean)
        : [''];
  }

  return {
    question: q,
    hasValidKey: validKey,
    aiSolved: Boolean(raw.kunciDariAI) && validKey,
  };
}

function parsePatternText(
  rawText: string,
  defaultMataUji: MataUji | 'AUTO'
): { questions: Question[]; missingKeyIds: string[] } {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(?:soal\s*)?\d{1,3}[\.\)]\s+\S+/i.test(trimmed)) {
      if (current.length > 0) {
        blocks.push(current.join('\n'));
      }
      current = [trimmed.replace(/^(?:soal\s*)?\d{1,3}[\.\)]\s+/i, '')];
    } else if (current.length > 0 || trimmed.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) {
    blocks.push(current.join('\n'));
  }

  const parsed: Question[] = [];
  const missingKeyIds: string[] = [];

  blocks.forEach((block, idx) => {
    const bLines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (bLines.length === 0) return;

    const options: { key: string; text: string }[] = [];
    const questionLines: string[] = [];
    let stimulusText = '';
    let materi = 'Umum';
    let kesulitan = 'Sedang';
    let kunciRaw = '';
    let pembahasan = '';
    let jenisSoal: JenisSoal = 'PG';

    for (const ln of bLines) {
      const optMatch = ln.match(/^([A-Ea-e])[\.\)]\s+(.+)$/);
      if (optMatch) {
        options.push({ key: optMatch[1].toUpperCase(), text: optMatch[2].trim() });
        continue;
      }

      const keyMatch = ln.match(/^(?:kunci(?:\s*jawaban)?|jawaban)\s*[:=]\s*(.+)$/i);
      if (keyMatch) {
        kunciRaw = keyMatch[1].trim();
        continue;
      }

      const pembahasanMatch = ln.match(/^pembahasan\s*[:=]\s*(.+)$/i);
      if (pembahasanMatch) {
        pembahasan = pembahasanMatch[1].trim();
        continue;
      }

      const materiMatch = ln.match(/^materi\s*[:=]\s*(.+)$/i);
      if (materiMatch) {
        materi = materiMatch[1].trim();
        continue;
      }

      const levelMatch = ln.match(/^(?:kesulitan|tingkat)\s*[:=]\s*(.+)$/i);
      if (levelMatch) {
        kesulitan = levelMatch[1].trim();
        continue;
      }

      const stimMatch = ln.match(/^(?:stimulus|bacaan)\s*[:=]\s*(.+)$/i);
      if (stimMatch) {
        stimulusText = stimMatch[1].trim();
        continue;
      }

      const typeMatch = ln.match(/^jenis\s*[:=]\s*(.+)$/i);
      if (typeMatch) {
        const val = typeMatch[1].trim().toUpperCase();
        if (val.includes('PGK') || val.includes('KOMPLEKS')) jenisSoal = 'PGK';
        else if (val.includes('ISIAN')) jenisSoal = 'ISIAN';
        continue;
      }

      questionLines.push(ln);
    }

    const questionBody = questionLines.join('\n').trim();
    if (!questionBody) return;

    if (options.length === 0) {
      jenisSoal = 'ISIAN';
    } else if (kunciRaw.includes(',')) {
      jenisSoal = 'PGK';
    }

    const kunciClean = kunciRaw.toUpperCase().replace(/[^A-E,]/g, '');
    const kunciPGK = kunciClean
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const { question, hasValidKey } = normalizeQuestion(
      {
        materi,
        tingkatKesulitan: kesulitan,
        jenisSoal,
        stimulusIsi: stimulusText,
        pertanyaan: questionBody,
        pilihan: options,
        kunciPG: kunciPGK[0] || '',
        kunciPGK: kunciPGK.length > 0 ? kunciPGK : [],
        kunciIsian: kunciRaw ? kunciRaw.split(',').map((s) => s.trim()).filter(Boolean) : [],
        pembahasan,
      },
      idx,
      defaultMataUji
    );

    parsed.push(question);
    if (!hasValidKey) {
      missingKeyIds.push(question.id);
    }
  });

  return { questions: parsed, missingKeyIds };
}

interface SolvedKeyItem {
  id: string;
  mataUji?: string;
  materi?: string;
  pembahasan: string;
  kunciPG?: string;
  kunciPGK?: string[];
  pernyataanBS?: { text: string; answer: boolean }[];
  pasanganJodoh?: { left: string; right: string }[];
  kunciIsian?: string[];
}

export async function solveQuestionKeysWithAI(
  questions: Question[]
): Promise<{ questions: Question[]; solvedIds: string[] }> {
  if (!questions || questions.length === 0) {
    return { questions: [], solvedIds: [] };
  }

  const ai = getGeminiClient();

  const solveSchema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        mataUji: { type: Type.STRING },
        materi: { type: Type.STRING },
        pembahasan: { type: Type.STRING },
        kunciPG: { type: Type.STRING },
        kunciPGK: { type: Type.ARRAY, items: { type: Type.STRING } },
        pernyataanBS: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              answer: { type: Type.BOOLEAN },
            },
          },
        },
        pasanganJodoh: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              left: { type: Type.STRING },
              right: { type: Type.STRING },
            },
          },
        },
        kunciIsian: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['id', 'pembahasan'],
    },
  };

  // Process in batches of up to 10 questions so solving stays fast & accurate
  const batchSize = 10;
  const batches: Question[][] = [];
  for (let i = 0; i < questions.length; i += batchSize) {
    batches.push(questions.slice(i, i + batchSize));
  }

  const solvedMap = new Map<string, SolvedKeyItem>();

  await Promise.all(
    batches.map(async (batch) => {
      const payload = batch.map((q) => ({
        id: q.id,
        mataUji: q.mataUji,
        jenisSoal: q.jenisSoal,
        stimulus: q.stimulus?.content || '',
        pertanyaan: q.pertanyaan,
        pilihan: q.pilihan,
        pernyataanBS: q.pernyataanBS?.map((p) => p.text),
        pasanganJodoh: q.pasanganJodoh,
      }));

      const prompt = `Selesaikan setiap butir soal ujian SD/MI Kelas VI berikut secara teliti dan akurat!
LANGKAH WAJIB UNTUK SETIAP SOAL:
1. Baca stimulus, pertanyaan, dan pilihan jawaban dengan saksama.
2. Lakukan perhitungan matematika atau analisis teks langkah demi langkah terlebih dahulu di field "pembahasan".
3. Cocokkan hasil akhir di "pembahasan" dengan kunci jawaban yang tepat:
   - Untuk PG: isi "kunciPG" dengan 1 huruf ("A"/"B"/"C"/"D"/"E") yang teks pilihannya 100% sesuai hasil pembahasan.
   - Untuk PGK: isi "kunciPGK" dengan array seluruh huruf jawaban yang benar.
   - Untuk BS: isi "pernyataanBS" untuk setiap pernyataan dengan boolean "answer" (true=Benar, false=Salah).
   - Untuk MENJODOHKAN: pasangkan "left" dan "right" yang tepat di "pasanganJodoh".
   - Untuk ISIAN: isi "kunciIsian" dengan jawaban singkat paling tepat serta variasi ejaan/satuan yang setara.
4. Isi "materi" dengan topik materi singkat yang sesuai soal.

DAFTAR SOAL:
${JSON.stringify(payload)}`;

      const rawSolved = await generateWithRetryFallback(
        ai,
        async (model, thinkingLevel, timeoutMs) => {
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction:
                'Anda adalah guru ahli dan validator kunci jawaban TKA SD/MI Kelas VI. Kerjakan hitungan dan analisis bacaan secara cermat sebelum menentukan kunci jawaban akhir. Keluarkan JSON valid saja.',
              thinkingConfig: { thinkingLevel },
              responseMimeType: 'application/json',
              responseSchema: solveSchema,
              httpOptions: { timeout: timeoutMs },
            },
          });
          const text = (response.text ?? '[]').trim();
          return JSON.parse(text) as SolvedKeyItem[];
        }
      );

      if (Array.isArray(rawSolved)) {
        rawSolved.forEach((item) => {
          if (item && item.id) {
            solvedMap.set(item.id, item);
          }
        });
      }
    })
  );

  const solvedIds: string[] = [];
  const updated = questions.map((q) => {
    const ans = solvedMap.get(q.id);
    if (!ans) return q;

    const next: Question = {
      ...q,
      pembahasan: ans.pembahasan?.trim() || q.pembahasan,
      materi:
        q.materi && q.materi !== 'Umum'
          ? q.materi
          : ans.materi?.trim() || q.materi,
      mataUji:
        ans.mataUji === 'Bahasa Indonesia' ||
        ans.mataUji?.toLowerCase().includes('indo')
          ? 'Bahasa Indonesia'
          : ans.mataUji === 'Matematika' ||
              ans.mataUji?.toLowerCase().includes('mat')
            ? 'Matematika'
            : q.mataUji,
    };

    const optKeys = (q.pilihan || []).map((o) => o.key);
    let applied = false;

    if (q.jenisSoal === 'PG' && ans.kunciPG) {
      const k = ans.kunciPG.trim().toUpperCase().slice(0, 1);
      if (optKeys.length === 0 || optKeys.includes(k)) {
        next.kunciPG = k;
        applied = true;
      }
    } else if (q.jenisSoal === 'PGK' && Array.isArray(ans.kunciPGK)) {
      const ks = ans.kunciPGK
        .map((x) => x.trim().toUpperCase().slice(0, 1))
        .filter((x) => optKeys.length === 0 || optKeys.includes(x));
      if (ks.length > 0) {
        next.kunciPGK = ks;
        applied = true;
      }
    } else if (q.jenisSoal === 'BS' && Array.isArray(ans.pernyataanBS) && ans.pernyataanBS.length > 0) {
      next.pernyataanBS = ans.pernyataanBS.map((st, idx) => ({
        id: q.pernyataanBS?.[idx]?.id || `bs${idx + 1}`,
        text: st.text?.trim() || q.pernyataanBS?.[idx]?.text || '',
        answer: Boolean(st.answer),
      }));
      applied = true;
    } else if (
      q.jenisSoal === 'MENJODOHKAN' &&
      Array.isArray(ans.pasanganJodoh) &&
      ans.pasanganJodoh.length > 0
    ) {
      next.pasanganJodoh = ans.pasanganJodoh.map((p, idx) => ({
        id: q.pasanganJodoh?.[idx]?.id || `m${idx + 1}`,
        left: p.left?.trim() || '',
        right: p.right?.trim() || '',
      }));
      applied = true;
    } else if (q.jenisSoal === 'ISIAN' && Array.isArray(ans.kunciIsian)) {
      const ks = ans.kunciIsian.map((k) => k.trim()).filter(Boolean);
      if (ks.length > 0) {
        next.kunciIsian = ks;
        applied = true;
      }
    }

    if (applied) {
      solvedIds.push(q.id);
    }
    return next;
  });

  return { questions: updated, solvedIds };
}

async function extractTextFromBuffer(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ text: string; isPdf: boolean }> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.docx') || mimeType.includes('wordprocessingml')) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value || '', isPdf: false };
  }
  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') {
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
    return { text: text || '', isPdf: true };
  }
  return { text: buffer.toString('utf-8'), isPdf: false };
}

export async function parseQuestionsFromDocument(
  input: ParseDocumentInput
): Promise<{
  questions: Question[];
  extractedPreviewText: string;
  aiSolvedIds: string[];
  missingKeyIds: string[];
}> {
  const buffer = Buffer.from(input.fileBase64, 'base64');
  const lower = input.fileName.toLowerCase();

  if (lower.endsWith('.doc') && !lower.endsWith('.docx')) {
    throw new Error(
      'Format .doc lawas (Word 97-2003) tidak didukung langsung. Silakan simpan dokumen sebagai .docx atau .pdf terlebih dahulu.'
    );
  }

  let extractedText = '';
  const isPdf = lower.endsWith('.pdf') || input.mimeType === 'application/pdf';

  if (isPdf && input.mode === 'ai') {
    try {
      const extracted = await extractTextFromBuffer(buffer, input.fileName, input.mimeType);
      extractedText = extracted.text;
    } catch {
      extractedText = '';
    }
  } else {
    const extracted = await extractTextFromBuffer(buffer, input.fileName, input.mimeType);
    extractedText = extracted.text;
  }

  const autoSolve = input.autoSolveMissingKeys !== false;

  if (input.mode === 'pattern') {
    if (!extractedText.trim()) {
      throw new Error(
        'Teks tidak dapat dibaca dari dokumen (kemungkinan PDF hasil scan gambar). Gunakan Mode Ekstraksi Cerdas AI untuk membaca dokumen PDF scan.'
      );
    }
    const patternRes = parsePatternText(extractedText, input.defaultMataUji);
    if (patternRes.questions.length === 0) {
      throw new Error(
        'Tidak ditemukan butir soal berformat standar (contoh: 1. Pertanyaan ... A. ... B. ... Kunci: A). Coba gunakan Mode Ekstraksi Cerdas AI atau sesuaikan format dokumen.'
      );
    }

    let finalQuestions = patternRes.questions;
    let aiSolvedIds: string[] = [];
    let missingKeyIds = patternRes.missingKeyIds;

    if (autoSolve && missingKeyIds.length > 0 && process.env.GEMINI_API_KEY) {
      try {
        const missingSet = new Set(missingKeyIds);
        const needSolve = finalQuestions.filter((q) => missingSet.has(q.id));
        const solvedRes = await solveQuestionKeysWithAI(needSolve);
        const solvedMap = new Map(solvedRes.questions.map((q) => [q.id, q]));
        finalQuestions = finalQuestions.map((q) => solvedMap.get(q.id) || q);
        aiSolvedIds = solvedRes.solvedIds;
        const solvedSet = new Set(aiSolvedIds);
        missingKeyIds = missingKeyIds.filter((id) => !solvedSet.has(id));
      } catch {
        // Keep pattern extraction results even if optional AI solving fails
      }
    }

    return {
      questions: finalQuestions,
      extractedPreviewText: extractedText.slice(0, 600),
      aiSolvedIds,
      missingKeyIds,
    };
  }

  // AI Mode using @google/genai server-side
  const ai = getGeminiClient();

  const instructionPrompt = `Anda adalah tim ahli pembuat dan validator soal resmi TKA SD/MI Kelas VI di Indonesia.
Ekstrak SELURUH butir soal ujian dari dokumen terlampir ke dalam array JSON terstruktur.

ATURAN EKSTRAKSI & PENENTUAN KUNCI JAWABAN AKURAT:
1. Mata Uji default: "${input.defaultMataUji === 'AUTO' ? 'deteksi otomatis antara Matematika atau Bahasa Indonesia per soal' : input.defaultMataUji}".
2. Deteksi jenisSoal secara tepat:
   - "PG": Pilihan Ganda tunggal (A, B, C, D, atau E)
   - "PGK": Pilihan Ganda Kompleks (memilih lebih dari satu jawaban benar)
   - "BS": Benar atau Salah (daftar pernyataan dengan nilai boolean true/false)
   - "MENJODOHKAN": Menjodohkan pasangan kiri dan kanan
   - "ISIAN": Isian singkat tanpa pilihan ganda
3. Jika soal memiliki bacaan, teks, dialog, pengumuman, atau data tabel sebelum pertanyaan, masukkan secara lengkap ke "stimulusJudul" dan "stimulusIsi".
4. PENTING — KUNCI JAWABAN & PEMBAHASAN AKURAT:
   - Jika dokumen SUDAH memiliki kunci jawaban (di dekat soal atau di halaman kunci akhir), pasangkan dengan tepat dan set "kunciDariAI": false.
   - Jika soal di dokumen BELUM ADA KUNCI JAWABAN, Anda WAJIB menyelesaikannya secara teliti & akurat:
     a) Tuliskan langkah perhitungan matematika atau analisis bacaan di field "pembahasan" TERLEBIH DAHULU.
     b) Cocokkan hasil akhir dari "pembahasan" dengan opsi/jawaban yang benar, lalu isi "kunciPG" / "kunciPGK" / "pernyataanBS" / "pasanganJodoh" / "kunciIsian" dengan tepat (set "kunciDariAI": true).
     c) JANGAN menebak huruf A secara asal! Pastikan huruf "kunciPG" benar-benar sesuai dengan teks opsi di "pilihan".
5. Isi "materi" dengan nama materi spesifik soal tersebut (misal: "Operasi Hitung Pecahan", "Ide Pokok Paragraf", "Volume Kubus & Balok") dan gunakan bahasa Indonesia yang rapi.`;

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (isPdf) {
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: input.fileBase64,
      },
    });
    parts.push({ text: instructionPrompt });
  } else {
    if (!extractedText.trim()) {
      throw new Error('Dokumen Word kosong atau tidak berisi teks yang dapat diekstrak.');
    }
    parts.push({
      text: `${instructionPrompt}\n\nISI DOKUMEN WORD:\n${extractedText}`,
    });
  }

  const extractSchema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        mataUji: { type: Type.STRING },
        materi: { type: Type.STRING },
        kompetensi: { type: Type.STRING },
        indikator: { type: Type.STRING },
        tingkatKesulitan: { type: Type.STRING },
        jenisSoal: { type: Type.STRING },
        stimulusJudul: { type: Type.STRING },
        stimulusIsi: { type: Type.STRING },
        pertanyaan: { type: Type.STRING },
        pilihan: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              key: { type: Type.STRING },
              text: { type: Type.STRING },
            },
          },
        },
        pembahasan: { type: Type.STRING },
        kunciPG: { type: Type.STRING },
        kunciPGK: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        pernyataanBS: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              answer: { type: Type.BOOLEAN },
            },
          },
        },
        pasanganJodoh: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              left: { type: Type.STRING },
              right: { type: Type.STRING },
            },
          },
        },
        kunciIsian: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        kunciDariAI: { type: Type.BOOLEAN },
        bobot: { type: Type.NUMBER },
      },
      required: ['pertanyaan', 'jenisSoal', 'pembahasan'],
    },
  };

  const rawList = await generateWithRetryFallback(
    ai,
    async (model, thinkingLevel, timeoutMs) => {
      const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: {
          systemInstruction:
            'Anda adalah pengekstrak dokumen soal dan penyusun kunci jawaban TKA SD/MI yang sangat teliti. Hitung dan verifikasi jawaban pada pembahasan sebelum mengisi kunci jawaban. Keluarkan JSON valid saja.',
          thinkingConfig: { thinkingLevel },
          responseMimeType: 'application/json',
          responseSchema: extractSchema,
          httpOptions: { timeout: timeoutMs },
        },
      });
      const jsonText = (response.text ?? '[]').trim();
      return JSON.parse(jsonText) as RawParsedQuestion[];
    }
  );

  if (!Array.isArray(rawList) || rawList.length === 0) {
    throw new Error('Tidak ada butir soal yang berhasil diekstrak dari dokumen ini.');
  }

  const normalizedResults = rawList
    .filter((r) => r && r.pertanyaan && r.pertanyaan.trim().length > 0)
    .map((r, idx) => normalizeQuestion(r, idx, input.defaultMataUji));

  let questions = normalizedResults.map((r) => r.question);
  const aiSolvedSet = new Set(
    normalizedResults.filter((r) => r.aiSolved).map((r) => r.question.id)
  );
  const stillMissing = normalizedResults
    .filter((r) => !r.hasValidKey)
    .map((r) => r.question);

  // Second verification pass ONLY for any questions where AI missed a valid key
  if (autoSolve && stillMissing.length > 0) {
    try {
      const solved = await solveQuestionKeysWithAI(stillMissing);
      const solvedMap = new Map(solved.questions.map((q) => [q.id, q]));
      questions = questions.map((q) => solvedMap.get(q.id) || q);
      solved.solvedIds.forEach((id) => aiSolvedSet.add(id));
    } catch {
      // Keep extracted questions even if second pass encounters transient error
    }
  }

  const remainingMissing = stillMissing
    .filter((q) => !aiSolvedSet.has(q.id))
    .map((q) => q.id);

  return {
    questions,
    extractedPreviewText: extractedText.slice(0, 600),
    aiSolvedIds: Array.from(aiSolvedSet),
    missingKeyIds: remainingMissing,
  };
}

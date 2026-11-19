import { GoogleGenAI, ThinkingLevel, Type, type Schema } from '@google/genai';
import { TKA_KISI_KISI_CATALOG, type KisiKisiItem } from '../src/data/kisiKisiTka.ts';
import type {
  JenisSoal,
  MataUji,
  Question,
  StimulusData,
  TingkatKesulitan,
} from '../src/types.ts';

export interface GenerateQuestionsInput {
  mataUji: MataUji;
  kisiKisiTopic: string;
  materiKhusus?: string;
  jenisSoal: JenisSoal | 'CAMPURAN_TKA';
  tingkatKesulitan: TingkatKesulitan | 'CAMPURAN';
  jumlahSoal: number;
  konteksTema?: string;
}

const TKA_KISI_KISI = TKA_KISI_KISI_CATALOG;

interface RawGeneratedQuestion {
  mataUji?: string;
  materi?: string;
  kompetensi?: string;
  indikator?: string;
  tingkatKesulitan?: string;
  jenisSoal?: string;
  stimulusType?: string;
  stimulusJudul?: string;
  stimulusIsi?: string;
  tableHeaders?: string[];
  tableRows?: string[][];
  chartData?: { label: string; value: number; unit?: string }[];
  pertanyaan?: string;
  pilihan?: { key: string; text: string }[];
  kunciPG?: string;
  kunciPGK?: string[];
  pernyataanBS?: { text: string; answer: boolean }[];
  pasanganJodoh?: { left: string; right: string }[];
  kunciIsian?: string[];
  pembahasan?: string;
  bobot?: number;
}

function resolveRequestedMateri(
  rawMateri: string | undefined,
  selectedKisi: KisiKisiItem,
  materiKhusus?: string
): string {
  const explicit = materiKhusus?.trim();
  if (explicit) {
    return explicit;
  }
  const isAllCatalog =
    selectedKisi.id === 'ALL_MTK' || selectedKisi.id === 'ALL_IND';
  if (!isAllCatalog) {
    // Keep specific Kisi-Kisi materi if AI returned something generic or drifted
    const cleaned = (rawMateri || '').trim();
    if (
      !cleaned ||
      cleaned.toLowerCase() === 'kisi-kisi tka' ||
      cleaned.toLowerCase() === 'umum' ||
      cleaned.length < 4
    ) {
      return selectedKisi.materiUtama;
    }
    return cleaned;
  }
  return (rawMateri || '').trim() || selectedKisi.materiUtama;
}

function normalizeGeneratedQuestion(
  raw: RawGeneratedQuestion,
  idx: number,
  input: GenerateQuestionsInput,
  selectedKisi: KisiKisiItem,
  batchStamp: string
): Question {
  const mataUji: MataUji =
    input.mataUji === 'Bahasa Indonesia' ? 'Bahasa Indonesia' : 'Matematika';

  let jenisSoal: JenisSoal;
  if (input.jenisSoal !== 'CAMPURAN_TKA') {
    jenisSoal = input.jenisSoal;
  } else {
    const jenisRaw = (raw.jenisSoal || 'PG').toUpperCase().trim();
    jenisSoal =
      jenisRaw === 'PGK' ||
      jenisRaw === 'BS' ||
      jenisRaw === 'MENJODOHKAN' ||
      jenisRaw === 'ISIAN'
        ? jenisRaw
        : 'PG';
  }

  let tingkatKesulitan: TingkatKesulitan;
  if (input.tingkatKesulitan !== 'CAMPURAN') {
    tingkatKesulitan = input.tingkatKesulitan;
  } else {
    const levelRaw = (raw.tingkatKesulitan || 'Sedang').trim();
    tingkatKesulitan =
      levelRaw === 'Mudah' || levelRaw === 'Sulit' ? levelRaw : 'Sedang';
  }

  const prefix = mataUji === 'Matematika' ? 'MTK' : 'IND';
  const id = `${prefix}-GEN-${batchStamp}${String(idx + 1).padStart(2, '0')}`;

  let stimulus: StimulusData = { type: 'none' };
  const stType = (raw.stimulusType || '').toLowerCase();

  if (
    stType === 'tabel' &&
    Array.isArray(raw.tableHeaders) &&
    raw.tableHeaders.length > 0 &&
    Array.isArray(raw.tableRows) &&
    raw.tableRows.length > 0
  ) {
    stimulus = {
      type: 'tabel',
      title: raw.stimulusJudul?.trim() || 'Tabel Data',
      tableHeaders: raw.tableHeaders,
      tableRows: raw.tableRows,
    };
  } else if (
    stType === 'diagram_batang' &&
    Array.isArray(raw.chartData) &&
    raw.chartData.length > 0
  ) {
    stimulus = {
      type: 'diagram_batang',
      title: raw.stimulusJudul?.trim() || 'Diagram Data',
      chartData: raw.chartData.map((d) => ({
        label: String(d.label || ''),
        value: Number(d.value) || 0,
        unit: d.unit || '',
      })),
    };
  } else if (raw.stimulusIsi && raw.stimulusIsi.trim().length > 0) {
    stimulus = {
      type: 'bacaan',
      title: raw.stimulusJudul?.trim() || 'Teks Stimulus',
      content: raw.stimulusIsi.trim(),
    };
  }

  const resolvedMateri = resolveRequestedMateri(
    raw.materi,
    selectedKisi,
    input.materiKhusus
  );

  const q: Question = {
    id,
    mataUji,
    materi: resolvedMateri,
    kompetensi: (raw.kompetensi || selectedKisi.elemen || 'Penalaran TKA SD/MI').trim(),
    indikator: (raw.indikator || `Menyelesaikan soal ${resolvedMateri}`).trim(),
    tingkatKesulitan,
    jenisSoal,
    stimulus,
    pertanyaan: (raw.pertanyaan || '').trim(),
    bobot: Number(raw.bobot) > 0 ? Number(raw.bobot) : 5,
    pembahasan: (raw.pembahasan || '').trim(),
    createdAt: new Date().toISOString(),
  };

  if (jenisSoal === 'PG' || jenisSoal === 'PGK') {
    const cleanOptions = (raw.pilihan || [])
      .filter((o) => o && o.text && o.text.trim())
      .map((o, oIdx) => ({
        key: (o.key || String.fromCharCode(65 + oIdx)).trim().toUpperCase().slice(0, 1),
        text: o.text.trim(),
      }));
    q.pilihan =
      cleanOptions.length >= 2
        ? cleanOptions
        : [
            { key: 'A', text: 'Pilihan A' },
            { key: 'B', text: 'Pilihan B' },
            { key: 'C', text: 'Pilihan C' },
            { key: 'D', text: 'Pilihan D' },
          ];
    if (jenisSoal === 'PG') {
      q.kunciPG = (raw.kunciPG || 'A').trim().toUpperCase().slice(0, 1);
    } else {
      const keys = (raw.kunciPGK || [])
        .map((k) => k.trim().toUpperCase().slice(0, 1))
        .filter(Boolean);
      q.kunciPGK = keys.length >= 2 ? keys : ['A', 'B'];
      q.metodeNilaiPGK = 'partial';
    }
  } else if (jenisSoal === 'BS') {
    q.pernyataanBS = (raw.pernyataanBS || [])
      .filter((s) => s && s.text && s.text.trim())
      .map((s, sIdx) => ({
        id: `bs${sIdx + 1}`,
        text: s.text.trim(),
        answer: Boolean(s.answer),
      }));
    if (!q.pernyataanBS || q.pernyataanBS.length === 0) {
      q.pernyataanBS = [
        { id: 'bs1', text: 'Pernyataan 1 sesuai isi soal.', answer: true },
        { id: 'bs2', text: 'Pernyataan 2 tidak sesuai isi soal.', answer: false },
      ];
    }
  } else if (jenisSoal === 'MENJODOHKAN') {
    q.pasanganJodoh = (raw.pasanganJodoh || [])
      .filter((p) => p && p.left && p.right)
      .map((p, pIdx) => ({
        id: `m${pIdx + 1}`,
        left: p.left.trim(),
        right: p.right.trim(),
      }));
  } else if (jenisSoal === 'ISIAN') {
    q.kunciIsian = (raw.kunciIsian || [])
      .map((k) => k.trim())
      .filter(Boolean);
    if (q.kunciIsian.length === 0) q.kunciIsian = [''];
  }

  return q;
}

function buildCompactResponseSchema(
  input: GenerateQuestionsInput,
  selectedKisi: KisiKisiItem
): Schema {
  const jenis = input.jenisSoal;
  const allowDataStimulus =
    input.mataUji === 'Matematika' &&
    (selectedKisi.id === 'ALL_MTK' ||
      selectedKisi.id === 'MTK_DATA_DIAGRAM' ||
      /data|tabel|diagram|grafik|rata-rata|modus/i.test(input.materiKhusus || ''));

  const props: Record<string, Schema> = {
    materi: { type: Type.STRING },
    kompetensi: { type: Type.STRING },
    indikator: { type: Type.STRING },
    tingkatKesulitan: { type: Type.STRING },
    jenisSoal: { type: Type.STRING },
    stimulusType: { type: Type.STRING },
    stimulusJudul: { type: Type.STRING },
    stimulusIsi: { type: Type.STRING },
    pertanyaan: { type: Type.STRING },
    pembahasan: { type: Type.STRING },
  };

  if (allowDataStimulus) {
    props.tableHeaders = { type: Type.ARRAY, items: { type: Type.STRING } };
    props.tableRows = {
      type: Type.ARRAY,
      items: { type: Type.ARRAY, items: { type: Type.STRING } },
    };
    props.chartData = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          value: { type: Type.NUMBER },
          unit: { type: Type.STRING },
        },
      },
    };
  }

  if (jenis === 'PG' || jenis === 'PGK' || jenis === 'CAMPURAN_TKA') {
    props.pilihan = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          key: { type: Type.STRING },
          text: { type: Type.STRING },
        },
      },
    };
  }
  if (jenis === 'PG' || jenis === 'CAMPURAN_TKA') {
    props.kunciPG = { type: Type.STRING };
  }
  if (jenis === 'PGK' || jenis === 'CAMPURAN_TKA') {
    props.kunciPGK = { type: Type.ARRAY, items: { type: Type.STRING } };
  }
  if (jenis === 'BS' || jenis === 'CAMPURAN_TKA') {
    props.pernyataanBS = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          answer: { type: Type.BOOLEAN },
        },
      },
    };
  }
  if (jenis === 'MENJODOHKAN') {
    props.pasanganJodoh = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          left: { type: Type.STRING },
          right: { type: Type.STRING },
        },
      },
    };
  }
  if (jenis === 'ISIAN') {
    props.kunciIsian = { type: Type.ARRAY, items: { type: Type.STRING } };
  }

  return {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: props,
      required: ['pertanyaan', 'jenisSoal', 'materi', 'indikator', 'pembahasan'],
    },
  };
}

function buildPromptForBatch(
  input: GenerateQuestionsInput,
  selectedKisi: KisiKisiItem,
  batchCount: number,
  batchIndex: number,
  totalBatches: number
): string {
  const jenisInstruction =
    input.jenisSoal === 'CAMPURAN_TKA'
      ? 'Variasikan jenisSoal: mayoritas "PG", sisipkan "PGK" (2-3 jawaban benar), dan "BS" (3 pernyataan Benar/Salah).'
      : `Seluruh ${batchCount} soal WAJIB jenisSoal="${input.jenisSoal}".`;

  const levelInstruction =
    input.tingkatKesulitan === 'CAMPURAN'
      ? 'Sebarkan tingkatKesulitan: "Mudah", "Sedang", dan "Sulit".'
      : `Seluruh soal WAJIB tingkatKesulitan="${input.tingkatKesulitan}".`;

  const materiKhusus = input.materiKhusus?.trim();
  const batchThemes = [
    'lingkungan sekolah/madrasah, alat tulis, dan koperasi siswa',
    'pasar tradisional, belanja kebutuhan rumah, dan kantin sehat',
    'kegiatan ekstrakurikuler, wisata edukasi, dan olahraga',
  ];
  const batchAngle =
    totalBatches > 1
      ? `\n- Variasi Paket ${batchIndex + 1}/${totalBatches}: Wajib gunakan konteks ${batchThemes[batchIndex % batchThemes.length]} dengan angka dan nama tokoh unik agar tidak mirip dengan paket lain.`
      : '';

  const materiStrictRule = materiKhusus
    ? `ATURAN WAJIB KESESUAIAN MATERI (TIDAK BOLEH MENYIMPANG):
- Materi Spesifik yang Dicantumkan Guru: "${materiKhusus}"
- 100% dari ${batchCount} soal yang disusun WAJIB secara langsung menguji materi "${materiKhusus}" untuk jenjang kelas VI SD/MI!
- Field "materi" pada setiap soal isi dengan "${materiKhusus}".
- DILARANG KERAS membuat soal dari materi lain di luar "${materiKhusus}".`
    : `ATURAN WAJIB KESESUAIAN KISI-KISI:
- Elemen Kisi-Kisi: ${selectedKisi.elemen}
- Materi Pokok: ${selectedKisi.materiUtama}
- Cakupan Wajib: ${selectedKisi.cakupan}
${selectedKisi.larangan ? `- Batasan Larangan: ${selectedKisi.larangan}` : ''}
- Field "materi" isi singkat & akurat sesuai sub-materi di atas.`;

  const mapelRule =
    input.mataUji === 'Bahasa Indonesia'
      ? selectedKisi.id === 'IND_KAIDAH_EJAAN' || selectedKisi.id === 'IND_KOSAKATA_MAKNA'
        ? `- Stimulus Bahasa Indonesia: Sertakan paragraf/kalimat stimulus singkat & jelas (20–55 kata) pada "stimulusType": "bacaan", "stimulusJudul", "stimulusIsi" (atau "none" jika kalimatnya sudah utuh di "pertanyaan").`
        : `- Stimulus Bahasa Indonesia: Sertakan teks bacaan padat & bermutu (45–85 kata) pada "stimulusType": "bacaan", "stimulusJudul", "stimulusIsi". Pertanyaan wajib merujuk langsung pada teks tersebut.`
      : `- Stimulus Matematika: Untuk soal Data/Tabel/Diagram gunakan "stimulusType": "tabel" (tableHeaders & tableRows) atau "diagram_batang" (chartData). Soal cerita gunakan "bacaan" ringkas atau "none" bila pertanyaan sudah memuat konteks lengkap. Pastikan 100% hitungan akurat dan diverifikasi di "pembahasan".`;

  const formatRule =
    input.jenisSoal === 'PG'
      ? `- Isi "pilihan" (A, B, C, D) dan "kunciPG" (1 huruf A-D).`
      : input.jenisSoal === 'PGK'
        ? `- Isi "pilihan" (A, B, C, D) dan "kunciPGK" (array 2-3 huruf benar, mis. ["A","C"]).`
        : input.jenisSoal === 'BS'
          ? `- Isi "pernyataanBS" berisi 3 pernyataan pendek + boolean "answer".`
          : input.jenisSoal === 'MENJODOHKAN'
            ? `- Isi "pasanganJodoh" berisi 3-4 pasangan {"left","right"} yang tepat satu-satu.`
            : input.jenisSoal === 'ISIAN'
              ? `- Isi "kunciIsian" berisi 1-2 variasi jawaban singkat yang benar.`
              : `- PG: "pilihan" (A-D) + "kunciPG". PGK: "pilihan" (A-D) + "kunciPGK" (>=2 huruf). BS: "pernyataanBS" (3 butir + boolean).`;

  return `Susun TEPAT ${batchCount} butir soal TKA SD/MI Kelas VI:
- Mata Uji: ${input.mataUji}
- Bentuk Soal: ${jenisInstruction}
- Kesulitan: ${levelInstruction}
- Konteks/Tema: ${input.konteksTema?.trim() || 'Kehidupan sehari-hari siswa SD/MI di Indonesia'}${batchAngle}

${materiStrictRule}

PANDUAN RINGKAS & BERKUALITAS:
${mapelRule}
${formatRule}
- "indikator": 1 kalimat indikator soal yang jelas.
- "pembahasan": singkat, padat, langkah demi langkah (1–3 kalimat) memastikan kunci jawaban 100% benar.`;
}

async function generateSingleBatch(
  ai: GoogleGenAI,
  input: GenerateQuestionsInput,
  selectedKisi: KisiKisiItem,
  responseSchema: Schema,
  batchCount: number,
  batchIndex: number,
  totalBatches: number
): Promise<RawGeneratedQuestion[]> {
  const prompt = buildPromptForBatch(
    input,
    selectedKisi,
    batchCount,
    batchIndex,
    totalBatches
  );

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  if (batchIndex > 0) {
    await sleep(batchIndex * 250);
  }

  const candidateModels: {
    model: string;
    thinkingLevel: ThinkingLevel;
    timeoutMs: number;
    delayAfterFailMs: number;
  }[] = [
    {
      model: 'gemini-4-hydrogen',
      thinkingLevel: ThinkingLevel.LOW,
      timeoutMs: 10000,
      delayAfterFailMs: 650,
    },
    {
      model: 'gemini-3.1-flash-lite',
      thinkingLevel: ThinkingLevel.MINIMAL,
      timeoutMs: 12000,
      delayAfterFailMs: 1100,
    },
    {
      model: 'gemini-4-hydrogen',
      thinkingLevel: ThinkingLevel.LOW,
      timeoutMs: 14000,
      delayAfterFailMs: 0,
    },
  ];
  let lastErr: unknown;

  for (let attempt = 0; attempt < candidateModels.length; attempt += 1) {
    const { model, thinkingLevel, timeoutMs, delayAfterFailMs } =
      candidateModels[attempt];
    const tStart = Date.now();
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction:
            'Anda adalah tim penyusun soal resmi Pusmendik TKA SD/MI Kelas VI. Keluarkan JSON valid yang ringkas, akurat, dan 100% sesuai materi yang diminta tanpa teks tambahan di luar JSON.',
          thinkingConfig: {
            thinkingLevel,
          },
          responseMimeType: 'application/json',
          responseSchema,
          httpOptions: {
            timeout: timeoutMs,
          },
        },
      });
      console.log(
        `[questionGenerator] batch ${batchIndex + 1}/${totalBatches} model=${model} OK in ${Date.now() - tStart}ms`
      );
      const jsonText = (response.text ?? '[]').trim();
      const rawList = JSON.parse(jsonText) as RawGeneratedQuestion[];
      if (!Array.isArray(rawList) || rawList.length === 0) {
        throw new Error('Generator mengembalikan daftar soal kosong.');
      }
      return rawList;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[questionGenerator] batch ${batchIndex + 1}/${totalBatches} model=${model} failed in ${Date.now() - tStart}ms: ${msg.slice(0, 160)}`
      );
      const isTransient =
        /503|504|502|429|unavailable|timeout|deadline|abort|overloaded|timed out/i.test(
          msg
        );
      if (!isTransient || attempt === candidateModels.length - 1) {
        throw err;
      }
      if (delayAfterFailMs > 0) {
        await sleep(delayAfterFailMs);
      }
    }
  }

  throw lastErr;
}

function formatApiError(err: unknown): string {
  const rawMsg = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(rawMsg) as {
      error?: { code?: number; message?: string; status?: string };
    };
    if (parsed?.error?.code === 503 || parsed?.error?.status === 'UNAVAILABLE') {
      return 'Layanan AI penyusun soal sedang padat (503). Silakan coba klik ulang beberapa detik lagi.';
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
    return 'Waktu tunggu layanan AI habis saat menyusun soal. Silakan coba klik ulang atau kurangi jumlah soal per sesi.';
  }
  return rawMsg;
}

export async function generateTkaQuestions(
  input: GenerateQuestionsInput
): Promise<Question[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY belum tersedia di environment server. Silakan atur key di menu Settings > Secrets terlebih dahulu.'
    );
  }

  const count = Math.min(15, Math.max(1, Math.round(input.jumlahSoal || 5)));
  const catalog = TKA_KISI_KISI[input.mataUji] || TKA_KISI_KISI.Matematika;
  const selectedKisi =
    catalog.find(
      (item) =>
        item.id === input.kisiKisiTopic ||
        item.label.toLowerCase() === (input.kisiKisiTopic || '').toLowerCase()
    ) || catalog[0];

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const responseSchema = buildCompactResponseSchema(input, selectedKisi);

  // Split >= 6 questions into parallel batches of up to 5 questions so latency stays low
  const batchSizes: number[] = [];
  if (count <= 5) {
    batchSizes.push(count);
  } else {
    let remaining = count;
    const targetBatchCount = count <= 10 ? 2 : 3;
    const baseSize = Math.floor(count / targetBatchCount);
    const extra = count % targetBatchCount;
    for (let i = 0; i < targetBatchCount; i += 1) {
      const sz = baseSize + (i < extra ? 1 : 0);
      if (sz > 0) {
        batchSizes.push(sz);
        remaining -= sz;
      }
    }
    if (remaining > 0) batchSizes[0] += remaining;
  }

  let rawBatches: RawGeneratedQuestion[][];
  try {
    rawBatches = await Promise.all(
      batchSizes.map((sz, bIdx) =>
        generateSingleBatch(
          ai,
          input,
          selectedKisi,
          responseSchema,
          sz,
          bIdx,
          batchSizes.length
        )
      )
    );
  } catch (err) {
    throw new Error(formatApiError(err));
  }

  const combinedRaw = rawBatches
    .flat()
    .filter((r) => r && r.pertanyaan && r.pertanyaan.trim().length > 0)
    .slice(0, count);

  if (combinedRaw.length === 0) {
    throw new Error('Generator tidak mengembalikan butir soal. Silakan coba lagi.');
  }

  const batchStamp = Date.now().toString().slice(-4);
  return combinedRaw.map((r, idx) =>
    normalizeGeneratedQuestion(r, idx, input, selectedKisi, batchStamp)
  );
}

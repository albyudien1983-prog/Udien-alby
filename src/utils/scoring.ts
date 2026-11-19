import type {
  ExamConfig,
  ExamSession,
  MateriBreakdown,
  Question,
  QuestionResultDetail,
  StudentAnswerValue,
} from '../types.ts';

export function isAnswerProvided(question: Question, answer: StudentAnswerValue | undefined): boolean {
  if (answer === undefined || answer === null) return false;
  switch (question.jenisSoal) {
    case 'PG':
      return typeof answer === 'string' && answer.trim().length > 0;
    case 'ISIAN':
      return typeof answer === 'string' && answer.trim().length > 0;
    case 'PGK':
      return Array.isArray(answer) && answer.length > 0;
    case 'BS': {
      if (typeof answer !== 'object' || Array.isArray(answer)) return false;
      const statements = question.pernyataanBS || [];
      if (statements.length === 0) return false;
      return statements.some((s) => typeof (answer as Record<string, boolean>)[s.id] === 'boolean');
    }
    case 'MENJODOHKAN': {
      if (typeof answer !== 'object' || Array.isArray(answer)) return false;
      const pairs = question.pasanganJodoh || [];
      return pairs.some((p) => {
        const val = (answer as Record<string, string>)[p.id];
        return typeof val === 'string' && val.trim().length > 0;
      });
    }
    default:
      return false;
  }
}

export function gradeQuestion(
  question: Question,
  answer: StudentAnswerValue | undefined
): QuestionResultDetail {
  const maxScore = Math.max(1, Number(question.bobot) || 1);
  const answered = isAnswerProvided(question, answer);

  if (!answered) {
    return {
      questionId: question.id,
      isCorrect: false,
      isPartial: false,
      isAnswered: false,
      earnedScore: 0,
      maxScore,
      studentAnswer: answer,
    };
  }

  let ratio = 0;

  switch (question.jenisSoal) {
    case 'PG': {
      const selected = typeof answer === 'string' ? answer.trim().toUpperCase() : '';
      const key = (question.kunciPG || '').trim().toUpperCase();
      ratio = selected === key ? 1 : 0;
      break;
    }

    case 'PGK': {
      const selected = Array.isArray(answer)
        ? [...new Set(answer.map((v) => String(v).trim().toUpperCase()))].sort()
        : [];
      const keys = [...new Set((question.kunciPGK || []).map((v) => v.trim().toUpperCase()))].sort();

      if (keys.length === 0) {
        ratio = 0;
        break;
      }

      if (question.metodeNilaiPGK === 'partial') {
        const truePositives = selected.filter((item) => keys.includes(item)).length;
        const falsePositives = selected.filter((item) => !keys.includes(item)).length;
        const raw = (truePositives - falsePositives * 0.5) / keys.length;
        ratio = Math.max(0, Math.min(1, raw));
      } else {
        const isExact =
          selected.length === keys.length && selected.every((val, idx) => val === keys[idx]);
        ratio = isExact ? 1 : 0;
      }
      break;
    }

    case 'BS': {
      const statements = question.pernyataanBS || [];
      if (statements.length === 0 || typeof answer !== 'object' || Array.isArray(answer)) {
        ratio = 0;
        break;
      }
      const record = answer as Record<string, boolean>;
      let matched = 0;
      for (const st of statements) {
        if (record[st.id] === st.answer) {
          matched += 1;
        }
      }
      ratio = matched / statements.length;
      break;
    }

    case 'MENJODOHKAN': {
      const pairs = question.pasanganJodoh || [];
      if (pairs.length === 0 || typeof answer !== 'object' || Array.isArray(answer)) {
        ratio = 0;
        break;
      }
      const record = answer as Record<string, string>;
      let matched = 0;
      for (const pair of pairs) {
        if ((record[pair.id] || '').trim() === pair.right.trim()) {
          matched += 1;
        }
      }
      ratio = matched / pairs.length;
      break;
    }

    case 'ISIAN': {
      const normalized =
        typeof answer === 'string'
          ? answer
              .trim()
              .toLowerCase()
              .replace(/\s+/g, ' ')
              .replace(/,/g, '.')
          : '';
      const validKeys = (question.kunciIsian || []).map((k) =>
        k.trim().toLowerCase().replace(/\s+/g, ' ').replace(/,/g, '.')
      );
      ratio = validKeys.includes(normalized) ? 1 : 0;
      break;
    }
  }

  const earnedScore = Math.round(maxScore * ratio * 100) / 100;
  const isCorrect = ratio >= 0.999;
  const isPartial = ratio > 0 && ratio < 0.999;

  return {
    questionId: question.id,
    isCorrect,
    isPartial,
    isAnswered: true,
    earnedScore,
    maxScore,
    studentAnswer: answer,
  };
}

export function evaluateExamSession(
  session: ExamSession,
  exam: ExamConfig,
  allQuestions: Question[]
): ExamSession {
  const questionMap = new Map(allQuestions.map((q) => [q.id, q]));
  const orderedQuestions = session.questionOrder
    .map((id) => questionMap.get(id))
    .filter((q): q is Question => Boolean(q));

  const details: QuestionResultDetail[] = orderedQuestions.map((q) =>
    gradeQuestion(q, session.answers[q.id])
  );

  const jumlahSoal = orderedQuestions.length;
  const jumlahBenar = details.filter((d) => d.isCorrect).length;
  const tidakDijawab = details.filter((d) => !d.isAnswered).length;
  const jumlahSalah = details.filter((d) => d.isAnswered && !d.isCorrect).length;

  const skorDiperoleh =
    Math.round(details.reduce((acc, d) => acc + d.earnedScore, 0) * 100) / 100;
  const skorMaksimal =
    Math.round(details.reduce((acc, d) => acc + d.maxScore, 0) * 100) / 100;

  const nilaiAkhir =
    skorMaksimal > 0 ? Math.round((skorDiperoleh / skorMaksimal) * 1000) / 10 : 0;
  const persentaseBenar =
    jumlahSoal > 0 ? Math.round((jumlahBenar / jumlahSoal) * 1000) / 10 : 0;

  // Group breakdown by materi
  const materiMap = new Map<
    string,
    {
      materi: string;
      mataUji: Question['mataUji'];
      totalQuestions: number;
      correctCount: number;
      earnedScore: number;
      maxScore: number;
    }
  >();

  orderedQuestions.forEach((q, idx) => {
    const det = details[idx];
    const key = `${q.mataUji}::${q.materi}`;
    const current = materiMap.get(key) || {
      materi: q.materi,
      mataUji: q.mataUji,
      totalQuestions: 0,
      correctCount: 0,
      earnedScore: 0,
      maxScore: 0,
    };
    current.totalQuestions += 1;
    if (det.isCorrect) current.correctCount += 1;
    current.earnedScore += det.earnedScore;
    current.maxScore += det.maxScore;
    materiMap.set(key, current);
  });

  const materiBreakdown: MateriBreakdown[] = Array.from(materiMap.values()).map((item) => ({
    ...item,
    earnedScore: Math.round(item.earnedScore * 100) / 100,
    maxScore: Math.round(item.maxScore * 100) / 100,
    percentage:
      item.maxScore > 0 ? Math.round((item.earnedScore / item.maxScore) * 1000) / 10 : 0,
  }));

  return {
    ...session,
    status: 'submitted',
    locked: true,
    submittedAt: session.submittedAt || Date.now(),
    jumlahSoal,
    jumlahBenar,
    jumlahSalah,
    tidakDijawab,
    skorDiperoleh,
    skorMaksimal,
    nilaiAkhir,
    persentaseBenar,
    tuntas: nilaiAkhir >= exam.nilaiMinimum,
    materiBreakdown,
    questionDetails: details,
  };
}

export function formatDurationTimer(secondsLeft: number): string {
  const safe = Math.max(0, Math.floor(secondsLeft));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

export function exportRowsToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (cell: string | number) => {
    const str = String(cell ?? '');
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvContent =
    '\uFEFF' + [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadJsonFile(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

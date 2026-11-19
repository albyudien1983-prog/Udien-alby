import type { MataUji } from '../types.ts';

export interface KisiKisiItem {
  id: string;
  label: string;
  elemen: string;
  materiUtama: string;
  cakupan: string;
  larangan?: string;
  subMateriContoh: string[];
}

export const TKA_KISI_KISI_CATALOG: Record<MataUji, KisiKisiItem[]> = {
  Matematika: [
    {
      id: 'ALL_MTK',
      label: 'Semua Elemen Kisi-Kisi TKA Matematika SD/MI (Proporsional)',
      elemen: 'Bilangan, Geometri & Pengukuran, dan Data',
      materiUtama: 'Campuran Kisi-Kisi TKA Matematika',
      cakupan:
        'Operasi hitung bilangan cacah, pecahan/desimal/persen, KPK/FPB, sifat & luas/keliling bangun datar, volume bangun ruang, satuan & kecepatan-jarak-waktu, serta penafsiran tabel/diagram batang.',
      subMateriContoh: [
        'Operasi Hitung Campuran',
        'Pecahan & Persentase',
        'Bangun Datar & Ruang',
        'Pengolahan Data & Tabel',
      ],
    },
    {
      id: 'MTK_BILANGAN_CACAH',
      label: 'Bilangan — Operasi Hitung Bilangan Cacah & Pemecahan Masalah',
      elemen: 'Bilangan',
      materiUtama: 'Bilangan Cacah dan Operasi Hitung',
      cakupan:
        'Operasi penjumlahan, pengurangan, perkalian, pembagian bilangan cacah, urutan operasi hitung campuran, sifat operasi, dan soal cerita transaksi/kehidupan sehari-hari.',
      larangan:
        'Jangan membuat soal pecahan/persen, bangun datar, bangun ruang, KPK/FPB, atau diagram data kecuali murni melibatkan bilangan cacah.',
      subMateriContoh: [
        'Operasi Hitung Campuran Bilangan Cacah',
        'Soal Cerita Transaksi & Uang',
        'Penjumlahan & Pengurangan Ribuan',
        'Perkalian & Pembagian Kontekstual',
      ],
    },
    {
      id: 'MTK_PECAHAN_PERSEN',
      label: 'Bilangan — Pecahan Senilai, Desimal, Persen & Perbandingan',
      elemen: 'Bilangan',
      materiUtama: 'Pecahan, Desimal, Persen, dan Perbandingan',
      cakupan:
        'Pecahan senilai, mengurutkan serta mengonversi pecahan biasa, campuran, desimal, dan persen, operasi pecahan, diskon/persentase, serta perbandingan senilai dalam konteks sehari-hari.',
      larangan:
        'Jangan membuat soal bangun ruang, KPK/FPB, kecepatan, atau diagram jika tidak menguji pecahan/desimal/persen/perbandingan.',
      subMateriContoh: [
        'Operasi Hitung Pecahan & Campuran',
        'Konversi Pecahan, Desimal & Persen',
        'Diskon & Persentase Sehari-hari',
        'Perbandingan Senilai & Skala Sederhana',
      ],
    },
    {
      id: 'MTK_KPK_FPB',
      label: 'Bilangan — Kelipatan, Faktor, KPK, dan FPB Kontekstual',
      elemen: 'Bilangan',
      materiUtama: 'KPK dan FPB',
      cakupan:
        'Menentukan faktor, kelipatan persekutuan terkecil (KPK), dan faktor persekutuan terbesar (FPB) untuk menyelesaikan masalah jadwal bersamaan atau pembagian paket merata.',
      larangan:
        'Setiap soal wajib menguji faktor, kelipatan, KPK, atau FPB. Jangan membuat soal pecahan, bangun datar, atau rata-rata data.',
      subMateriContoh: [
        'Soal Cerita KPK (Jadwal Bersamaan)',
        'Soal Cerita FPB (Pembagian Paket Merata)',
        'Faktorisasi Prima & KPK/FPB 2-3 Bilangan',
      ],
    },
    {
      id: 'MTK_BANGUN_DATAR',
      label: 'Geometri & Pengukuran — Sifat, Keliling & Luas Bangun Datar',
      elemen: 'Geometri dan Pengukuran',
      materiUtama: 'Sifat, Keliling, dan Luas Bangun Datar',
      cakupan:
        'Sifat dan unsur bangun datar (segitiga, persegi, persegi panjang, jajar genjang, belah ketupat, trapesium, lingkaran), keliling, luas, serta gabungan bangun datar dalam konteks taman/lantai/lahan.',
      larangan:
        'Setiap soal wajib menguji bangun datar (sifat, keliling, atau luas). Jangan membuat soal volume bangun ruang atau KPK/FPB.',
      subMateriContoh: [
        'Keliling & Luas Persegi, Persegi Panjang & Segitiga',
        'Luas & Keliling Lingkaran',
        'Luas Gabungan Bangun Datar',
        'Sifat-Sifat Bangun Datar',
      ],
    },
    {
      id: 'MTK_BANGUN_RUANG',
      label: 'Geometri & Pengukuran — Sifat, Jaring-Jaring & Volume Bangun Ruang',
      elemen: 'Geometri dan Pengukuran',
      materiUtama: 'Sifat, Jaring-Jaring, dan Volume Bangun Ruang',
      cakupan:
        'Unsur (rusuk, sisi, titik sudut), jaring-jaring, luas permukaan sederhana, dan volume kubus, balok, serta prisma segitiga/tabung sederhana dalam konteks wadah air/kardus/akuarium.',
      larangan:
        'Setiap soal wajib menguji bangun ruang (sifat, jaring-jaring, luas permukaan, atau volume). Jangan hanya menghitung luas bangun datar 2D.',
      subMateriContoh: [
        'Volume Kubus dan Balok',
        'Soal Cerita Wadah Air / Akuarium',
        'Sifat & Unsur Bangun Ruang',
        'Jaring-Jaring & Luas Permukaan Kubus/Balok',
      ],
    },
    {
      id: 'MTK_SATUAN_KECEPATAN',
      label: 'Geometri & Pengukuran — Konversi Satuan, Debit, Jarak, Waktu & Kecepatan',
      elemen: 'Geometri dan Pengukuran',
      materiUtama: 'Pengukuran Satuan, Debit, Jarak, Waktu, dan Kecepatan',
      cakupan:
        'Hubungan antarsatuan panjang, berat, waktu, volume/liter, debit air, serta penyelesaian masalah kecepatan rata-rata, jarak tempuh, dan waktu keberangkatan/tiba.',
      larangan:
        'Setiap soal wajib menguji konversi satuan, debit, jarak, kecepatan, atau waktu. Jangan membuat soal luas bangun datar atau KPK/FPB.',
      subMateriContoh: [
        'Jarak, Kecepatan, dan Waktu Tempuh',
        'Konversi Satuan Panjang, Berat & Volume',
        'Debit Air & Waktu Pengisian',
        'Operasi Satuan Waktu & Jadwal Perjalanan',
      ],
    },
    {
      id: 'MTK_DATA_DIAGRAM',
      label: 'Data — Membaca & Menafsirkan Tabel, Piktogram, dan Diagram Batang',
      elemen: 'Data',
      materiUtama: 'Penyajian dan Penafsiran Data (Tabel & Diagram)',
      cakupan:
        'Menyajikan, membaca, membandingkan, menghitung rata-rata (mean) dan modus sederhana, serta menarik kesimpulan dari tabel data atau diagram batang.',
      larangan:
        'Setiap soal wajib menyajikan data (tabel atau diagram batang) yang relevan untuk ditafsirkan.',
      subMateriContoh: [
        'Menafsirkan Tabel Data & Rata-Rata',
        'Membaca & Membandingkan Diagram Batang',
        'Modus, Selisih & Jumlah Data',
      ],
    },
  ],
  'Bahasa Indonesia': [
    {
      id: 'ALL_IND',
      label: 'Semua Elemen Kisi-Kisi TKA Bahasa Indonesia SD/MI (Proporsional)',
      elemen: 'Teks Informasi & Teks Fiksi (Literasi Membaca)',
      materiUtama: 'Campuran Kisi-Kisi TKA Bahasa Indonesia',
      cakupan:
        'Menemukan informasi tersurat, menentukan ide pokok, menyimpulkan informasi tersirat, memahami makna kata/sinonim/antonim, evaluasi isi teks, serta kaidah ejaan/kalimat.',
      subMateriContoh: [
        'Ide Pokok & Informasi Tersurat',
        'Simpulan & Pesan Tersirat',
        'Makna Kata, Sinonim & Antonim',
        'Ejaan (EYD V) & Kalimat Efektif',
      ],
    },
    {
      id: 'IND_TEKS_INFORMASI_IDE_POKOK',
      label: 'Teks Informasi — Ide Pokok, Gagasan Pendukung & Informasi Tersurat',
      elemen: 'Teks Informasi',
      materiUtama: 'Ide Pokok dan Informasi Tersurat Teks Informasi',
      cakupan:
        'Membaca teks faktual/sains populer/sosial lingkungan anak untuk menemukan informasi eksplisit (apa, siapa, di mana, kapan, mengapa, bagaimana), kalimat utama, ide pokok paragraf, dan gagasan pendukung.',
      larangan:
        'Jangan membuat soal cerita fiksi atau soal perbaikan ejaan murni; fokus pada ide pokok, kalimat utama, dan informasi tersurat dalam teks informasi.',
      subMateriContoh: [
        'Menentukan Ide Pokok Paragraf',
        'Menemukan Informasi Tersurat (ADIKSIMBA)',
        'Kalimat Utama & Gagasan Pendukung',
      ],
    },
    {
      id: 'IND_TEKS_INFORMASI_INFERENSIAL',
      label: 'Teks Informasi — Simpulan Tersirat, Sebab-Akibat & Evaluasi Teks',
      elemen: 'Teks Informasi',
      materiUtama: 'Simpulan Tersirat, Sebab-Akibat, dan Evaluasi Teks Informasi',
      cakupan:
        'Menarik simpulan isi keseluruhan bacaan, menentukan informasi tersirat, hubungan sebab-akibat, memprediksi kejadian berdasarkan fakta teks, serta menilai kesesuaian pernyataan dengan isi bacaan.',
      larangan:
        'Jangan hanya menanyakan fakta salin-tempel sederhana atau cerita fabel; fokus pada inferensi, simpulan, sebab-akibat, dan evaluasi teks informasi.',
      subMateriContoh: [
        'Menyimpulkan Isi Teks Informasi',
        'Hubungan Sebab-Akibat & Prediksi',
        'Informasi Tersirat & Evaluasi Pernyataan',
      ],
    },
    {
      id: 'IND_TEKS_FIKSI',
      label: 'Teks Fiksi — Pemahaman Cerita Anak, Tokoh, Watak, Latar & Amanat',
      elemen: 'Teks Fiksi',
      materiUtama: 'Pemahaman Teks Fiksi (Tokoh, Watak, Latar, Konflik & Amanat)',
      cakupan:
        'Memahami cerita anak/fabel/kisah teladan/petualangan dengan konflik konkret untuk mengidentifikasi watak tokoh, latar tempat/waktu/suasana, konflik, dan amanat/pesan moral cerita.',
      larangan:
        'WAJIB menggunakan teks fiksi/cerita naratif sebagai stimulus; jangan memakai artikel non-fiksi atau soal ejaan EYD.',
      subMateriContoh: [
        'Watak Tokoh & Bukti Kalimat',
        'Amanat dan Pesan Moral Cerita',
        'Latar Cerita & Konflik Tokoh',
      ],
    },
    {
      id: 'IND_KOSAKATA_MAKNA',
      label: 'Kebahasaan — Makna Kata/Istilah, Sinonim, Antonim & Ungkapan',
      elemen: 'Teks Informasi & Fiksi',
      materiUtama: 'Makna Kata/Istilah, Sinonim, Antonim, dan Ungkapan',
      cakupan:
        'Menentukan makna kata atau istilah dalam konteks kalimat bacaan, padanan kata (sinonim), lawan kata (antonim), kata bermakna kias, serta makna ungkapan/peribahasa sederhana.',
      larangan:
        'Setiap soal wajib menguji kosakata (makna kata/istilah, sinonim, antonim, atau ungkapan). Jangan menguji tanda baca atau keliling ide pokok paragraf.',
      subMateriContoh: [
        'Makna Istilah dalam Konteks Kalimat',
        'Sinonim & Antonim Kontekstual',
        'Makna Ungkapan & Peribahasa',
      ],
    },
    {
      id: 'IND_KAIDAH_EJAAN',
      label: 'Kebahasaan — Struktur Kalimat Efektif, Ejaan (EYD V) & Tanda Baca',
      elemen: 'Kaidah Kebahasaan',
      materiUtama: 'Kaidah Ejaan (EYD V), Tanda Baca, Kata Baku & Kalimat Efektif',
      cakupan:
        'Memperbaiki penulisan huruf kapital, tanda baca (titik, koma, tanda seru, tanda tanya, tanda petik, tanda hubung), penulisan kata baku/tidak baku, imbuhan, serta penyuntingan kalimat efektif.',
      larangan:
        'Setiap soal wajib menguji kaidah kebahasaan (EYD V, tanda baca, kata baku, atau kalimat efektif). Jangan menanyakan watak tokoh atau simpulan wacana.',
      subMateriContoh: [
        'Penggunaan Huruf Kapital & Tanda Baca',
        'Perbaikan Kata Baku & Tidak Baku',
        'Penyuntingan Kalimat Efektif',
      ],
    },
  ],
};

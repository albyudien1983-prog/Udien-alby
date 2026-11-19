# TKA SMART EXAM MI/SD — MI PSM PARON

Aplikasi Ujian **Tes Kemampuan Akademik (TKA)** berbasis web untuk siswa Kelas VI Madrasah Ibtidaiyah (MI) dan Sekolah Dasar (SD).

## Fitur Utama

### 1. Portal Peserta Didik
- Login menggunakan **Nomor Peserta / Username** dan kata sandi.
- Validasi **Token Ujian** dan jadwal aktif di sisi server.
- Mendukung 5 bentuk soal: **Pilihan Ganda (PG)**, **Pilihan Ganda Kompleks (PGK)**, **Benar/Salah**, **Menjodohkan**, dan **Isian Singkat**.
- Dilengkapi stimulus bacaan, tabel, diagram batang SVG, ilustrasi bangun datar/ruang, dan gambar.
- Navigasi nomor soal dengan indikator **Sudah Dijawab**, **Ragu-ragu**, dan **Belum Dijawab**.
- Timer hitung mundur otomatis, simpan berkala (*auto-save*), pemulihan sesi saat halaman dimuat ulang, deteksi perpindahan tab, dan kunci pengiriman ganda.
- Cetak **Kartu Hasil Ujian** jika diaktifkan oleh guru.

### 2. Panel Admin / Guru
- **Dashboard Admin**: Ringkasan total peserta, bank soal, ujian aktif, rata-rata/tertinggi/terendah, serta 4 grafik evaluasi (distribusi nilai, perbandingan Matematika vs Bahasa Indonesia, persentase ketuntasan, rekap kelas).
- **Data Peserta & Rombel**: CRUD kelas dan peserta, impor/ekspor CSV, serta cetak Kartu Peserta Ujian.
- **Bank Soal**: 40 soal demo (20 Matematika + 20 Bahasa Indonesia), filter lengkap, pengelompokan kompetensi, editor stimulus visual, serta impor/ekspor JSON & CSV.
- **Buat & Jadwal Ujian**: Pengambilan soal acak berdasar materi & tingkat kesulitan, acak soal & opsi, token otomatis, KKM, dan pengaturan visibilitas nilai.
- **Monitoring**: Pantau progres peserta dan reset ujian peserta bila perlu.
- **Hasil & Analisis Nilai**: Laporan PDF cetak, ekspor Excel/CSV, kartu hasil siswa, analisis capaian materi, dan analisis butir soal.
- **Pengaturan**: Identitas sekolah (termasuk unggah logo), akun admin, serta cadangan & pemulihan database JSON.

## Akses Awal & Pengisian Peserta
- **Admin / Guru**: Username `admin`, Kata Sandi `123` (dapat diubah di menu **Pengaturan**).
- **Peserta Didik**: Daftar peserta awal dikosongkan. Tambahkan akun peserta baru melalui menu **Data Peserta** (**+ Tambah Peserta** atau **Impor CSV**).
- **Token Ujian Default**: `TKA26M` (Matematika) · `TKA26B` (Bahasa Indonesia)

## Menjalankan Aplikasi
1. Instal dependensi: `npm install`
2. Jalankan mode pengembangan (server Express + Vite): `npm run dev`
3. Bangun produksi: `npm run build` lalu jalankan `npm start`

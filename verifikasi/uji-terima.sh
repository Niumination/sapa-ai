#!/usr/bin/env bash
# ─── PENUNJUK (bukan salinan) ─────────────────────────────────────────────────
#
# Skrip uji terima yang KANONIK ada di:
#     docs/usulan-ai-tingkat-lanjut/uji-terima.sh
#
# Mengapa berkas ini hanya meneruskan: dulu berkas ini salinan TERPISAH yang
# disalin-tempel dari waktu ke waktu, lalu menyimpang tanpa ketahuan. Pada
# 24 Sep 2026 hermes agent menjalankannya dan mendapat 1 GAGAL palsu — versi
# lama masih menuntut bukti memuat ejaan persis "penduduk", padahal katalog
# produksi memuat indikator yang memang salah tulis
# ("Jumlah Pendudk Usia 13-15 Tahun"). Perilaku kode benar; yang basi skripnya.
#
# Karena itu salinan kedua dihapus sebagai salinan: satu berkas kanonik, satu
# sumber kebenaran. Semua perintah di dokumen (10, 11, 12, …) yang menyebut
# `bash verifikasi/uji-terima.sh` tetap berjalan apa adanya.
#
# Pakai (dari dalam klon repo):
#   bash verifikasi/uji-terima.sh
#   AI_URL=http://127.0.0.1:3116 DET_URL=http://127.0.0.1:3117 bash verifikasi/uji-terima.sh
#   SAPA_MODE=det bash verifikasi/uji-terima.sh
#
# Keluar dengan kode keluar skrip kanonik (0 = LULUS, 1 = GAGAL).

set -uo pipefail

di_sini="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
kanonik="$di_sini/../docs/usulan-ai-tingkat-lanjut/uji-terima.sh"

if [ ! -f "$kanonik" ]; then
  echo "[GAGAL] skrip kanonik tidak ditemukan: docs/usulan-ai-tingkat-lanjut/uji-terima.sh" >&2
  echo "        (berkas ini hanya penunjuk — jangan pulihkan salinannya)" >&2
  exit 1
fi

echo "[penunjuk] meneruskan ke docs/usulan-ai-tingkat-lanjut/uji-terima.sh (satu sumber kebenaran)"
exec bash "$kanonik" "$@"

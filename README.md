# FlatShot ⚡

[![License: TBD](https://img.shields.io/badge/license-TBD-lightgrey.svg)](#) [![Three.js](https://img.shields.io/badge/Three.js-vR%20-%233399ff.svg)](#) [![Play Locally](https://img.shields.io/badge/Play%20Locally-%E2%9A%A1-brightgreen.svg)](https://fawwaz1st.github.io/FlatShot/)

FlatShot adalah arena FPS ringan berbasis web (HTML/CSS/JS + Three.js) yang dirancang untuk gameplay cepat, VFX ledakan sinematik, dan AI sekutu/musuh yang responsif — semua berjalan langsung di browser tanpa bundler.

Kenapa FlatShot?
- Ringan & modular: modul ES, mudah dipelajari, cepat dijalankan.
- Fokus gameplay: movement cepat, granat dengan lintasan prediksi, dan combat yang terasa padat.
- Visual sinematik: ledakan realtime, debris, dan smoke billboard yang menambah rasa "impact".

<!-- PLAY / HERO -->
<p align="center">
  <a href="https://fawwaz1st.github.io/FlatShot/" target="_blank" rel="noopener noreferrer">
    <img src="https://img.shields.io/badge/Play%20Online-%F0%9F%8E%89-blue?style=for-the-badge" alt="Play Online badge" />
  </a>
</p>

<p align="center">
  <img src="docs/Screenshot game.png" alt="FlatShot gameplay screenshot — HUD menunjukkan HP, ammo, skor, dan lintasan granat" width="880" style="border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.45);" />
  <br/>
  <em>Screenshot: tampilan in-game dengan HUD (HP, ammo, skor, sekutu) dan lintasan granat.</em>
</p>

Ringkasan singkat:
- Main langsung di browser — modul ES, tanpa bundler.
- Mekanik: bergerak cepat, tembak-menembak, granat dengan lintasan prediksi, sekutu AI, dan efek ledakan sinematik.

---

## Daftar Isi
- [Demo Lokal Cepat](#demo-lokal-cepat)
- [Fitur Utama](#fitur-utama)
- [Kontrol](#kontrol)
- [Cara Menjalankan (Local)](#cara-menjalankan-local)
- [Opsi & Tips Performa](#opsi--tips-performa)
- [Struktur Proyek](#struktur-proyek)
- [Pengembangan](#pengembangan)
- [Roadmap](#roadmap)
- [Kontribusi](#kontribusi)
- [Lisensi & Acknowledgements](#lisensi--acknowledgements)

---

## Demo Lokal Cepat
Buka file `index.html` di browser modern, atau jalankan server statis agar modul ES dapat dimuat dengan benar.

```bash
# dari folder proyek
npx serve -l 8080
# atau
npx http-server -p 8080
```

Lalu buka: http://localhost:8080

> Catatan: Three.js dimuat via CDN (unpkg). Untuk asset/texture lokal, pastikan server statis berjalan.

---

## Fitur Utama
- 🎯 AI Musuh: mengejar, menghindar obstacle, menembak, strafing saat jarak dekat
- 🤝 AI Sekutu: patroli, engage, regroup/retreat, dukungan tembakan
- 💣 Granat Fisik: gravitasi, explode on impact, lintasan prediksi + marker ring
- 🔥 Ledakan Sinematik: shockwave rings, glow, smoke billboards, debris, screen flash, dan SFX
- 🔫 Senjata: pistol semi-auto dengan recoil & muzzle flash
- 🎒 Pickup: amunisi, granat, kesehatan
- 🕹️ HUD: HP, ammo/mag, jumlah sekutu, skor, crosshair kustom
- ⚙️ Pengaturan: sensitivitas, FOV, render scale, bloom, fog, draw distance, particle count
- ♿ Aksesibilitas: aim-assist ringan (opsional)

---

## Kontrol
- Gerak: WASD / Arrow keys
- Lari: Shift
- Lompat: Space
- Tembak: Klik kiri (tahan untuk aim granat)
- Reload: R
- Senjata: 1 (Pistol), 2 (Granat)
- Pause / Menu: Esc

Tips granat: tahan klik untuk melihat lintasan prediksi, lepaskan untuk melempar.

---

## Cara Menjalankan (Local)
1. Clone repo:
```bash
git clone https://github.com/fawwaz1st/FlatShot.git
cd FlatShot
```
2. Jalankan server statis (agar ES Modules dan asset ter-load):
```bash
npx serve -l 8080
# atau
npx http-server -p 8080
```
3. Buka http://localhost:8080

---

## Opsi & Tips Performa
- Turunkan: Render Scale, Partikel Ambient, Draw Distance jika FPS turun.
- Matikan efek: Bloom / Motion Blur / Partikel untuk perangkat rendah.
- Gunakan preset pengaturan (Low / Medium / High / Ultra) dari menu Pengaturan.

---

## Struktur Proyek (ringkasan)
```
.
├─ index.html           # Halaman utama & UI menu/HUD
├─ styles.css           # Styling UI dan overlay
├─ docs/
│  └─ Screenshot game.png  # (tampak di-repo sebagai docs/Screenshot%20game.png)
├─ src/
│  ├─ main.js           # Binding UI dan alur start/pause/game over
│  ├─ game.js           # Game loop, dunia, input, senjata, VFX, gameplay
│  └─ modules/
│     ├─ enemy.js       # Perilaku musuh (AI, LOS, strafing)
│     ├─ ally.js        # Perilaku sekutu (state machine)
│     ├─ grenade.js     # Proyektil granat (fisika, impact explode)
│     ├─ pickup.js      # Pickup amunisi/granat/kesehatan
│     ├─ audio.js       # SFX & BGM berbasis WebAudio
│     └─ hud.js         # Pembaruan HUD
```

---

## Pengembangan
- Tidak perlu bundler; modul diimpor via ES Modules.
- Gunakan server statis untuk development.
- Gaya kode: nama variabel deskriptif, early-return, dan tanpa dependensi berat.
- Jika menambahkan asset besar (audio/texture), letakkan di `assets/` dan perbarui path relative.

---

## Roadmap
- Flipbook VFX untuk asap/nyala ledakan (lebih sinematik)
- Kontrol gamepad & mobile friendly
- Mode gelombang (waves) dan scoreboard online
- Tools debug AI & profiler performa di-game

---

## Kontribusi
1. Fork repo → buat branch fitur: `feat/nama-fitur`
2. Sertakan deskripsi singkat perubahan di PR
3. Tambahkan screenshot/GIF bila menyentuh UI/VFX
4. Jaga readability dan performa; tambahkan tests/log minimal bila perlu

Untuk PR besar, buka issue terlebih dahulu agar kita bisa diskusikan design.

---

## Lisensi & Acknowledgements
Lisensi: TBD.

Referensi VFX / Inspirasi:
- Realtime VFX community — teknik ledakan realtime
- Beyond-FX blog — komponen ledakan (flare, smoke, rings, debris)

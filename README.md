# FlatShot

Arena FPS ringan berbasis web (HTML/CSS/JS) dengan Three.js. Main langsung di browser: gerak cepat, tembak- tembakan, sekutu AI, musuh mengejar/menembak, granat fisik dengan lintasan prediksi, pickup amunisi/kesehatan, serta opsi grafis dan audio.

## Demo Lokal Cepat

Buka file `index.html` di browser modern, atau jalankan server statis agar modul ES dapat dimuat dengan benar.

```bash
# dari folder proyek
npx serve -l 8080
# atau
npx http-server -p 8080
```

Lalu buka `http://localhost:8080`.

> Catatan: Proyek ini memuat Three.js dari CDN (`unpkg`) sehingga tidak perlu build tooling.

## Fitur Utama

- AI Musuh: mengejar, menghindar obstacle, menembak, dan strafe saat jarak dekat.
- AI Sekutu: patroli, engage, regroup/retreat, bantu tembak musuh.
- Granat Fisik: gravitasi, impact-only explode, lintasan prediksi yang menyentuh titik tabrak + marker ring.
- Ledakan Besar: shockwave ring ganda, glow besar, smoke billboard, debris, screen flash, serta SFX ledakan (noise burst + low boom + tail).
- Senjata: pistol semi-auto dengan recoil & muzzle flash.
- Pickup: amunisi, granat, dan kesehatan dengan indikator HUD.
- HUD modern: HP, ammo/mag, jumlah sekutu, skor, crosshair kustom.
- Pengaturan: sensitivitas, FOV, render scale, bloom, fog density, draw distance, jumlah partikel, soundtrack mode.
- Aksesibilitas: aim assist ringan opsional.

## Kontrol

- Gerak: WASD / Arrow keys
- Lari: Shift
- Lompat: Space
- Tembak: Klik kiri
- Reload: R (pistol)
- Senjata: 1 (Pistol), 2 (Granat)
- Pause ke Menu: Esc
- Granat: tahan klik kiri untuk aim (muncul garis prediksi), lepaskan untuk melempar

## Opsi & Tips Performa

- Turunkan `Render Scale` dan `Partikel Ambient` jika FPS turun.
- `Draw Distance` dan `Fog Density` berpengaruh pada beban render jauh.
- Pilih preset grafis di menu Pengaturan (Low/Medium/High/Ultra).

## Struktur Proyek

```
.
├─ index.html           # Halaman utama & UI menu/HUD
├─ styles.css           # Styling UI dan overlay
├─ src/
│  ├─ main.js           # Binding UI dan alur start/pause/game over
│  ├─ game.js           # Game loop, dunia, input, senjata, VFX, gameplay
│  └─ modules/
│     ├─ enemy.js       # Perilaku musuh (AI, LOS, strafing)
│     ├─ ally.js        # Perilaku sekutu (state machine sederhana)
│     ├─ grenade.js     # Proyektil granat (fisika, impact explode)
│     ├─ pickup.js      # Pickup amunisi/granat/kesehatan
│     ├─ audio.js       # SFX & BGM berbasis WebAudio (term. ledakan)
│     └─ hud.js         # Pembaruan HUD
```

## Pengembangan

- Tidak memerlukan bundler. Seluruh modul diimpor via ES Modules.
- Gunakan server statis agar path modul/asset termuat benar.
- Kode mengikuti gaya: nama variabel deskriptif, early-return, dan tanpa dependensi berat.

## Rencana Lanjutan

- Flipbook VFX untuk asap/nyala ledakan agar lebih sinematik.
- Opsi kontrol gamepad & mobile.
- Mode gelombang (waves) dan scoreboard online.

## Kontribusi

- Fork repo lalu buat branch fitur: `feat/nama-fitur`.
- Ajukan PR berisi ringkasan perubahan, fokus pada keterbacaan dan performa.
- Sertakan screenshot/gif bila menyentuh UI/VFX.

## Lisensi

TBD.

---

Dibangun untuk seru-seruan dan eksperimen VFX realtime. Referensi inspirasi efek ledakan dan layering VFX dapat dilihat di:
- Diskusi teknik eksplosi real-time dan flipbook di pipeline game [realtimevfx.com](https://realtimevfx.com/t/how-to-achieve-a-realistic-game-explosion-with-embergen/27306)
- Breakdown komponen ledakan (flare, smoke, rings, debris, point light) [Beyond-FX](https://blog.beyond-fx.com/articles/level-up-episode-2-explosion-effects-tutorial)
- Materi eksplosi untuk game (shader/flipbook) [CGCircuit](https://www.cgcircuit.com/tutorial/explosions-for-games-i1)

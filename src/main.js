import Game from './game.js';

const playBtn = document.getElementById('playBtn');
const restartBtn = document.getElementById('restartBtn');
const menuEl = document.getElementById('menu');
const hudEl = document.getElementById('hud');
const crosshairEl = document.getElementById('crosshair');
const gameoverEl = document.getElementById('gameover');
const finalScoreEl = document.getElementById('finalScore');
const transEl = document.getElementById('transition');
const countdownEl = document.getElementById('countdown');
const countTextEl = document.getElementById('countText');
const skillSelectEl = document.getElementById('skillSelect');
const skillGridEl = document.getElementById('skillGrid');
const leaderboardEl = document.getElementById('leaderboard');

// create pause overlay UI (reusable)
function ensurePauseOverlay(){
    if (document.getElementById('pauseOverlay')) return;
    const wrap = document.createElement('div'); wrap.id = 'pauseOverlay'; wrap.className = 'pause-overlay hidden';
    const panel = document.createElement('div'); panel.className = 'pause-panel';
    panel.innerHTML = `<h2>Game Paused</h2><div class="sub">Permainan dihentikan</div><div style="display:flex;gap:10px;justify-content:center;margin-top:8px"><button id="resumeBtn" class="menu-action">Resume</button><button id="toMenuBtn" class="menu-action secondary">Menu</button></div><div class="pause-hint">Tekan <strong>Esc</strong> untuk kembali ke menu</div>`;
    wrap.appendChild(panel); document.body.appendChild(wrap);
    document.getElementById('resumeBtn').addEventListener('click', ()=>{
        try { game.audio.menuClick(); } catch(_){ }
        // try request pointer lock; if succeeds, resume flow via lock event, else run resume countdown
        tryRequestPointerLock();
        // if pointer not locked after small delay, run resume countdown
        setTimeout(()=>{ if (!isPointerLocked()) runResumeCountdown(); }, 420);
    });
    // dispatch sebagai CustomEvent agar kita dapat membedakan permintaan "menu penuh" vs "pause overlay"
    document.getElementById('toMenuBtn').addEventListener('click', ()=>{ window.dispatchEvent(new CustomEvent('game:showMenu', { detail: { fullMenu: true } })); });
}

// helper untuk cek lock status (MDN: Document.pointerLockElement)
const isPointerLocked = () => !!(document.pointerLockElement || (document.getRootNode && document.getRootNode().pointerLockElement));

// handle pointer lock errors silently to avoid uncaught promise errors in some browsers
try {
    window.addEventListener('pointerlockerror', (ev) => {
        try { console.warn('pointerlockerror suppressed'); } catch(_){}
    });
} catch(_) {}

// suppress specific unhandled promise rejections (pointer lock related) to avoid stopping the game
try {
    window.addEventListener('unhandledrejection', (ev) => {
        try {
            const r = ev.reason;
            if (!r) return;
            const msg = (r && r.message) ? r.message : String(r);
            // jika SecurityError terkait pointer lock -> cegah default dan log ringan
            if ((r.name && r.name === 'SecurityError') || /pointer lock|exited the lock/i.test(msg)) {
                try { ev.preventDefault(); } catch(_){}
                console.warn('Suppressed unhandled rejection (pointer lock/security):', msg);
            }
        } catch(_) {}
    });
} catch(_) {}

// difficulty select removed: difficulty now auto-adjusts in-game
const sensitivityEl = document.getElementById('sensitivity');
const bloomEl = document.getElementById('bloom');
const startWeaponEl = document.getElementById('startWeapon');
const volMasterEl = document.getElementById('volMaster');
const volMusicEl = document.getElementById('volMusic');
const volSfxEl = document.getElementById('volSfx');
const btnRestartGO = document.getElementById('btnRestartGO');
const btnMenuGO = document.getElementById('btnMenuGO');
// howToBtn removed from markup - no DOM reference

const tabStart = document.getElementById('tabStart');
const tabOptions = document.getElementById('tabOptions');
const tabAbout = document.getElementById('tabAbout');
const panelStart = document.getElementById('panelStart');
const panelOptions = document.getElementById('panelOptions');
const panelAbout = document.getElementById('panelAbout');
// crosshair controls
const reticleX = document.getElementById('reticleX');
const reticleY = document.getElementById('reticleY');
const reticleSize = document.getElementById('reticleSize');
const reticleColor = document.getElementById('reticleColor');
const reticleReset = document.getElementById('reticleReset');
const reticleLock = document.getElementById('reticleLock');
const aimAssistEl = document.getElementById('aimAssist');
const presetRealisticBtn = document.getElementById('presetRealistic');
// new graphics/audio controls
const gfxPresetEl = document.getElementById('gfxPreset');
const fovEl = document.getElementById('fov');
const renderScaleEl = document.getElementById('renderScale');
const fogEl = document.getElementById('fog');
const drawDistEl = document.getElementById('drawDist');
const particlesEl = document.getElementById('particles');
const soundtrackEl = document.getElementById('soundtrack');
const menuSoundtrackEl = document.getElementById('menuSoundtrack');
const gameSoundtrackEl = document.getElementById('gameSoundtrack');
const fpsEl = document.getElementById('fps');

let game = new Game();

// local WebAudio fallback for simple SFX (used if game.audio fails)
let audioUnlocked = false;
let localAudioCtx = null;
function createLocalAudioCtx(){
    try {
        if (localAudioCtx) return localAudioCtx;
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        localAudioCtx = new C();
        return localAudioCtx;
    } catch(_) { return null; }
}
function playTone(freq = 660, duration = 0.06, volume = 0.08){
    try {
        const ctx = createLocalAudioCtx();
        if (!ctx) return;
        // resume if suspended
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') { ctx.resume().catch(()=>{}); }
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        g.gain.value = volume;
        o.connect(g); g.connect(ctx.destination);
        const now = ctx.currentTime;
        o.start(now);
        g.gain.setValueAtTime(volume, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + duration);
        o.stop(now + duration + 0.02);
    } catch(_){}
}

function tryUnlockAudio(){
    try {
        if (audioUnlocked) return true;
        // try engine first
        try { if (game && game.audio && typeof game.audio.ensureCtx === 'function') game.audio.ensureCtx(); } catch(_){ }
        // create local ctx as fallback and play near-silent tone
        try { createLocalAudioCtx(); playTone(220, 0.02, 0.0005); } catch(_){ }
        audioUnlocked = true;
        return true;
    } catch(_) { return false; }
}
// try unlock on first user click anywhere (one-shot)
document.body.addEventListener('click', ()=>{ tryUnlockAudio(); }, { once: true, passive: true });

// Project uses full online streaming and synth fallback; do not attempt to load local /assets files.
// Preload synth fallbacks then start menu music.
(async () => {
    try {
        const sampleNames = ['gunshot','explosion','hit','footstep','bgm_loop','pick','pause','resume'];
        for (const name of sampleNames) {
            try { if (!game.audio._samples[name]) { game.audio.synthesizeSample(name); } } catch(_) { /* ignore */ }
        }
        try { game.audio.startMenuBgm(); } catch(_) {}
    } catch (_) { try { game.audio.startMenuBgm(); } catch(_) {} }
})();

// load saved soundtrack preferences (localStorage) dan terapkan ke UI
try {
    const savedMenu = localStorage.getItem('menuSoundtrack');
    const savedGame = localStorage.getItem('gameSoundtrack');
    if (menuSoundtrackEl && savedMenu) menuSoundtrackEl.value = savedMenu;
    if (gameSoundtrackEl && savedGame) gameSoundtrackEl.value = savedGame;
    // set initial audio mode to menu soundtrack
    try { if (menuSoundtrackEl) game.audio.setSoundtrackMode(menuSoundtrackEl.value); } catch(_) {}
} catch(_) {}

// lightweight profiler overlay (aktif jika ?profile=1 di URL)
function initProfilerOverlay(){
    const el = document.createElement('div');
    el.id = 'profilerOverlay';
    el.style.position = 'fixed'; el.style.left='8px'; el.style.top='8px'; el.style.padding='6px 8px'; el.style.background='rgba(0,0,0,0.6)'; el.style.color='#fff'; el.style.fontFamily='monospace'; el.style.fontSize='12px'; el.style.zIndex='9999'; el.style.borderRadius='6px';
    el.innerHTML = 'FPS: --\nFrame: --ms\nGC: --';
    document.body.appendChild(el);
    let last = performance.now(); let frames=0; let acc=0; let lastMem = performance.memory ? performance.memory.usedJSHeapSize : 0;
    function tick(){
        const now = performance.now(); const dt = now - last; last = now; frames++; acc += dt;
        if (acc >= 500){ const fps = Math.round((frames/(acc/1000))); const ms = (acc/frames).toFixed(1); let gc = 'n/a'; try { if (performance.memory) { const used = performance.memory.usedJSHeapSize; gc = Math.round((used - lastMem)/1024); lastMem = used; } } catch(_){} el.innerText = `FPS: ${fps}\nFrame: ${ms} ms\nHeapDelta: ${gc} KB`; frames=0; acc=0; }
        requestAnimationFrame(tick);
    }
    tick();
}

if (typeof window !== 'undefined' && window.location && window.location.search.indexOf('profile=1') !== -1){ try { initProfilerOverlay(); } catch(_) {} }

function tryRequestPointerLock(){
    try {
        const canvas = game?.renderer?.domElement;
        if (!canvas) return;
        if (!isPointerLocked()) {
            try {
                // Some browsers implement requestPointerLock returning a Promise — handle rejection to avoid uncaught errors
                const res = canvas.requestPointerLock && canvas.requestPointerLock();
                if (res && typeof res.then === 'function') {
                    res.catch(()=>{});
                }
            } catch(e) {
                // some browsers may still throw synchronously
            }
        }
    } catch(_) { /* ignore */ }
}

function switchTab(tab){
	for (const el of [tabStart, tabOptions, tabAbout]) el?.classList.remove('active');
	for (const el of [panelStart, panelOptions, panelAbout]) el?.classList.remove('show');
	if (tab === 'start') { tabStart.classList.add('active'); panelStart.classList.add('show'); }
	if (tab === 'options') { tabOptions.classList.add('active'); panelOptions.classList.add('show'); }
	if (tab === 'about') { tabAbout.classList.add('active'); panelAbout.classList.add('show'); }
}

tabStart?.addEventListener('click', ()=>{ try { game.audio.menuClick(); } catch(_) {}; switchTab('start'); });

tabOptions?.addEventListener('click', ()=>{ try { game.audio.menuClick(); } catch(_) {}; switchTab('options'); });

tabAbout?.addEventListener('click', ()=>{ try { game.audio.menuClick(); } catch(_) {}; switchTab('about'); });

function bindVolumes(){
	if (volMasterEl) volMasterEl.addEventListener('input', e=>{ try { game.audio.setMasterVolume(parseFloat(e.target.value)); } catch(_) {} });
	if (volMusicEl) volMusicEl.addEventListener('input', e=>{ try { game.audio.setMusicVolume(parseFloat(e.target.value)); } catch(_) {} });
	if (volSfxEl) volSfxEl.addEventListener('input', e=>{ try { game.audio.setSfxVolume(parseFloat(e.target.value)); } catch(_) {} });
	// crosshair bindings
	const cross = document.getElementById('crosshair');
	if (reticleX) reticleX.addEventListener('input', e=>{ const dx=parseInt(e.target.value,10)||0; cross.style.marginLeft = dx+'px'; });
	if (reticleY) reticleY.addEventListener('input', e=>{ const dy=parseInt(e.target.value,10)||0; cross.style.marginTop = dy+'px'; });
	if (reticleSize) reticleSize.addEventListener('input', e=>{ const s=parseInt(e.target.value,10)||6; cross.style.width = s+'px'; cross.style.height = s+'px'; });
	if (reticleColor) reticleColor.addEventListener('input', e=>{ cross.style.background = e.target.value; boxShadowDot(cross, e.target.value); });
	if (reticleReset) reticleReset.addEventListener('click', ()=>{ if(reticleX) reticleX.value=0; if(reticleY) reticleY.value=0; if(reticleSize) reticleSize.value=6; if(reticleColor) reticleColor.value='#ffffff'; cross.style.marginLeft='0px'; cross.style.marginTop='0px'; cross.style.width='6px'; cross.style.height='6px'; cross.style.background='#fff'; boxShadowDot(cross, '#ffffff'); });
	if (reticleLock) reticleLock.addEventListener('change', e=>{
		if (e.target.checked){ if(reticleX) reticleX.value=0; if(reticleY) reticleY.value=0; cross.style.marginLeft='0px'; cross.style.marginTop='0px'; }
		reticleX.disabled = e.target.checked; reticleY.disabled = e.target.checked;
	});
	if (aimAssistEl) aimAssistEl.addEventListener('input', e=>{ const deg=parseFloat(e.target.value)||0; try { game.setAimAssistDegrees(deg); } catch(_) {} });
	if (presetRealisticBtn) presetRealisticBtn.addEventListener('click', ()=>{ applyPreset('realistic'); });
    const presetCompetitiveBtn = document.getElementById('presetCompetitive');
    const presetPerformanceBtn = document.getElementById('presetPerformance');
    const presetCinematicBtn = document.getElementById('presetCinematic');
    if (presetCompetitiveBtn) presetCompetitiveBtn.addEventListener('click', ()=>{ applyPreset('competitive'); });
    if (presetPerformanceBtn) presetPerformanceBtn.addEventListener('click', ()=>{ applyPreset('performance'); });
    if (presetCinematicBtn) presetCinematicBtn.addEventListener('click', ()=>{ applyPreset('cinematic'); });

	// graphics & soundtrack bindings
	gfxPresetEl?.addEventListener('change', e => game.applyGraphicsPreset(e.target.value));
	fovEl?.addEventListener('input', e => game.setFov(parseInt(e.target.value,10)));
	renderScaleEl?.addEventListener('input', e => game.setRenderScale(parseFloat(e.target.value)));
	fogEl?.addEventListener('input', e => game.setFogDensity(parseFloat(e.target.value)));
	drawDistEl?.addEventListener('input', e => game.setDrawDistance(parseInt(e.target.value,10)));
	particlesEl?.addEventListener('input', e => game.setParticles(parseInt(e.target.value,10)));
	// Reduce Ambient Noise UI control intentionally removed: quiet mode is enabled by default
	// and can still be toggled with the 'N' key during play (quick toggle), so we keep
	// keyboard access but hide the checkbox from options.
	menuSoundtrackEl?.addEventListener('change', e => {
        try {
            const v = e.target.value;
            localStorage.setItem('menuSoundtrack', v);
            game.audio.setSoundtrackMode(v);
            try { game.audio.stopBgm(true); if (!(game && game.animating)) game.audio.startMenuBgm(); } catch(_) {}
        } catch(_) {}
    });
    gameSoundtrackEl?.addEventListener('change', e => {
        try {
            const v = e.target.value;
            localStorage.setItem('gameSoundtrack', v);
            // store pref; actual switch to game mode will occur when game starts
            try { if (game && game.animating) { game.audio.setSoundtrackMode(v); try { game.audio.stopBgm(true); game.audio.startGameBgm(); } catch(_) {} } } catch(_) {}
        } catch(_) {}
    });
	fpsEl?.addEventListener('change', e => game.setFps(parseInt(e.target.value,10)));
}

function boxShadowDot(el, color){ el.style.boxShadow = `0 0 8px ${color}AA`; }

function fade(show, then) {
	if (show) {
		transEl.classList.remove('hidden');
		transEl.classList.add('show');
		setTimeout(() => then && then(), 350);
	} else {
		transEl.classList.remove('show');
		setTimeout(() => transEl.classList.add('hidden'), 350);
	}
}

function applyMenuSettings() {
	// difficulty is auto-managed in-game; no manual UI setting
	game.setSensitivity(parseFloat(sensitivityEl.value));
	game.setBloom(parseFloat(bloomEl.value));
	game.setStartWeapon(startWeaponEl.value);
	// graphics
	if (gfxPresetEl) game.applyGraphicsPreset(gfxPresetEl.value);
	if (fovEl) game.setFov(parseInt(fovEl.value,10));
	if (renderScaleEl) game.setRenderScale(parseFloat(renderScaleEl.value));
	if (fogEl) game.setFogDensity(parseFloat(fogEl.value));
	if (drawDistEl) game.setDrawDistance(parseInt(drawDistEl.value,10));
	if (particlesEl) game.setParticles(parseInt(particlesEl.value,10));
	// soundtrack: gunakan menuSoundtrack untuk menu dan gameSoundtrack untuk game
	if (menuSoundtrackEl) { try { game.audio.setSoundtrackMode(menuSoundtrackEl.value); try { game.audio.stopBgm(true); if (!(game && game.animating)) game.audio.startMenuBgm(); } catch(_) {} } catch(_) {} }
	if (gameSoundtrackEl) { try { /* store preferred game soundtrack in audio state; actual start happens on game.start */ } catch(_) {} }
	if (fpsEl) game.setFps(parseInt(fpsEl.value,10));
}

async function startGameFlow(){
	applyMenuSettings();
	// animasi sejenak kartu menu
	fade(true, () => {
		menuEl.classList.add('hidden');
		hudEl.classList.remove('hidden');
		crosshairEl.classList.add('hidden'); // sembunyikan sampai selesai pilih skill
		try { game.audio.stopBgm(true); } catch(_) {}
		setTimeout(async ()=>{
			// pastikan overlay transisi disembunyikan sebelum menampilkan pilihan skill,
			// agar kartu Tier-S tidak tertutup oleh latar gelap.
			try { transEl.classList.remove('show'); transEl.classList.add('hidden'); } catch(_) {}
			const picked = await presentSkillSelection();
			if (picked) { try { game.applySkill(picked.key); game.audio.powerup(); } catch(_) {} }
			await runCountdown();
			// minta pointer lock setelah seleksi & countdown
			tryRequestPointerLock();
			try {
				// delay kecil sebelum memulai BGM untuk menghindari transient noise bersamaan dengan countdown beep
				setTimeout(()=>{
					try {
						if (game.audio._samples['bgm_game']) { try { game.audio.stopLoopSample('bgm_menu'); } catch(_) {}; try { game.audio.playLoopSample('bgm_game', { volume: 0.12 }); } catch(_) {} }
						else { game.audio.startGameBgm(); }
					} catch(_){}
				}, 380);
			} catch(_) {}
			// pastikan soundtrack untuk mode permainan sesuai preferensi
			try { if (gameSoundtrackEl && gameSoundtrackEl.value) { game.audio.setSoundtrackMode(gameSoundtrackEl.value); } } catch(_) {}
			// Do not force quiet mode here; AudioFX restores persisted preference on startup
			game.start();
			crosshairEl.classList.remove('hidden');
			// fallback: jika belum lock, klik kanvas lagi segera (user bisa klik sekali lagi)
			if (!isPointerLocked()) { game?.renderer?.domElement?.addEventListener('click', tryRequestPointerLock, { once: true }); }
			fade(false);
		}, 350);
	});
}

function buildCardEl(skill){
	const ICON_MAP = {
		overcharge: '🔥',
		aegis: '🛡️',
		adrenal: '⚡',
		quickdraw: '⚡',
		vigor: '❤️',
		hunker: '🏰',
		marksman: '🎯',
		sprint: '💨',
		demolisher: '💣',
		scavenger: '🧰',
		steelskin: '🛡️',
		overwatch: '👁️'
	};
	const div = document.createElement('div');
	div.className = 'skill-card fancy-skill-card';
	div.setAttribute('tabindex','0'); // allow keyboard focus
	const nameDisplay = (skill.name || 'Skill');
	const descDisplay = (skill.desc || '');
	const icon = ICON_MAP[skill.key] || '✨';

	// New structure: left column (hex, badge, icon) and right column (info)
	div.innerHTML = `
		<div class="left-col">
			<div class="hex"></div>
			<div class="badge">Tier S</div>
			<div class="icon" aria-hidden><span class="emoji">${icon}</span></div>
		</div>
		<div class="info-col">
			<h3>${nameDisplay}</h3>
			<p>${descDisplay}</p>
		</div>`;
	const chk = document.createElement('div'); chk.className = 'checkmark'; chk.innerText = '✓'; div.appendChild(chk);

	// helper to spawn small hover ring inside icon
	function spawnHoverRing(iconEl){
		try {
			if (!iconEl) return;
			let ring = iconEl.querySelector('.hover-ring');
			if (ring) return; // don't stack
			ring = document.createElement('div'); ring.className = 'hover-ring';
			iconEl.appendChild(ring);
			setTimeout(()=>{ try{ ring.remove(); }catch(_){} }, 900);
		} catch(_){}
	}
	// helper to spawn click burst
	function spawnClickBurst(iconEl){
		try {
			if (!iconEl) return;
			const burst = document.createElement('div'); burst.className = 'click-burst';
			iconEl.appendChild(burst);
			setTimeout(()=>{ try{ burst.remove(); }catch(_){} }, 700);
		} catch(_){}
	}

	// hover audio + visual (guarded by audioUnlocked)
	const iconEl = div.querySelector('.icon');
	div.addEventListener('mouseenter', ()=>{
		div.classList.add('hover');
		spawnHoverRing(iconEl);
		try { if (game && game.audio && typeof game.audio.menuHover === 'function') game.audio.menuHover(); } catch(_){ }
		// try unlock and play hover sample (playSample uses _runAfterUnlock so is safe)
		try { tryUnlockAudio(); if (game && game.audio && typeof game.audio.playSample === 'function') game.audio.playSample('pick', { volume: 0.06 }); else if (game && game.audio && typeof game.audio.beep === 'function') game.audio.beep({ frequency: 680, duration: 0.04, volume: 0.05 }); } catch(_){ }
	});
	div.addEventListener('mouseleave', ()=>{ div.classList.remove('hover'); });
	div.addEventListener('keydown', (e)=>{ if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); div.click(); } });
	div.addEventListener('click', ()=>{
		// ensure audio unlocked and play click SFX
		try { tryUnlockAudio(); } catch(_){ }
		try { if (game && game.audio && typeof game.audio.menuClick === 'function') game.audio.menuClick(); } catch(_){ }
		try { if (game && game.audio && typeof game.audio.playSample === 'function') game.audio.playSample('pick', { volume: 0.9 }); else if (game && game.audio && typeof game.audio.beep === 'function') game.audio.beep({ frequency: 880, duration: 0.06, volume: 0.12 }); } catch(_){ }
		spawnClickBurst(iconEl);
		div.classList.add('card-picked');
		div.classList.add('selected'); div.style.pointerEvents='none';
		const p = document.createElement('div'); p.className = 'pick-spark'; p.style.position='fixed';
		const r = div.getBoundingClientRect(); p.style.left = (r.left + r.width/2) + 'px'; p.style.top = (r.top + r.height/2) + 'px'; p.style.pointerEvents='none';
		p.style.width='12px'; p.style.height='12px'; p.style.borderRadius='8px'; p.style.background='radial-gradient(circle,#ffd166,#ff8a00)'; p.style.boxShadow='0 6px 18px rgba(255,170,80,0.6)'; p.style.transform='translate(-50%,-50%) scale(0.2)'; p.style.transition='transform .42s ease, opacity .42s ease'; document.body.appendChild(p);
		requestAnimationFrame(()=>{ p.style.transform='translate(-50%,-50%) scale(1.6)'; p.style.opacity='0'; });
		spawnConfetti((div.getBoundingClientRect().left + div.getBoundingClientRect().width/2), (div.getBoundingClientRect().top + div.getBoundingClientRect().height/2));
		setTimeout(()=>{ try{ p.remove(); div.style.pointerEvents='auto'; }catch(_){} resolvePick(skill); }, 420);
	});
	return div;
}

// simple DOM confetti particle effect (centerX, centerY in page coords)
function spawnConfetti(centerX, centerY, count = 12){
    try {
        const wrap = document.createElement('div'); wrap.className = 'confetti-wrap'; wrap.style.position='fixed'; wrap.style.left='0'; wrap.style.top='0'; wrap.style.width='100%'; wrap.style.height='100%'; wrap.style.pointerEvents='none'; wrap.style.zIndex = 9999;
        document.body.appendChild(wrap);
        const colors = ['#ffd166','#ff6b6b','#9ae66e','#8fb3ff','#b8f4a8','#ff8a00'];
        for (let i=0;i<count;i++){
            const el = document.createElement('div'); el.className='confetti'; el.style.position='fixed'; el.style.left = centerX + 'px'; el.style.top = centerY + 'px'; el.style.width='7px'; el.style.height='10px'; el.style.background = colors[Math.floor(Math.random()*colors.length)]; el.style.transform = `translate(-50%,-50%) rotate(${Math.random()*360}deg)`; el.style.borderRadius='2px'; el.style.opacity='1'; el.style.willChange='transform, opacity'; wrap.appendChild(el);
            const angle = (Math.random()*Math.PI*2); const speed = 100 + Math.random()*160; const vx = Math.cos(angle)*speed; const vy = - (100 + Math.random()*40);
            const rotSpeed = (Math.random()-0.5)*600;
            const lifetime = 900 + Math.random()*600;
            const start = performance.now();
            const tick = (now)=>{
                const dt = now - start; const k = dt / lifetime; if (k >= 1) { try{ el.remove(); }catch(_){} return; }
                const x = centerX + vx * k; const y = centerY + (vy * k + 380 * k * k);
                el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.transform = `translate(-50%,-50%) rotate(${rotSpeed * k}deg) scale(${1 - 0.25*k})`;
                el.style.opacity = String(1 - k);
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        }
        setTimeout(()=>{ try{ wrap.remove(); }catch(_){} }, 1600);
    } catch(_){ }
}

const S_SKILLS = [
	{ key:'overcharge', name:'Overcharge', desc:'+50% damage ke musuh.' },
	{ key:'aegis', name:'Aegis', desc:'Mendapatkan +50 Shield yang menyerap damage.' },
	{ key:'adrenal', name:'Adrenal Surge', desc:'+35% gerak & +25% fire rate.' },
	{ key:'quickdraw', name:'Quickdraw', desc:'Reload lebih cepat & start with extra ammo.' },
	{ key:'vigor', name:'Vigor', desc:'+25 HP maksimal tambahan.' },
	{ key:'hunker', name:'Hunker', desc:'+20% damage resistance saat bersembunyi.' },
	{ key:'marksman', name:'Marksman', desc:'+40% akurasi pada jarak menengah.' },
	{ key:'sprint', name:'Sprint', desc:'+40% movement burst saat mulai lari.' },
	{ key:'demolisher', name:'Demolisher', desc:'Granat lebih kuat & 1 extra grenade.' },
	{ key:'scavenger', name:'Scavenger', desc:'Pickup ammo lebih besar saat diambil.' },
	{ key:'steelskin', name:'Steelskin', desc:'Kurangi damage critical 30%.' },
	{ key:'overwatch', name:'Overwatch', desc:'Allies mendapatkan bonus akurasi kecil.' }
];

let _resolveSkillPick = null;
function resolvePick(skill){ if (_resolveSkillPick) { const r=_resolveSkillPick; _resolveSkillPick=null; hideSkillSelect(); r(skill); } }

function hideSkillSelect(){
	if (!skillSelectEl) return;
	// restore ambient when selection screen hides
	try { if (game && game.audio && typeof game.audio.setAmbientMute === 'function') game.audio.setAmbientMute(false); } catch(_) {}
	skillSelectEl.classList.add('hidden'); skillGridEl.innerHTML='';
}
function showSkillSelect(){ if (!skillSelectEl) return; skillSelectEl.classList.remove('hidden'); }

function presentSkillSelection(){
	return new Promise((resolve)=>{
		_resolveSkillPick = resolve;
		// select 3 unique Tier-S from larger pool
		const pool = [...S_SKILLS];
		const picks = [];
		const maxPick = Math.min(3, pool.length);
		for (let i=0;i<maxPick;i++) { const idx = Math.floor(Math.random()*pool.length); picks.push(pool.splice(idx,1)[0]); }
		// ensure game is paused while showing selection
		try { game.pauseGameplay(); } catch(_) {}
		// aggressively mute ambient and subtle SFX during skill selection to avoid annoying noise
		try {
			// mute ambient layers but allow UI SFX (hover/click) by restoring sfx gate
			if (game && game.audio && typeof game.audio.setAmbientMute === 'function') {
				game.audio.setAmbientMute(true);
				try { game.audio.ensureCtx(); if (game.audio.sfxGate && game.audio.ctx) game.audio.sfxGate.gain.setValueAtTime(1.0, game.audio.ctx.currentTime); } catch(_){}
			}
		} catch(_) {}
		skillGridEl.innerHTML='';
		picks.forEach(p => skillGridEl.appendChild(buildCardEl(p)));
		showSkillSelect();
	});
}

function runCountdown(){
	return new Promise((resolve)=>{
		let n = 3; countTextEl.textContent = String(n);
		countdownEl.classList.remove('hidden');
		// try unlock audio but avoid loud menuClick during countdown
		try { tryUnlockAudio(); } catch(_) {}
		// temporarily lower SFX gate to avoid noisy SFX stacking during countdown
		try {
			if (game && game.audio && typeof game.audio.ensureCtx === 'function') {
				game.audio.ensureCtx(); const ctx = game.audio.ctx;
				if (game.audio.sfxGate && game.audio.sfxGate.gain) {
					try { game.audio.sfxGate.gain.setValueAtTime(0.18, ctx.currentTime); } catch(_){}
				}
			}
		} catch(_){ }
		// keep world paused during countdown (already paused earlier)
		const tick = () => {
			n -= 1;
			if (n <= 0) {
				try { countTextEl.textContent = ''; } catch(_) {}
				countdownEl.classList.add('hidden');
				// small SFX for go
				try { if (game && game.audio && typeof game.audio.countdownBeepStep === 'function') game.audio.countdownBeepStep(0); else game.audio.beep({ frequency: 1200, duration: 0.08, type: 'sine', volume: 0.08, decay: 0.02 }); } catch(_) {}
				// resume game after countdown
				try { game.resumeGameplay(); } catch(_) {}
				// restore SFX gate smoothly after countdown to avoid transients
				try {
					if (game && game.audio && game.audio.sfxGate && game.audio.ctx) {
						const ctx = game.audio.ctx;
						try { game.audio.sfxGate.gain.cancelScheduledValues(ctx.currentTime); } catch(_){}
						try { game.audio.sfxGate.gain.setValueAtTime(0.18, ctx.currentTime); game.audio.sfxGate.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 0.38); } catch(_){}
					}
				} catch(_){ }
				resolve();
				return;
			}
			countTextEl.textContent = String(n);
			// per-step SFX
			try { if (game && game.audio && typeof game.audio.countdownBeepStep === 'function') game.audio.countdownBeepStep(n); else game.audio.beep({ frequency: 360 + n*60, duration: 0.05, type: 'sine', volume: 0.06, decay: 0.01 }); } catch(_) {}
			// flash/bloom visual on countdown
			try { countdownEl.classList.add('flash'); setTimeout(()=>{ countdownEl.classList.remove('flash'); }, 220); } catch(_) {}
			setTimeout(tick, 1000);
		};
		setTimeout(tick, 1000);
	});
}

function renderLeaderboard(){
    if (!leaderboardEl || !game) return;
    const list = [];
    // player entry (kills)
    try { list.push({ name: 'Player', info: `Kills: ${game.player.kills || 0}` }); } catch(_) {}
    // allies (kills)
    try { for (const a of (game.world.allies||[])) { list.push({ name: a.name || 'Ally', info: `Kills: ${a.kills || 0}` }); } } catch(_) {}
    // build HTML
    let html = `<div class="menu-card"><h2>Leaderboard</h2><div class="menu-grid">`;
    for (const entry of list) { html += `<div class="pill">${entry.name}: <strong>${entry.info}</strong></div>`; }
    html += `</div></div>`;
    leaderboardEl.innerHTML = html;
}

window.addEventListener('keydown', (e)=>{
    // Ignore Tab/Escape handling when typing in input/textarea to avoid interfering with forms/chat
    try { if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'SELECT')) {
        // let input handlers process keys
        return;
    } } catch(_){ }
    if (e.code === 'Tab') { e.preventDefault(); if (leaderboardEl) { leaderboardEl.classList.remove('hidden'); renderLeaderboard(); } }
    if (e.code === 'Escape') {
        // if game running, pause and show menu
        if (game && game.animating) {
            try { game.pauseGameplay(); } catch(_) {}
            window.dispatchEvent(new Event('game:showMenu'));
        }
    }
});
window.addEventListener('keyup', (e)=>{ if (e.code === 'Tab') { e.preventDefault(); if (leaderboardEl) leaderboardEl.classList.add('hidden'); } });

// aktifkan binding kontrol pengaturan setelah elemen tersedia
bindVolumes();

// Auto particle LOD: adapt particle count berdasarkan FPS untuk menjaga performa pada perangkat rendah
(function autoParticleLOD(){
	if (!game || !game.setParticles) return;
	let frameTimes = [];
	let last = performance.now();
	function tick(){
		const now = performance.now();
		frameTimes.push(now - last);
		last = now;
		if (frameTimes.length >= 60) {
			const avg = frameTimes.reduce((a,b)=>a+b,0)/frameTimes.length;
			const fps = 1000 / Math.max(1, avg);
			frameTimes = [];
			try {
				const current = game.config && game.config.particles ? game.config.particles : 300;
				if (fps < 40 && current > 80) {
					const next = Math.max(80, Math.floor(current * 0.75));
					game.setParticles(next); if (particlesEl) particlesEl.value = String(next);
				} else if (fps > 55 && current < 1200) {
					const next = Math.min(1200, Math.floor(current * 1.15));
					game.setParticles(next); if (particlesEl) particlesEl.value = String(next);
				}
			} catch(_){}
		}
		requestAnimationFrame(tick);
	}
	requestAnimationFrame(tick);
})();

// bahasa toggle: bind setelah DOM siap
function bindLanguageToggle(){
    const langSelect = document.getElementById('langSelect');
    if (!langSelect) return;
    // default language
    try { game._lang = langSelect.value || 'id'; } catch(_) { }
    const updateLabels = (v) => {
        try {
            const mappings = {
                'score_label': { 'id':'Skor:', 'en':'Score:' },
                'allies_label': { 'id':'Sekutu:', 'en':'Allies:' },
                'logo_subtitle': { 'id':'Arena FPS ringan, cepat, dan seru langsung di browser.', 'en':'Lightweight, fast, and fun browser FPS.' },
                'tab_start': { 'id':'Mulai', 'en':'Start' },
                'tab_options': { 'id':'Pengaturan', 'en':'Options' },
                'tab_about': { 'id':'Tentang', 'en':'About' },
                'start_prompt': { 'id':'Tekan mulai untuk mempersiapkan pertempuran.', 'en':'Press start to prepare for battle.' },
                'play': { 'id':'Mulai', 'en':'Play' },
                'preset_realistic': { 'id':'Preset: Realistic', 'en':'Preset: Realistic' },
                'preset_competitive': { 'id':'Preset: Competitive', 'en':'Preset: Competitive' },
                'preset_performance': { 'id':'Preset: Performance', 'en':'Preset: Performance' },
                'preset_cinematic': { 'id':'Preset: Cinematic', 'en':'Preset: Cinematic' },
                'difficulty_auto': { 'id':'Kesulitan: Auto', 'en':'Difficulty: Auto' },
                'advanced_settings': { 'id':'Advanced Settings', 'en':'Advanced Settings' }
            };
            document.querySelectorAll('[data-i18n]').forEach(el=>{
                const key = el.getAttribute('data-i18n');
                if (mappings[key] && mappings[key][v]) el.textContent = mappings[key][v];
            });
        } catch(_){}
    };

    // initial set
    try { updateLabels(langSelect.value || 'id'); } catch(_) {}

    langSelect.addEventListener('change', (e)=>{
        const v = e.target.value || 'id';
        try { game._lang = v; } catch(_) {}
        updateLabels(v);
    });
}

// call after initial bindings
try { bindLanguageToggle(); } catch(_) {}

playBtn?.addEventListener('click', () => { try { game.audio.menuClick(); } catch(_) {}; startGameFlow(); });
restartBtn?.addEventListener('click', () => { try { game.audio.menuClick(); } catch(_) {}; window.location.reload(); });

btnRestartGO?.addEventListener('click', () => window.location.reload());
btnMenuGO?.addEventListener('click', () => {
	fade(true, () => {
		gameoverEl.classList.add('hidden');
		menuEl.classList.remove('hidden');
		restartBtn?.classList.remove('hidden');
		try { game.audio.stopBgm(true); game.audio.startMenuBgm(); } catch(_) {}
		fade(false);
	});
});

// remove howToBtn from hover-audio binding list
for (const el of [playBtn, restartBtn, btnRestartGO, btnMenuGO]) { el?.addEventListener('mouseenter', ()=>{ try { game.audio.menuHover(); } catch(_) {} }); }

// Auto-resume when regaining pointer lock
window.addEventListener('game:resumeHUD', () => {
    // If game already animating (initial start flow), just show HUD. Otherwise play resume countdown then resume game.
    if (game && game.animating) {
        hudEl.classList.remove('hidden');
        crosshairEl.classList.remove('hidden');
        return;
    }
    // ensure overlay hidden and menu hidden, then run short countdown and resume
    try { ensurePauseOverlay(); const ov = document.getElementById('pauseOverlay'); if (ov) ov.classList.add('hidden'); document.body.classList.remove('paused'); menuEl.classList.add('hidden'); hudEl.classList.remove('hidden'); crosshairEl.classList.remove('hidden'); } catch(_) {}
    runResumeCountdown();
});

// Auto-pause on window blur (unfocus)
window.addEventListener('blur', ()=>{
	try { if (game && game.animating) { game.pauseGameplay(); window.dispatchEvent(new Event('game:showMenu')); } } catch(_) {}
});

// When returning focus, keep menu visible; resume only after user starts via pointerlock / resume flow
window.addEventListener('focus', ()=>{
	// noop: user must explicitly resume via clicking/capturing pointer or pressing play
});

window.addEventListener('game:showMenu', (ev) => {
    // ensure any skill select or countdown is hidden to avoid showing cards while paused
    try { hideSkillSelect(); if (countdownEl) countdownEl.classList.add('hidden'); if (_resolveSkillPick) { _resolveSkillPick(null); _resolveSkillPick = null; } } catch(_) {}
    ensurePauseOverlay();
    // backward-compatible: jika event menge-set detail.fullMenu === false maka tampilkan hanya pause overlay ringan.
    // Default (event tanpa detail) = tampilkan full menu (sebelumnya perilaku default).
    const isLightOnly = ev && ev.detail && ev.detail.fullMenu === false;
    if (isLightOnly) {
        try {
            document.body.classList.add('paused');
            const ov = document.getElementById('pauseOverlay'); if (ov) ov.classList.remove('hidden');
            // sembunyikan panel menu lain agar kartu tidak muncul di belakang overlay
            try { if (menuEl) menuEl.classList.add('hidden'); } catch(_){}
            try { if (skillSelectEl) skillSelectEl.classList.add('hidden'); } catch(_){}
            try { if (leaderboardEl) leaderboardEl.classList.add('hidden'); } catch(_){}
        } catch(_) {}
        return;
    }
    // full menu flow
    try { document.body.classList.add('paused'); const ov = document.getElementById('pauseOverlay'); if (ov) ov.classList.remove('hidden'); } catch(_) {}
    fade(true, () => {
        menuEl.classList.remove('hidden');
        hudEl.classList.add('hidden');
        crosshairEl.classList.add('hidden');
        try { if (game && game.audio && typeof game.audio.setAmbientMute === 'function') game.audio.setAmbientMute(true); } catch(_){}
        try { if (game && game.audio && typeof game.audio.stopBgm === 'function') game.audio.stopBgm(true); } catch(_){}
        // intentionally DO NOT call startMenuBgm() to keep menu quiet
        switchTab('start');
        fade(false);
    });
});

// when game over or returning to menu, disable in-game quiet mode
window.addEventListener('game:gameOver', (e) => {
	const { score } = e.detail || { score: 0 };
	finalScoreEl.textContent = String(score);
	fade(true, () => {
		gameoverEl.classList.remove('hidden');
		hudEl.classList.add('hidden');
		crosshairEl.classList.add('hidden');
		try { if (game && game.audio && typeof game.audio.setInGameQuietMode === 'function') game.audio.setInGameQuietMode(false); game.audio.stopBgm(true); game.audio.startMenuBgm(); } catch(_) {}
		fade(false);
	});
});

function runResumeCountdown(){
    try {
        // ensure world remains paused
        if (game && game.pauseGameplay) try { game.pauseGameplay(); } catch(_) {}
        let n = 3; countTextEl.textContent = String(n);
        // hide pause overlay and show countdown
        try { const ov = document.getElementById('pauseOverlay'); if (ov) ov.classList.add('hidden'); document.body.classList.remove('paused'); } catch(_) {}
        countdownEl.classList.remove('hidden');
        // avoid loud menuClick; unlock audio quietly and lower sfx gate
        try { tryUnlockAudio(); } catch(_) {}
        try { if (game && game.audio && typeof game.audio.ensureCtx === 'function') { game.audio.ensureCtx(); const ctx = game.audio.ctx; if (game.audio.sfxGate && game.audio.sfxGate.gain) try { game.audio.sfxGate.gain.setValueAtTime(0.18, ctx.currentTime); } catch(_){} } } catch(_){}
        const tick = () => {
            n -= 1;
            if (n <= 0) {
                try { countTextEl.textContent = ''; } catch(_) {}
                countdownEl.classList.add('hidden');
                try { if (game && game.audio && typeof game.audio.countdownBeepStep === 'function') game.audio.countdownBeepStep(0); else game.audio.beep({ frequency: 1200, duration: 0.08, type: 'sine', volume: 0.08, decay: 0.02 }); } catch(_) {}
                try { if (game && game.resumeGameplay) game.resumeGameplay(); } catch(_) {}
                // restore SFX gate and delay BGM start slightly to avoid overlap
                try { if (game && game.audio && game.audio.sfxGate && game.audio.ctx) { const ctx = game.audio.ctx; try { game.audio.sfxGate.gain.cancelScheduledValues(ctx.currentTime); game.audio.sfxGate.gain.setValueAtTime(0.18, ctx.currentTime); game.audio.sfxGate.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 0.38); } catch(_){} } } catch(_){ }
                setTimeout(()=>{ try { game.audio.startGameBgm(); } catch(_){} }, 420);
                return;
            }
            countTextEl.textContent = String(n);
            try { if (game && game.audio && typeof game.audio.countdownBeepStep === 'function') game.audio.countdownBeepStep(n); else game.audio.beep({ frequency: 360 + n*80, duration: 0.06, type: 'sine', volume: 0.06, decay: 0.01 }); } catch(_) {}
            try { countdownEl.classList.add('flash'); setTimeout(()=>{ countdownEl.classList.remove('flash'); }, 220); } catch(_) {}
            setTimeout(tick, 1000);
        };
        setTimeout(tick, 1000);
    } catch(_) {}
}

// UI reactions to core game pause/resume events
window.addEventListener('game:paused', ()=>{
    try { ensurePauseOverlay(); const ov = document.getElementById('pauseOverlay'); if (ov) ov.classList.remove('hidden'); document.body.classList.add('paused'); } catch(_){ }
    try { if (game.audio._samples['pause']) game.audio.playSample('pause', { volume: 0.9 }); else game.audio.menuClick(); } catch(_){ }
    // duck bgm to avoid loud transitions and reduce noise
    try { if (game && game.audio && typeof game.audio.duckBgm === 'function') game.audio.duckBgm(0.35, 160); } catch(_) {}
});
window.addEventListener('game:resumed', ()=>{
    try { const ov = document.getElementById('pauseOverlay'); if (ov) ov.classList.add('hidden'); document.body.classList.remove('paused'); } catch(_){ }
    try { if (game.audio._samples['resume']) game.audio.playSample('resume', { volume: 0.9 }); else try { if (!audioUnlocked) tryUnlockAudio(); if (audioUnlocked) playTone(900, 0.06, 0.12); } catch(_){ } } catch(_){ }
    // restore ambient & bgm after resume
    try { if (game && game.audio && typeof game.audio.setAmbientMute === 'function') game.audio.setAmbientMute(false); } catch(_){}
    try { if (game && game.audio && typeof game.audio.restoreBgm === 'function') game.audio.restoreBgm(300); } catch(_) {}
});

// quick toggle for in-game quiet mode (press 'N') to reduce ambient hiss during noisy sessions
window.addEventListener('keydown', (e) => {
    try {
        if (e.code === 'KeyN') {
            if (game && game.audio && typeof game.audio.setInGameQuietMode === 'function') {
                const next = !game.audio._inGameQuietMode;
                try { game.audio.setInGameQuietMode(next); console.log('InGameQuietMode ->', next); } catch(_){ }
            }
        }
        // Hold 'M' to instantly mute ambient (aggressive), release to restore
        if (e.code === 'KeyM') {
            try { if (game && game.audio && typeof game.audio.setAmbientMute === 'function') game.audio.setAmbientMute(true); } catch(_){}
        }
    } catch(_){}
});
window.addEventListener('keyup', (e) => {
    try { if (e.code === 'KeyM') { if (game && game.audio && typeof game.audio.setAmbientMute === 'function') game.audio.setAmbientMute(false); } } catch(_){}
});

function applyPreset(name){
    // apply game settings and sync UI controls when present
    switch(name){
        case 'competitive':
            game.setSensitivity(0.95); if (sensitivityEl) sensitivityEl.value = '0.95';
            game.setBloom(0.35); if (bloomEl) bloomEl.value = '0.35';
            game.setFov(80); if (fovEl) fovEl.value = '80';
            game.setRenderScale(1.0); if (renderScaleEl) renderScaleEl.value = '1';
            game.setParticles(300); if (particlesEl) particlesEl.value = '300';
            break;
        case 'performance':
            game.setSensitivity(0.8); if (sensitivityEl) sensitivityEl.value = '0.8';
            game.setBloom(0.25); if (bloomEl) bloomEl.value = '0.25';
            game.setFov(70); if (fovEl) fovEl.value = '70';
            game.setRenderScale(0.75); if (renderScaleEl) renderScaleEl.value = '0.75';
            game.setParticles(120); if (particlesEl) particlesEl.value = '120';
            break;
        case 'cinematic':
            game.setSensitivity(0.65); if (sensitivityEl) sensitivityEl.value = '0.65';
            game.setBloom(0.9); if (bloomEl) bloomEl.value = '0.9';
            game.setFov(66); if (fovEl) fovEl.value = '66';
            game.setRenderScale(1.1); if (renderScaleEl) renderScaleEl.value = '1.1';
            break;
        default: // realistic
            game.setSensitivity(0.7); if (sensitivityEl) sensitivityEl.value = '0.7';
            game.setBloom(0.5); if (bloomEl) bloomEl.value = '0.5';
            if (aimAssistEl) { aimAssistEl.value = '1.5'; game.setAimAssistDegrees(1.5); }
            if (reticleLock) { reticleLock.checked = true; reticleX.disabled = true; reticleY.disabled = true; }
            const cross = document.getElementById('crosshair'); if (cross) { cross.style.marginLeft='0px'; cross.style.marginTop='0px'; }
            if (startWeaponEl) { startWeaponEl.value = 'pistol'; game.setStartWeapon('pistol'); }
            if (volMasterEl) { volMasterEl.value='1'; game.audio.setMasterVolume(1); }
            if (volMusicEl) { volMusicEl.value='0.12'; game.audio.setMusicVolume(0.12); }
            if (volSfxEl) { volSfxEl.value='1'; game.audio.setSfxVolume(1); }
            break;
    }
    try { game.audio.menuClick(); } catch(_){}
}

// Debug overlay: toggle with backquote (`) to show internal state
function initDebugOverlay(){
    if (document.getElementById('debugOverlay')) return;
    const el = document.createElement('div'); el.id = 'debugOverlay';
    el.style.position = 'fixed'; el.style.right = '8px'; el.style.bottom = '8px'; el.style.padding = '8px 10px'; el.style.background = 'rgba(0,0,0,0.6)'; el.style.color = '#fff'; el.style.fontFamily = 'monospace'; el.style.fontSize = '12px'; el.style.zIndex = '99999'; el.style.borderRadius = '8px'; el.style.maxWidth = '320px'; el.style.whiteSpace = 'pre-wrap'; el.style.display = 'none'; document.body.appendChild(el);
    let updater = null;
    function show(){ el.style.display = 'block'; updater = setInterval(()=>{
        try{
            const s = (game && game._playTimeSeconds) ? game._playTimeSeconds : 0;
            const ammo = (game && game.player) ? `${game.player.ammoInMag || 0}/${game.player.ammoReserve || 0}` : 'n/a';
            const diff = (game && game.config) ? game.config.difficulty : 'n/a';
            const ecount = (game && game.world) ? game.world.enemies.length : 'n/a';
            const acount = (game && game.world) ? game.world.allies.length : 'n/a';
            const rot = (game && game._inGameMusic) ? Math.round((game._inGameMusic.nextChangeAt||0) - performance.now()) : 0;
            el.textContent = `Time: ${s}s\nAmmo: ${ammo}\nDifficulty: ${diff}\nEnemies: ${ecount}  Allies: ${acount}\nMusic change in: ${rot>0?Math.ceil(rot/1000)+'s':'soon'}`;
        } catch(_){}
    }, 250); }
    function hide(){ el.style.display = 'none'; if (updater) { clearInterval(updater); updater = null; } }
    window.addEventListener('keydown', (e)=>{ try{ if (e.key === '`' || e.code === 'Backquote') { e.preventDefault(); if (el.style.display === 'none') show(); else hide(); } } catch(_){} });
}
try { initDebugOverlay(); } catch(_){}

// Inject compact icons into option labels for better affordance
(function injectOptionIcons(){
    try {
        const mapping = {
            'sensitivity': '🎯', 'bloom':'✨', 'startWeapon':'🔫', 'volMaster':'🔊', 'volMusic':'🎵', 'volSfx':'🔉', 'fov':'🔭', 'renderScale':'🖥️', 'fog':'🌫️', 'drawDist':'🌁', 'particles':'✨', 'reticleSize':'🎯'
        };
        Object.keys(mapping).forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const lab = el.closest('label');
            if (lab && !lab.querySelector('.opt-icon')) {
                const span = document.createElement('span'); span.className='opt-icon'; span.innerText = mapping[id]; lab.insertBefore(span, lab.firstChild);
            }
        });
    } catch(_){}
})();

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

// helper untuk cek lock status (MDN: Document.pointerLockElement)
const isPointerLocked = () => !!(document.pointerLockElement || (document.getRootNode && document.getRootNode().pointerLockElement));

const difficultyEl = document.getElementById('difficulty');
const sensitivityEl = document.getElementById('sensitivity');
const bloomEl = document.getElementById('bloom');
const startWeaponEl = document.getElementById('startWeapon');
const volMasterEl = document.getElementById('volMaster');
const volMusicEl = document.getElementById('volMusic');
const volSfxEl = document.getElementById('volSfx');
const btnRestartGO = document.getElementById('btnRestartGO');
const btnMenuGO = document.getElementById('btnMenuGO');
const howToBtn = document.getElementById('howToBtn');

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
const fpsEl = document.getElementById('fps');

let game = new Game();
// Start menu bgm
try { game.audio.startMenuBgm(); } catch(_) {}

function tryRequestPointerLock(){
	try {
		const canvas = game?.renderer?.domElement;
		if (!canvas) return;
		if (!isPointerLocked()) { canvas.requestPointerLock(); }
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
	if (presetRealisticBtn) presetRealisticBtn.addEventListener('click', ()=>{
		// nilai realistis default
		if (sensitivityEl) sensitivityEl.value = 0.7; game.setSensitivity(0.7);
		if (bloomEl) bloomEl.value = 0.5; game.setBloom(0.5);
		if (aimAssistEl) aimAssistEl.value = 1.5; game.setAimAssistDegrees(1.5);
		if (reticleLock) reticleLock.checked = true; reticleX.disabled = true; reticleY.disabled = true;
		const cross = document.getElementById('crosshair'); cross.style.marginLeft='0px'; cross.style.marginTop='0px';
		if (startWeaponEl) startWeaponEl.value = 'pistol'; game.setStartWeapon('pistol');
		if (volMasterEl) { volMasterEl.value=1; game.audio.setMasterVolume(1); }
		if (volMusicEl) { volMusicEl.value=0.12; game.audio.setMusicVolume(0.12); }
		if (volSfxEl) { volSfxEl.value=1; game.audio.setSfxVolume(1); }
		alert('Preset Realistic diterapkan: sensitivitas 0.7, bloom 0.5, aim assist 1.5°, crosshair terkunci di tengah.');
	});

	// graphics & soundtrack bindings
	gfxPresetEl?.addEventListener('change', e => game.applyGraphicsPreset(e.target.value));
	fovEl?.addEventListener('input', e => game.setFov(parseInt(e.target.value,10)));
	renderScaleEl?.addEventListener('input', e => game.setRenderScale(parseFloat(e.target.value)));
	fogEl?.addEventListener('input', e => game.setFogDensity(parseFloat(e.target.value)));
	drawDistEl?.addEventListener('input', e => game.setDrawDistance(parseInt(e.target.value,10)));
	particlesEl?.addEventListener('input', e => game.setParticles(parseInt(e.target.value,10)));
	soundtrackEl?.addEventListener('change', e => { try { game.audio.setSoundtrackMode(e.target.value); } catch(_) {} });
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
	game.setDifficulty(difficultyEl.value);
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
	// soundtrack
	if (soundtrackEl) game.audio.setSoundtrackMode(soundtrackEl.value);
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
			const picked = await presentSkillSelection();
			if (picked) { try { game.applySkill(picked.key); game.audio.powerup(); } catch(_) {} }
			await runCountdown();
			// minta pointer lock setelah seleksi & countdown
			tryRequestPointerLock();
			try { game.audio.startGameBgm(); } catch(_) {}
			game.start();
			crosshairEl.classList.remove('hidden');
			// fallback: jika belum lock, klik kanvas lagi segera (user bisa klik sekali lagi)
			if (!isPointerLocked()) { game?.renderer?.domElement?.addEventListener('click', tryRequestPointerLock, { once: true }); }
			fade(false);
		}, 350);
	});
}

function buildCardEl(skill){
	const div = document.createElement('div');
	div.className = 'skill-card';
	div.innerHTML = `<div class="hex"></div><span class="rar r-S">Tier S</span><div class="inner"><h3>${skill.name}</h3><p>${skill.desc}</p></div>`;
	div.addEventListener('mouseenter', ()=>{ try { game.audio.menuHover(); } catch(_) {} });
	div.addEventListener('click', ()=>{ try { game.audio.menuClick(); } catch(_) {}; resolvePick(skill); });
	return div;
}

const S_SKILLS = [
	{ key:'overcharge', name:'Overcharge', desc:'+50% damage ke musuh.' },
	{ key:'aegis', name:'Aegis', desc:'Mendapatkan +50 Shield yang menyerap damage.' },
	{ key:'adrenal', name:'Adrenal Surge', desc:'+35% gerak & +25% fire rate.' }
];

let _resolveSkillPick = null;
function resolvePick(skill){ if (_resolveSkillPick) { const r=_resolveSkillPick; _resolveSkillPick=null; hideSkillSelect(); r(skill); } }

function hideSkillSelect(){ if (!skillSelectEl) return; skillSelectEl.classList.add('hidden'); skillGridEl.innerHTML=''; }
function showSkillSelect(){ if (!skillSelectEl) return; skillSelectEl.classList.remove('hidden'); }

function presentSkillSelection(){
	return new Promise((resolve)=>{
		_resolveSkillPick = resolve;
		// generate 3 unik
		const pool = [...S_SKILLS];
		const picks = [];
		for (let i=0;i<3;i++) { const idx = Math.floor(Math.random()*pool.length); picks.push(pool.splice(idx,1)[0]); }
		skillGridEl.innerHTML='';
		picks.forEach(p => skillGridEl.appendChild(buildCardEl(p)));
		showSkillSelect();
	});
}

function runCountdown(){
	return new Promise((resolve)=>{
		let n = 3; countTextEl.textContent = String(n);
		countdownEl.classList.remove('hidden');
		const timer = setInterval(()=>{
			n -= 1;
			if (n <= 0) {
				clearInterval(timer);
				countdownEl.classList.add('hidden');
				resolve();
				return;
			}
			countTextEl.textContent = String(n);
		}, 1000);
	});
}

// aktifkan binding kontrol pengaturan setelah elemen tersedia
bindVolumes();

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

howToBtn?.addEventListener('click', () => { try { game.audio.menuClick(); } catch(_) {}; alert('Tips: Gunakan 1 untuk pistol, 2 untuk granat. Pickup ammo pistol (cyan) & granat (hijau) tersebar di arena. WASD, Shift, Space, R untuk reload.'); });

for (const el of [playBtn, restartBtn, btnRestartGO, btnMenuGO, howToBtn]) { el?.addEventListener('mouseenter', ()=>{ try { game.audio.menuHover(); } catch(_) {} }); }

// Auto-resume when regaining pointer lock
window.addEventListener('game:resumeHUD', () => {
	hudEl.classList.remove('hidden');
	crosshairEl.classList.remove('hidden');
});

window.addEventListener('game:showMenu', () => {
	fade(true, () => {
		menuEl.classList.remove('hidden');
		hudEl.classList.add('hidden');
		crosshairEl.classList.add('hidden');
		try { game.audio.stopBgm(true); game.audio.startMenuBgm(); } catch(_) {}
		switchTab('start');
		fade(false);
	});
});

window.addEventListener('game:gameOver', (e) => {
	const { score } = e.detail || { score: 0 };
	finalScoreEl.textContent = String(score);
	fade(true, () => {
		gameoverEl.classList.remove('hidden');
		hudEl.classList.add('hidden');
		crosshairEl.classList.add('hidden');
		try { game.audio.stopBgm(true); game.audio.startMenuBgm(); } catch(_) {}
		fade(false);
	});
});

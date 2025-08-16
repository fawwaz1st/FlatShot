export class HUD {
	constructor() {
		// cache DOM references dengan fallback aman
		this.hpEl = document.getElementById('hp') || null;
		this.hpBar = document.getElementById('hpBar') || null;
		this.ammoEl = document.getElementById('ammo') || null;
		this.reserveEl = document.getElementById('reserve') || null;
		this.ammoBar = document.getElementById('ammoBar') || null;
		this.ammoWrap = document.getElementById('ammoWrap') || null;
		this.gWrap = document.getElementById('gWrap') || null;
		this.scoreEl = document.getElementById('score') || null;
		this.alliesEl = document.getElementById('allies') || null;
		this.playTimeEl = document.getElementById('playTime') || null;
		this.waveEl = document.getElementById('wave') || null;
		this.waveTimerEl = document.getElementById('waveTimer') || null;
		this._gameRef = this._gameRef || null;
		// internal cache to avoid DOM churn
		this._lastGrenades = -1;
	}

	// helper lokalization: menerima code bahasa pada game._lang
	localize(game, key) {
		const dict = {
			'id': {
				'wave_fmt': (w,e) => `Gelombang: ${w} — Musuh: ${e}`,
				'timer_fmt': (s) => (s>0?`Mulai dalam: ${s}s` : '')
			},
			'en': {
				'wave_fmt': (w,e) => `Wave ${w} — Enemies: ${e}`,
				'timer_fmt': (s) => (s>0?`Next in: ${s}s` : '')
			}
		};
		const lang = (game && game._lang) ? game._lang : 'id';
		return (dict[lang] && dict[lang][key]) ? dict[lang][key] : ((k)=>'');
	}

	setHP(value) {
		const v = Number.isFinite(Number(value)) ? Number(value) : 0;
		if (this.hpEl) this.hpEl.textContent = String(v);
		if (this.hpBar) {
			const pct = Math.max(0, Math.min(1, v / 100));
			this.hpBar.style.width = (pct * 100) + '%';
		}
	}

	setAmmo(inMag, reserve, magSize) {
		const im = Number.isFinite(Number(inMag)) ? Number(inMag) : 0;
		const r = Number.isFinite(Number(reserve)) ? Number(reserve) : 0;
		const mSize = Number.isFinite(Number(magSize)) && magSize > 0 ? Number(magSize) : 1;
		// primary elements
		if (this.ammoEl) try { this.ammoEl.textContent = String(im); } catch(_) {}
		if (this.reserveEl) try { this.reserveEl.textContent = String(r); } catch(_) {}
		// if ammoWrap exists and is used as combined text like '15/60', ensure outer wrapper textContent updated
		if (this.ammoWrap) {
			try {
				// if ammoWrap contains child nodes #ammo and #reserve, update them specifically
				const a = this.ammoWrap.querySelector('#ammo');
				const rr = this.ammoWrap.querySelector('#reserve');
				if (a) a.textContent = String(im);
				if (rr) rr.textContent = String(r);
				// also ensure outer wrapper has fallback combined text for older HUDs
				if (!a && !rr) this.ammoWrap.textContent = `${im}/${r}`;
			} catch(_) { try { this.ammoWrap.textContent = `${im}/${r}`; } catch(_){} }
		} else {
			// no wrapper: try to combine into ammoEl if reserveEl missing
			if (this.ammoEl && !this.reserveEl) {
				try { this.ammoEl.textContent = `${im}/${r}`; } catch(_) { this.ammoEl.textContent = String(im); }
			}
		}
		// bar fill calculation
		if (this.ammoBar) {
			try { const pct = Math.max(0, Math.min(1, im / Math.max(1, mSize))); this.ammoBar.style.width = (pct * 100) + '%'; } catch(_) {}
		}
	}

	setScore(score) {
		if (this.scoreEl) this.scoreEl.textContent = String(Number(score) || 0);
	}

	setGrenades(count) {
		const n = Math.max(0, Number(count) || 0);
		if (!this.gWrap) return;
		if (this._lastGrenades === n) return;
		this._lastGrenades = n;
		this.gWrap.innerHTML = '';
		if (n <= 0) return;
		const frag = document.createDocumentFragment();
		for (let i=0;i<n;i++){ const d = document.createElement('div'); d.className='dot'; frag.appendChild(d); }
		this.gWrap.appendChild(frag);
	}

	setAllies(count) {
		if (this.alliesEl) this.alliesEl.textContent = String(Number(count) || 0);
	}

	setPlayTime(seconds) {
		if (!this.playTimeEl) return;
		const s = Math.max(0, Math.floor(seconds || 0));
		const mm = Math.floor(s / 60);
		const ss = s % 60;
		const formatted = `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
		try { this.playTimeEl.textContent = formatted; } catch(_) { try { this.playTimeEl.innerText = formatted; } catch(_){} }
		// also attempt to update possible parent pill text (for HUDs that render combined label)
		try { const pill = this.playTimeEl.closest && this.playTimeEl.closest('.pill'); if (pill && pill.querySelector('.pill-label')) { /* keep label intact */ } } catch(_) {}
	}

	setWeapon(name, icon){
		try { const wp = document.getElementById('weaponPill'); if (!wp) return; const wn = wp.querySelector('#weaponName'); const wi = wp.querySelector('#weaponIcon'); if (wn) wn.textContent = name || ''; if (wi && icon) wi.textContent = icon; } catch(_){}
	}

	setSkillCooldown(seconds){
		try { const el = document.getElementById('skillCooldown'); if (!el) return; if (!seconds || seconds <= 0) { el.textContent = ''; el.classList.remove('cooling'); return; } el.textContent = `${Math.ceil(seconds)}s`; el.classList.add('cooling'); } catch(_){}
	}

	setWaveInfo(waveNumber, enemiesRemaining) {
		if (!this.waveEl) return;
		const wnum = Number.isFinite(Number(waveNumber)) ? Number(waveNumber) : 0;
		const erem = Number.isFinite(Number(enemiesRemaining)) ? Number(enemiesRemaining) : 0;
		try {
			const fmt = this.localize(this._gameRef, 'wave_fmt');
			if (typeof fmt === 'function') this.waveEl.textContent = fmt(wnum, erem);
			else this.waveEl.textContent = `Wave ${wnum} — Enemies: ${erem}`;
		} catch(_) { this.waveEl.textContent = `Wave ${wnum} — Enemies: ${erem}`; }
		try { this.waveEl.dataset.wave = String(wnum); this.waveEl.dataset.enemies = String(erem); } catch(_){ }
	}

	setWaveTimer(seconds) {
		if (!this.waveTimerEl) return;
		const s = Math.max(0, Math.ceil(seconds));
		try {
			const fmt = this.localize(this._gameRef, 'timer_fmt');
			if (typeof fmt === 'function') this.waveTimerEl.textContent = fmt(s);
			else this.waveTimerEl.textContent = s > 0 ? `Mulai dalam: ${s}s` : '';
		} catch(_) { this.waveTimerEl.textContent = s > 0 ? `Mulai dalam: ${s}s` : ''; }
	}
} 
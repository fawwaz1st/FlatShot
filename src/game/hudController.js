export function attachHudController(game){
	try{
		// internal flag sudah diinisialisasi di constructor, jaga fallback
		if (typeof game._hudDirty === 'undefined') game._hudDirty = false;

		// cache DOM references sekali saat controller dipasang (optimisasi)
		const cached = {
			hpBar: typeof document !== 'undefined' ? document.getElementById('hpBar') : null,
			ammoWrap: typeof document !== 'undefined' ? document.getElementById('ammoWrap') : null,
			gWrap: typeof document !== 'undefined' ? document.getElementById('gWrap') : null,
			scoreEl: typeof document !== 'undefined' ? document.getElementById('score') : null,
			alliesEl: typeof document !== 'undefined' ? document.getElementById('allies') : null,
			playTimeEl: typeof document !== 'undefined' ? document.getElementById('playTime') : null
		};
		// cache ammo child nodes if present to avoid query setiap frame
		if (cached.ammoWrap) {
			cached._ammoChild = {
				a: cached.ammoWrap.querySelector('#ammo'),
				r: cached.ammoWrap.querySelector('#reserve')
			};
		} else cached._ammoChild = null;
		// track last grenades count to avoid DOM churn
		let _lastGrenades = -1;

		game.markHudDirty = function(){ this._hudDirty = true; };

		game.flushHudIfDirty = function(){
			if (!this._hudDirty) return;
			try { this.updateHUD(); } catch(_) {}
			this._hudDirty = false;
		};

		// updateHUD terpusat: delegasikan ke HUD instance bila ada, fallback ke cached DOM
		game.updateHUD = function(){
			try {
				// delegasikan update teks ke instance HUD bila tersedia (lebih terstruktur)
				if (this.hud) {
					try { if (typeof this.hud.setHP === 'function') this.hud.setHP(Math.max(0, Math.floor(this.player.health))); } catch(_) {}
					try { if (typeof this.hud.setAmmo === 'function') this.hud.setAmmo(this.player.ammoInMag, this.player.ammoReserve, this.player.magSize); } catch(_) {}
					try { if (typeof this.hud.setScore === 'function') this.hud.setScore(this.world.score); } catch(_) {}
					try { if (typeof this.hud.setPlayTime === 'function') this.hud.setPlayTime(this._playTimeSeconds || 0); } catch(_) {}
				}

				// fallback DOM updates (menggunakan cache untuk performa)
				const hpPct = Math.max(0, Math.min(1, this.player.health / 100));
				const ammoPct = Math.max(0, Math.min(1, this.player.ammoInMag / Math.max(1, this.player.magSize)));
				if (cached.hpBar) cached.hpBar.style.width = (hpPct * 100) + '%';
				if (cached.ammoBar) cached.ammoBar.style.width = (ammoPct * 100) + '%';

				// update ammo text jika anaknya ada
				if (cached._ammoChild) {
					if (cached._ammoChild.a) cached._ammoChild.a.textContent = String(this.player.ammoInMag);
					if (cached._ammoChild.r) cached._ammoChild.r.textContent = String(this.player.ammoReserve);
				}

				// update grenades: hanya render ulang jika berubah
				if (cached.gWrap) {
					const gcount = Math.max(0, Number(this.player.grenades) || 0);
					if (gcount !== _lastGrenades) {
						_lastGrenades = gcount;
						cached.gWrap.innerHTML = '';
						if (gcount > 0) {
							const frag = document.createDocumentFragment();
							for (let i=0;i<gcount;i++) { const d=document.createElement('div'); d.className='dot'; frag.appendChild(d); }
							cached.gWrap.appendChild(frag);
						}
					}
				}

				if (cached.scoreEl) cached.scoreEl.textContent = String(this.world.score);
				if (cached.alliesEl) cached.alliesEl.textContent = (Array.isArray(this.world.allies) ? this.world.allies.length : 0).toString();

				// fallback: update play time text (MM:SS)
				if (cached.playTimeEl) {
					const s = Math.max(0, Math.floor(this._playTimeSeconds || 0));
					const mm = Math.floor(s/60); const ss = s%60;
					cached.playTimeEl.textContent = (mm<10?('0'+mm):mm) + ':' + (ss<10?('0'+ss):ss);
				}

				// refresh chat ally list UI jika ada implementasi
				try { if (typeof this.updateChatAllyList === 'function') this.updateChatAllyList(); } catch(_) {}
			} catch(e){ console.error('[HUDController] updateHUD error', e); }
		};

		// link HUD instance ke game agar localize dapat mengakses bahasa
		try { if (game && game.hud) { game.hud._gameRef = game; } try { if (typeof game.updateHUD === 'function') { game.updateHUD(); } } catch(_) {} } catch(_) {}

	} catch(e){ console.error('[HUDController] attach error', e); }
} 
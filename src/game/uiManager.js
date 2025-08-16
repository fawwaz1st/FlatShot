import { createChatOverlayUI } from './chatUI.js';

export function attachUIManager(game){
	try {
		// Provide safer HUD update (mirror hudController's behavior)
		game.updateHUD = function(){
			const hpEl = document.getElementById('hp');
			const ammoEl = document.getElementById('ammo');
			const reserveEl = document.getElementById('reserve');
			const ammoWrap = document.getElementById('ammoWrap');
			const hpBar = document.getElementById('hpBar');
			const ammoBar = document.getElementById('ammoBar');
			const gWrap = document.getElementById('gWrap');
			const scoreEl = document.getElementById('score');
			const alliesEl = document.getElementById('allies');

			if (hpEl) hpEl.textContent = Math.max(0, this.player.health | 0).toString();
			if (ammoEl) ammoEl.textContent = this.player.ammoInMag.toString();
			if (reserveEl) reserveEl.textContent = this.player.ammoReserve.toString();
			if (ammoWrap) {
				const a = ammoWrap.querySelector('#ammo');
				const r = ammoWrap.querySelector('#reserve');
				if (a) a.textContent = String(this.player.ammoInMag);
				if (r) r.textContent = String(this.player.ammoReserve);
			}

			const hpPct = Math.max(0, Math.min(1, this.player.health / 100));
			const ammoPct = Math.max(0, Math.min(1, this.player.ammoInMag / Math.max(1, this.player.magSize)));
			if (hpBar) hpBar.style.width = (hpPct * 100) + '%';
			if (ammoBar) ammoBar.style.width = (ammoPct * 100) + '%';
			if (gWrap) { gWrap.innerHTML = ''; for (let i=0;i<this.player.grenades;i++) { const d=document.createElement('div'); d.className='dot'; gWrap.appendChild(d);} }
			if (scoreEl) scoreEl.textContent = this.world.score.toString();
			if (alliesEl) alliesEl.textContent = (Array.isArray(this.world.allies) ? this.world.allies.length : 0).toString();

			try {
				if (this.hud) {
					// wave UI disabled for web build - skip
				}
			} catch(_) {}
			try { this.updateChatAllyList(); } catch(_) {}
		};

		game.createChatOverlayUI = function(){
			try { createChatOverlayUI(this); } catch(_) {}
		};

		game.updateChatAllyList = function(){
			try{
				const sel = document.getElementById('chatTargetSel'); if (!sel) return;
				sel.innerHTML = '';
				const optAll = document.createElement('option'); optAll.value='all'; optAll.textContent='All Allies'; sel.appendChild(optAll);
				for (let i=0;i<this.world.allies.length;i++){ const a=this.world.allies[i]; const o=document.createElement('option'); o.value=i.toString(); o.textContent = a.name || `Ally ${i+1}`; sel.appendChild(o); }
			} catch(_) {}
		};

		game.showStreakToast = function(text){ const el=document.getElementById('streakToast'); if(!el) return; el.textContent=text; el.classList.remove('hidden'); el.classList.add('show'); clearTimeout(this._streakToastTimer); this._streakToastTimer=setTimeout(()=>{ el.classList.add('hidden'); el.classList.remove('show'); }, 1600); };

		game.showWeaponToast = function(label, hint){ const el = document.getElementById('weaponToast'); if (!el) return; try { el.querySelector('.label').textContent = label; el.querySelector('.sub').textContent = hint; el.classList.remove('hidden'); el.classList.add('show'); } catch(_){} clearTimeout(this._toastTimer); this._toastTimer = setTimeout(()=>{ try{ el.classList.add('hidden'); el.classList.remove('show'); }catch(_){} }, 1300); };
	} catch(_) {}
}
 
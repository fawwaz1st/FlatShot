import * as THREE from 'three';

export function attachUIController(game){
	try{
		// addChatLog: append message to chat log DOM (non-blocking)
		game.addChatLog = function(who, text, kind = 'system'){
			try{
				const wrap = document.getElementById('chatLog');
				if (!wrap) return;
				const el = document.createElement('div');
				el.className = `chat-entry ${kind}`;
				const time = new Date();
				el.innerHTML = `<span class="who">${who}</span>: <span class="msg">${text}</span>`;
				wrap.appendChild(el);
				wrap.scrollTop = wrap.scrollHeight;
			} catch(_){}
		};

		// showStreakToast
		game.showStreakToast = function(text){
			try{ const el=document.getElementById('streakToast'); if(!el) return; el.textContent=text; el.classList.remove('hidden'); el.classList.add('show'); clearTimeout(this._streakToastTimer); this._streakToastTimer=setTimeout(()=>{ el.classList.add('hidden'); el.classList.remove('show'); }, 1600); } catch(_){ }
		};

		// showWeaponToast
		game.showWeaponToast = function(label, hint){
			try{ const el = document.getElementById('weaponToast'); if (!el) return; const lab = el.querySelector('.label'); const sub = el.querySelector('.sub'); if(lab) lab.textContent = label; if(sub) sub.textContent = hint; el.classList.remove('hidden'); el.classList.add('show'); clearTimeout(this._toastTimer); this._toastTimer = setTimeout(()=>{ el.classList.add('hidden'); el.classList.remove('show'); }, 1300); } catch(_){}
		};

		// updateChatAllyList (mirrors previous logic)
		game.updateChatAllyList = function(){
			try{
				const sel = document.getElementById('chatTargetSel'); if (!sel) return;
				sel.innerHTML = '';
				const optAll = document.createElement('option'); optAll.value='all'; optAll.textContent='All Allies'; sel.appendChild(optAll);
				for (let i=0;i<this.world.allies.length;i++){ const a=this.world.allies[i]; const o=document.createElement('option'); o.value=i.toString(); o.textContent = a.name || `Ally ${i+1}`; sel.appendChild(o); }
			} catch(_){}
		};

		// openChatPrompt: toggle chat overlay
		game.openChatPrompt = function(force=false){
			try{
				const menuEl = (typeof document !== 'undefined') ? document.getElementById('menu') : null;
				if (!force && ((menuEl && !menuEl.classList.contains('hidden')) || (typeof document !== 'undefined' && document.body.classList.contains('paused')))) return;
				const w = document.getElementById('chatOverlay');
				if (w) {
					w.style.display = (w.style.display === 'none' ? 'flex' : 'none');
					const inp = document.getElementById('chatInput');
					if (w.style.display !== 'none') { if (inp) inp.focus(); try{ this.updateChatAllyList(); } catch(_){} }
				}
			} catch(_){}
		};

		// showShotIndicator: move to UI controller (still uses camera)
		game.showShotIndicator = function(fromPos){
			try{
				const now = performance.now();
				if (now - this._lastIndicatorMs < 60) return;
				this._lastIndicatorMs = now;
				const indicator = document.getElementById('shotIndicator'); if (!indicator) return;
				const playerPos = this.controls.getObject().position.clone();
				const dir = new THREE.Vector3().subVectors(fromPos, playerPos); dir.y = 0; dir.normalize();
				const camF = new THREE.Vector3(); this.camera.getWorldDirection(camF); camF.y = 0; camF.normalize();
				const angle = Math.atan2(dir.x, dir.z) - Math.atan2(camF.x, camF.z);
				indicator.style.transform = `translate(-50%,-50%) rotate(${angle}rad)`;
				indicator.classList.add('visible');
				clearTimeout(this._shotIndicatorTimer);
				this._shotIndicatorTimer = setTimeout(()=>indicator.classList.remove('visible'), 280);
			} catch(_){}
		};

		// binding tidak diperlukan: method sudah terpasang pada `game` dengan konteks yang benar
		// (tetap gunakan jika ada kode lain yang memerlukan fungsi ter-bound di kemudian hari)

	} catch(e){ console.error('[UIController] attach error', e); }
} 
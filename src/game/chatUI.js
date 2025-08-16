export function createChatOverlayUI(game){
	try {
		if (typeof document === 'undefined') return;
		if (document.getElementById('chatOverlay')) return;
		const wrap = document.createElement('div'); wrap.id = 'chatOverlay'; wrap.className = 'chat-overlay';
		wrap.style.position = 'fixed'; wrap.style.left='12px'; wrap.style.bottom='12px'; wrap.style.zIndex = 9999; wrap.style.pointerEvents='auto';
		// start hidden by default so Enter opens it in-game
		wrap.style.display = 'none';
		// chat list (CS-like)
		const list = document.createElement('div'); list.id='chatList'; list.style.maxWidth='340px'; list.style.display='flex'; list.style.flexDirection='column-reverse'; list.style.gap='6px'; list.style.padding='10px'; list.style.background='rgba(6,8,10,0.0)'; list.style.pointerEvents='none'; wrap.appendChild(list);
		// input bar
		const bar = document.createElement('div'); bar.style.display='flex'; bar.style.gap='8px'; bar.style.marginTop='8px'; bar.style.pointerEvents='auto';
		const input = document.createElement('input'); input.id='chatInput'; input.placeholder='Press Enter to send...'; input.style.flex='1'; input.style.padding='8px 10px'; input.style.borderRadius='8px'; input.style.border='1px solid rgba(255,255,255,0.06)'; input.style.background='rgba(0,0,0,0.6)'; input.style.color='#fff';
		const sendBtn = document.createElement('button'); sendBtn.textContent='Send'; sendBtn.className='menu-action'; sendBtn.style.pointerEvents='auto';
		bar.appendChild(input); bar.appendChild(sendBtn); wrap.appendChild(bar);
		document.body.appendChild(wrap);
		// expose addChatLog to instance (with menu/pause guard + ally throttle)
		game.addChatLog = (name, text, type='player') => {
			try {
				// if main menu visible or paused, ignore logs
				const menuEl = document.getElementById('menu');
				if ((menuEl && !menuEl.classList.contains('hidden')) || document.body.classList.contains('paused')) return;
				// throttle ally spam per-nama
				if (type === 'ally') {
					try {
						if (!game.scene.userData) game.scene.userData = {};
						if (!game.scene.userData._allyLastMsg) game.scene.userData._allyLastMsg = {};
						const now = performance.now();
						const last = game.scene.userData._allyLastMsg[name] || 0;
						if (now - last < 700) return; // throttle 700ms
						game.scene.userData._allyLastMsg[name] = now;
					} catch(_) {}
				}
				const e = document.createElement('div'); e.className = 'chat-msg ' + (type==='player' ? 'player' : 'ally');
				e.style.display='flex'; e.style.gap='8px'; e.style.alignItems='center'; e.style.pointerEvents='auto';
				const badge = document.createElement('div'); badge.textContent = (type==='player' ? 'YOU' : name.substring(0,3).toUpperCase()); badge.style.fontWeight='700'; badge.style.padding='4px 8px'; badge.style.borderRadius='6px'; badge.style.fontSize='12px'; badge.style.color = type==='player' ? '#0b1220' : '#fff'; badge.style.background = type==='player' ? '#ffd166' : '#38bdf8';
				const content = document.createElement('div'); content.style.fontSize='13px'; content.style.color='#e6eef8'; content.textContent = text;
				e.appendChild(badge); e.appendChild(content);
				list.prepend(e);
				// auto remove old messages
				setTimeout(()=>{ try{ e.remove(); }catch(_){} }, 12000);
			} catch(_) {}
		};
		// expose addChatLog to scene so modules (Ally) can post messages
		try { if (!game.scene.userData) game.scene.userData = {}; game.scene.userData._gameAddChat = game.addChatLog; } catch(_) {}
		// send handler (guard saat menu/pause aktif)
		sendBtn.onclick = ()=>{ try { const menuEl = document.getElementById('menu'); if ((menuEl && !menuEl.classList.contains('hidden')) || document.body.classList.contains('paused')) return; const msg = input.value.trim(); if (!msg) return; game.addChatLog('You', msg, 'player'); const t = (document.getElementById('chatTargetSel') && document.getElementById('chatTargetSel').value) || 'all'; if (t === 'all') game.sendChatToAllies(msg); else { const idx = parseInt(t,10); const ally = game.world.allies[idx]; if (ally) game.sendChatToAlly(msg, ally); } input.value=''; input.blur(); } catch(_){} };
		input.addEventListener('keydown', (ev)=>{
			if (ev.key === 'Enter') { sendBtn.click(); }
			if (ev.key === 'Escape') {
				// Prevent global handlers (like global Esc pause) from firing when typing in chat
				try { ev.stopPropagation(); ev.preventDefault(); } catch(_){}
				// hide & unfocus chat so player returns to gameplay
				wrap.style.display = 'none';
				try { input.blur(); } catch(_){}
				// attempt to return focus to game canvas to ensure inputs resume
				try { if (game && game.renderer && game.renderer.domElement) game.renderer.domElement.focus(); } catch(_){}
			}
		});
		// quick selection cycle (KeyQ)
		window.addEventListener('keydown', (e)=>{ if (e.code === 'KeyQ') { try{ game.cycleSelectedAlly(); } catch(_){} } });
		// NOTE: Toggle via KeyY removed to avoid accidental chat open from keyboard. Use Enter to open chat.
		// buka chat dengan Enter jika tidak sedang fokus di elemen input dan tidak di menu
		window.addEventListener('keydown', (ev)=>{ try {
			if (ev.key === 'Enter') {
				const w = document.getElementById('chatOverlay');
				const active = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA');
				const menuEl = document.getElementById('menu');
				if (!w || (menuEl && !menuEl.classList.contains('hidden')) || document.body.classList.contains('paused')) return;
				// toggle or focus: if hidden => show & focus; if visible => focus input
				if (w.style.display === 'none') {
					w.style.display = 'flex';
					const inp = document.getElementById('chatInput'); if (inp) inp.focus();
					try{ game.updateChatAllyList(); } catch(_){}
					ev.preventDefault();
				} else {
					if (!active) { const inp = document.getElementById('chatInput'); if (inp) inp.focus(); ev.preventDefault(); }
				}
			}
		} catch(_){} });
		// quick-command keys: 7=Attack,8=Hold,9=Regroup,0=Follow (block when menu/pause)
		window.addEventListener('keydown', (e)=>{ try { const menuEl = document.getElementById('menu'); if ((menuEl && !menuEl.classList.contains('hidden')) || document.body.classList.contains('paused')) return; if (!game.world || !game.world.allies) return; if (['Digit7','Digit8','Digit9','Digit0'].includes(e.code)) { const cmdMap = {'Digit7':'Attack','Digit8':'Hold','Digit9':'Regroup','Digit0':'Follow'}; const cmd = cmdMap[e.code]; const idx = game._selectedAllyIndex; if (idx===-1) game.sendChatToAllies(cmd); else { const ally = game.world.allies[idx]; if (ally) game.sendChatToAlly(cmd, ally); } } } catch(_){} });
		// hide chat overlay automatically when main menu shown
		window.addEventListener('game:showMenu', ()=>{ try{ const w=document.getElementById('chatOverlay'); if (w) w.style.display='none'; const inp=document.getElementById('chatInput'); if (inp) inp.blur(); }catch(_){} });
	} catch(_){ }
} 
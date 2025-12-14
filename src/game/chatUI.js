export function createChatOverlayUI(game) {
	try {
		if (typeof document === 'undefined') return;
		if (document.getElementById('chatOverlay')) return;

		// Main container
		const wrap = document.createElement('div');
		wrap.id = 'chatOverlay';
		wrap.className = 'chat-overlay';
		wrap.style.cssText = `
			position: fixed;
			left: 16px;
			bottom: 16px;
			z-index: 9999;
			display: none;
			flex-direction: column;
			gap: 12px;
			max-width: 380px;
			font-family: 'Rajdhani', 'Segoe UI', sans-serif;
			pointer-events: auto;
		`;

		// Chat messages container
		const list = document.createElement('div');
		list.id = 'chatList';
		list.style.cssText = `
			display: flex;
			flex-direction: column;
			gap: 8px;
			max-height: 200px;
			overflow-y: auto;
			padding: 12px;
			background: linear-gradient(135deg, rgba(6, 8, 15, 0.85) 0%, rgba(10, 15, 25, 0.75) 100%);
			border-radius: 12px;
			border: 1px solid rgba(48, 207, 208, 0.15);
			box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05);
			backdrop-filter: blur(8px);
			scrollbar-width: thin;
			scrollbar-color: rgba(48, 207, 208, 0.3) transparent;
		`;
		wrap.appendChild(list);

		// Input bar container
		const bar = document.createElement('div');
		bar.style.cssText = `
			display: flex;
			gap: 10px;
			align-items: center;
		`;

		// Target selector
		const selectWrap = document.createElement('div');
		selectWrap.style.cssText = `
			position: relative;
			min-width: 90px;
		`;
		const select = document.createElement('select');
		select.id = 'chatTargetSel';
		select.style.cssText = `
			width: 100%;
			padding: 10px 12px;
			border-radius: 10px;
			border: 1px solid rgba(48, 207, 208, 0.2);
			background: linear-gradient(135deg, rgba(10, 15, 25, 0.9) 0%, rgba(15, 20, 35, 0.85) 100%);
			color: #e6eef8;
			font-size: 13px;
			font-weight: 600;
			cursor: pointer;
			outline: none;
			appearance: none;
			-webkit-appearance: none;
			transition: all 0.2s ease;
		`;
		select.innerHTML = '<option value="all">📢 All</option>';
		select.addEventListener('focus', () => {
			select.style.borderColor = 'rgba(48, 207, 208, 0.5)';
			select.style.boxShadow = '0 0 15px rgba(48, 207, 208, 0.2)';
		});
		select.addEventListener('blur', () => {
			select.style.borderColor = 'rgba(48, 207, 208, 0.2)';
			select.style.boxShadow = 'none';
		});
		selectWrap.appendChild(select);

		// Input field
		const input = document.createElement('input');
		input.id = 'chatInput';
		input.type = 'text';
		input.placeholder = 'Type message...';
		input.autocomplete = 'off';
		input.style.cssText = `
			flex: 1;
			padding: 12px 16px;
			border-radius: 10px;
			border: 1px solid rgba(48, 207, 208, 0.2);
			background: linear-gradient(135deg, rgba(10, 15, 25, 0.9) 0%, rgba(15, 20, 35, 0.85) 100%);
			color: #ffffff;
			font-size: 14px;
			font-weight: 500;
			outline: none;
			transition: all 0.2s ease;
		`;
		input.addEventListener('focus', () => {
			input.style.borderColor = 'rgba(48, 207, 208, 0.5)';
			input.style.boxShadow = '0 0 15px rgba(48, 207, 208, 0.2)';
		});
		input.addEventListener('blur', () => {
			input.style.borderColor = 'rgba(48, 207, 208, 0.2)';
			input.style.boxShadow = 'none';
		});

		// Send button
		const sendBtn = document.createElement('button');
		sendBtn.innerHTML = '➤';
		sendBtn.style.cssText = `
			padding: 12px 16px;
			border-radius: 10px;
			border: none;
			background: linear-gradient(135deg, #30cfd0 0%, #1a9a9b 100%);
			color: #0a0f14;
			font-size: 16px;
			font-weight: 700;
			cursor: pointer;
			transition: all 0.2s ease;
			box-shadow: 0 2px 10px rgba(48, 207, 208, 0.3);
		`;
		sendBtn.addEventListener('mouseenter', () => {
			sendBtn.style.transform = 'scale(1.05)';
			sendBtn.style.boxShadow = '0 4px 20px rgba(48, 207, 208, 0.5)';
		});
		sendBtn.addEventListener('mouseleave', () => {
			sendBtn.style.transform = 'scale(1)';
			sendBtn.style.boxShadow = '0 2px 10px rgba(48, 207, 208, 0.3)';
		});

		bar.appendChild(selectWrap);
		bar.appendChild(input);
		bar.appendChild(sendBtn);
		wrap.appendChild(bar);

		// Quick command bar
		const quickBar = document.createElement('div');
		quickBar.style.cssText = `
			display: flex;
			gap: 8px;
			flex-wrap: wrap;
		`;
		const commands = [
			{ key: '7', label: '⚔️ Attack', color: '#ff6b6b' },
			{ key: '8', label: '🛡️ Hold', color: '#ffd166' },
			{ key: '9', label: '📍 Regroup', color: '#06d6a0' },
			{ key: '0', label: '👣 Follow', color: '#38bdf8' }
		];
		commands.forEach(cmd => {
			const btn = document.createElement('button');
			btn.innerHTML = `<span style="opacity:0.6;font-size:10px">${cmd.key}</span> ${cmd.label}`;
			btn.style.cssText = `
				padding: 6px 12px;
				border-radius: 8px;
				border: 1px solid ${cmd.color}40;
				background: ${cmd.color}15;
				color: ${cmd.color};
				font-size: 11px;
				font-weight: 600;
				cursor: pointer;
				transition: all 0.2s ease;
				font-family: inherit;
			`;
			btn.addEventListener('mouseenter', () => {
				btn.style.background = `${cmd.color}30`;
				btn.style.transform = 'translateY(-1px)';
			});
			btn.addEventListener('mouseleave', () => {
				btn.style.background = `${cmd.color}15`;
				btn.style.transform = 'translateY(0)';
			});
			btn.addEventListener('click', () => {
				const cmdText = cmd.label.split(' ')[1]; // Extract command name
				const idx = game._selectedAllyIndex;
				if (idx === -1) game.sendChatToAllies(cmdText);
				else {
					const ally = game.world.allies[idx];
					if (ally) game.sendChatToAlly(cmdText, ally);
				}
			});
			quickBar.appendChild(btn);
		});
		wrap.appendChild(quickBar);

		// Help text
		const help = document.createElement('div');
		help.style.cssText = `
			font-size: 11px;
			color: rgba(255, 255, 255, 0.4);
			text-align: center;
		`;
		help.textContent = 'Press ENTER to open • ESC to close • Q to cycle allies';
		wrap.appendChild(help);

		document.body.appendChild(wrap);

		// Expose addChatLog function
		game.addChatLog = (name, text, type = 'player') => {
			try {
				const menuEl = document.getElementById('menu');
				if ((menuEl && !menuEl.classList.contains('hidden')) || document.body.classList.contains('paused')) return;

				// Throttle ally messages
				if (type === 'ally') {
					if (!game.scene.userData) game.scene.userData = {};
					if (!game.scene.userData._allyLastMsg) game.scene.userData._allyLastMsg = {};
					const now = performance.now();
					const last = game.scene.userData._allyLastMsg[name] || 0;
					if (now - last < 700) return;
					game.scene.userData._allyLastMsg[name] = now;
				}

				const msg = document.createElement('div');
				msg.style.cssText = `
					display: flex;
					gap: 10px;
					align-items: flex-start;
					animation: slideIn 0.3s ease-out;
					padding: 8px 0;
				`;

				// Badge/Avatar
				const badge = document.createElement('div');
				const isPlayer = type === 'player';
				badge.textContent = isPlayer ? 'YOU' : name.substring(0, 3).toUpperCase();
				badge.style.cssText = `
					font-weight: 700;
					padding: 4px 10px;
					border-radius: 6px;
					font-size: 11px;
					letter-spacing: 0.5px;
					text-transform: uppercase;
					flex-shrink: 0;
					${isPlayer
						? 'background: linear-gradient(135deg, #ffd166 0%, #f0a000 100%); color: #1a1a1a;'
						: 'background: linear-gradient(135deg, #38bdf8 0%, #0284c7 100%); color: #ffffff;'
					}
				`;

				// Content
				const content = document.createElement('div');
				content.style.cssText = `
					font-size: 13px;
					color: #e6eef8;
					line-height: 1.4;
					word-break: break-word;
				`;
				content.textContent = text;

				msg.appendChild(badge);
				msg.appendChild(content);
				list.prepend(msg);

				// Auto-scroll to bottom
				list.scrollTop = 0;

				// Auto-remove after delay
				setTimeout(() => {
					msg.style.opacity = '0';
					msg.style.transform = 'translateX(-20px)';
					msg.style.transition = 'all 0.3s ease-out';
					setTimeout(() => msg.remove(), 300);
				}, 10000);
			} catch (_) { }
		};

		// Expose to scene for modules
		try {
			if (!game.scene.userData) game.scene.userData = {};
			game.scene.userData._gameAddChat = game.addChatLog;
		} catch (_) { }

		// Update ally list in selector
		game.updateChatAllyList = () => {
			try {
				select.innerHTML = '<option value="all">📢 All Allies</option>';
				if (game.world && game.world.allies) {
					game.world.allies.forEach((ally, idx) => {
						const opt = document.createElement('option');
						opt.value = idx;
						opt.textContent = `👤 ${ally.name || 'Ally ' + (idx + 1)}`;
						select.appendChild(opt);
					});
				}
			} catch (_) { }
		};

		// Send handler
		const sendMessage = () => {
			try {
				const menuEl = document.getElementById('menu');
				if ((menuEl && !menuEl.classList.contains('hidden')) || document.body.classList.contains('paused')) return;

				const msg = input.value.trim();
				if (!msg) return;

				game.addChatLog('You', msg, 'player');

				const target = select.value;
				if (target === 'all') {
					game.sendChatToAllies(msg);
				} else {
					const idx = parseInt(target, 10);
					const ally = game.world.allies[idx];
					if (ally) game.sendChatToAlly(msg, ally);
				}

				input.value = '';
				input.blur();
			} catch (_) { }
		};

		sendBtn.addEventListener('click', sendMessage);

		input.addEventListener('keydown', (ev) => {
			if (ev.key === 'Enter') {
				ev.preventDefault();
				sendMessage();
			}
			if (ev.key === 'Escape') {
				ev.stopPropagation();
				ev.preventDefault();
				wrap.style.display = 'none';
				input.blur();
				try {
					if (game.renderer && game.renderer.domElement) {
						game.renderer.domElement.focus();
					}
				} catch (_) { }
			}
		});

		// Cycle ally selection with Q
		window.addEventListener('keydown', (e) => {
			if (e.code === 'KeyQ') {
				try { game.cycleSelectedAlly(); } catch (_) { }
			}
		});

		// Toggle chat with Enter
		window.addEventListener('keydown', (ev) => {
			try {
				if (ev.key === 'Enter') {
					const active = document.activeElement;
					const isInputActive = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
					const menuEl = document.getElementById('menu');

					if ((menuEl && !menuEl.classList.contains('hidden')) || document.body.classList.contains('paused')) return;

					if (wrap.style.display === 'none') {
						wrap.style.display = 'flex';
						input.focus();
						game.updateChatAllyList();
						ev.preventDefault();
					} else if (!isInputActive) {
						input.focus();
						ev.preventDefault();
					}
				}
			} catch (_) { }
		});

		// Quick command keys
		window.addEventListener('keydown', (e) => {
			try {
				const menuEl = document.getElementById('menu');
				if ((menuEl && !menuEl.classList.contains('hidden')) || document.body.classList.contains('paused')) return;
				if (!game.world || !game.world.allies) return;

				const cmdMap = {
					'Digit7': 'Attack',
					'Digit8': 'Hold',
					'Digit9': 'Regroup',
					'Digit0': 'Follow'
				};

				if (cmdMap[e.code]) {
					const cmd = cmdMap[e.code];
					const idx = game._selectedAllyIndex;
					if (idx === -1) {
						game.sendChatToAllies(cmd);
					} else {
						const ally = game.world.allies[idx];
						if (ally) game.sendChatToAlly(cmd, ally);
					}
				}
			} catch (_) { }
		});

		// Hide chat when menu shown
		window.addEventListener('game:showMenu', () => {
			try {
				wrap.style.display = 'none';
				input.blur();
			} catch (_) { }
		});

		// Add CSS animation
		const style = document.createElement('style');
		style.textContent = `
			@keyframes slideIn {
				from {
					opacity: 0;
					transform: translateX(-20px);
				}
				to {
					opacity: 1;
					transform: translateX(0);
				}
			}
			#chatList::-webkit-scrollbar {
				width: 6px;
			}
			#chatList::-webkit-scrollbar-track {
				background: transparent;
			}
			#chatList::-webkit-scrollbar-thumb {
				background: rgba(48, 207, 208, 0.3);
				border-radius: 3px;
			}
			#chatList::-webkit-scrollbar-thumb:hover {
				background: rgba(48, 207, 208, 0.5);
			}
		`;
		document.head.appendChild(style);

	} catch (_) { }
}
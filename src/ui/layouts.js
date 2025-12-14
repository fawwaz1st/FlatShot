export const MENU_HTML = `
	<!-- Minimalist Accordion Menu -->
	<div id="flatshot-ui">
		<header class="game-header">
			<h1>FLATSHOT</h1>
			<p>BROWSER ARENA FPS</p>
		</header>

		<nav class="accordion-menu">
			<!-- ITEM 1: MULAI -->
			<div class="menu-item">
				<button class="menu-btn" data-target="submenu-play">MULAI</button>
				<div id="submenu-play" class="submenu">
					<div class="submenu-inner">
						<button id="btn-quickmatch" class="sub-btn">SINGLE PLAYER</button>
						<button id="btn-server" class="sub-btn">SERVER BROWSER</button>
					</div>
				</div>
			</div>

			<!-- ITEM 2: PENGATURAN -->
			<div class="menu-item">
				<button class="menu-btn" data-target="submenu-settings">PENGATURAN</button>
				<div id="submenu-settings" class="submenu">
					<div class="submenu-inner">
						<div class="control-group">
							<label>MASTER VOLUME</label>
							<input type="range" id="volMaster" min="0" max="1" step="0.1" value="0.5">
						</div>
						<div class="control-group">
							<label>SENSITIVITY</label>
							<div class="slider-container">
								<input type="range" id="sensitivity" class="modern-slider" min="0.1" max="5.0" step="0.1" value="0.8">
								<span id="sensitivityVal" class="slider-value">0.8</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- ITEM 3: TENTANG -->
			<div class="menu-item">
				<button class="menu-btn" data-target="submenu-about">TENTANG</button>
				<div id="submenu-about" class="submenu">
					<div class="submenu-inner">
						<p class="about-text">
							FlatShot adalah eksperimen FPS berbasis WebGL.<br>
							Tanpa download. Tanpa install.<br>
							Dibuat dengan <strong>Three.js</strong>.
						</p>
					</div>
				</div>
			</div>
		</nav>
	</div>
`;

export const HUD_HTML = `
	<!-- HUD Layer -->
	<div id="hud" class="hud hidden">
		<div class="crosshair" id="crosshair"></div>

		<!-- Left Panel: Status -->
		<div class="hud-panel hud-left">
			<div class="bar-container">
				<div class="bar-label">HP</div>
				<div class="hp-bar-bg">
					<div id="hpBar" class="hp-bar-fill"></div>
				</div>
				<span id="hp" class="hp-text">100</span>
			</div>
			<div class="bar-container">
				<div class="bar-label">ARM</div>
				<div class="armor-bar-bg">
					<div id="armorBar" class="armor-bar-fill"></div>
				</div>
				<span class="hp-text"></span>
			</div>
		</div>

		<!-- Right Panel: Weapon -->
		<div class="hud-panel hud-right">
			<div class="ammo-box">
				<span id="ammo" class="ammo-count">30</span>
				<span class="ammo-reserve">/ <span id="reserve">120</span></span>
			</div>
			<div class="weapon-name">ASSAULT RIFLE</div>
		</div>

		<!-- Top: Wave/Score (Optional but good to have) -->
		<div class="hud-top">
			<div id="score" class="score-text">0</div>
		</div>
	</div>
`;

export const PAUSE_HTML = `
	<!-- Pause Menu (Cyberpunk) -->
	<div id="pauseMenu" class="pause-menu hidden">
		<div class="pause-container">
			<h1 class="pause-title">PAUSED</h1>
			<div class="pause-content">
				<div class="pause-stats">
					<!-- Optional stats can go here -->
				</div>
				<div class="pause-buttons">
					<button id="resumeBtn" class="pause-btn">RESUME OPERATION</button>
					<button id="quitBtn" class="pause-btn danger">ABORT MISSION</button>
				</div>
			</div>
		</div>
	</div>
`;

export const LOADING_SCREEN_HTML = `
<div id="loading-screen" style="position:fixed;inset:0;background:#050510;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10000;font-family:'Rajdhani',sans-serif;">
    <h2 style="font-size:3rem;color:#fff;margin-bottom:2rem;text-shadow:0 0 20px rgba(0,255,255,0.5);">LOADING WORLD</h2>
    <div style="width:300px;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;position:relative;overflow:hidden;">
        <div id="loading-bar-fill" style="width:0%;height:100%;background:#00ffff;box-shadow:0 0 15px #00ffff;transition:width 0.2s ease-out;"></div>
    </div>
    <p id="loading-text" style="margin-top:1rem;color:rgba(255,255,255,0.7);font-size:1.2rem;">Initializing...</p>
</div>
`;

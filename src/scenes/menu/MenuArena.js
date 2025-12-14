import * as THREE from 'three';

// Game Mode Types
export const MenuGameModes = {
    KING_OF_HILL: 'koth',
    CAPTURE_FLAG: 'ctf',
    DEATHMATCH: 'dm'
};

export class MenuArena {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.obstacles = [];
        this.coverPoints = [];
        this.particles = [];
        this.projectiles = [];

        this.raycaster = new THREE.Raycaster();
        this.arenaSize = 140;

        this.shuffleTimer = 10.0;

        // Audio
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = 0.05;
        this.masterGain.connect(this.audioCtx.destination);

        // === GAME MODE SYSTEM ===
        const modes = [MenuGameModes.KING_OF_HILL, MenuGameModes.CAPTURE_FLAG, MenuGameModes.DEATHMATCH];
        this.gameMode = modes[Math.floor(Math.random() * modes.length)];
        console.log(`[MenuArena] Game Mode: ${this.gameMode.toUpperCase()}`);

        // Mode-specific state
        this.scores = { blue: 0, red: 0 };

        // KOTH: Hill zone
        this.hillZone = null;
        this.hillOwner = null; // 'blue' | 'red' | null
        this.hillProgress = { blue: 0, red: 0 };

        // CTF: Flags
        this.flags = { blue: null, red: null };
        this.flagCarriers = { blue: null, red: null }; // Bot carrying enemy flag
        this.flagBases = { blue: new THREE.Vector3(-60, 0, 0), red: new THREE.Vector3(60, 0, 0) };

        this._setupEnv();
        this._setupGameMode();
    }

    _setupEnv() {
        // Floor - Brighter Neon Grid
        const grid = new THREE.GridHelper(this.arenaSize * 2, 80, 0x00ffff, 0xff00ff);
        grid.position.y = 0.05;
        grid.material.opacity = 0.9;
        grid.material.transparent = true;
        this.scene.add(grid);

        // Floor plane with slight glow
        const planeGeo = new THREE.PlaneGeometry(this.arenaSize * 2, this.arenaSize * 2);
        const planeMat = new THREE.MeshStandardMaterial({
            color: 0x0a0a15,
            emissive: 0x050510,
            emissiveIntensity: 0.5,
            roughness: 0.9
        });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.rotation.x = -Math.PI / 2;
        this.scene.add(plane);

        this.objects = [grid, plane];
        this._spawnInitialObstacles();
    }

    _spawnInitialObstacles() {
        // Procedural Generation: Create 60 obstacles for diverse terrain
        for (let i = 0; i < 60; i++) {
            const w = 4 + Math.random() * 8;
            const d = 4 + Math.random() * 8;
            const h = 2 + Math.random() * 6;

            // Random pos within arena (avoid pure center)
            const x = (Math.random() - 0.5) * (this.arenaSize * 1.6);
            const z = (Math.random() - 0.5) * (this.arenaSize * 1.0);

            this._addObstacle({ x, z, w, d, h });
        }
    }

    _addObstacle(cfg) {
        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        const edgesGeo = new THREE.EdgesGeometry(boxGeo);

        // Brighter obstacles with stronger emissive
        const mesh = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({
            color: 0x334455,
            roughness: 0.3,
            metalness: 0.7,
            emissive: 0x223344,
            emissiveIntensity: 0.8
        }));
        mesh.position.set(cfg.x, cfg.h / 2, cfg.z);
        mesh.scale.set(cfg.w, cfg.h, cfg.d);
        this.scene.add(mesh);

        // Brighter edge glow
        const edges = new THREE.LineSegments(edgesGeo, new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.8
        }));
        edges.position.copy(mesh.position);
        edges.scale.copy(mesh.scale);
        this.scene.add(edges);

        const box = new THREE.Box3().setFromObject(mesh);

        const obs = { mesh, edges, box, w: cfg.w, d: cfg.d, h: cfg.h };
        this.obstacles.push(obs);
        this._generateCoverPoints(obs);
    }

    _generateCoverPoints(obs) {
        const offset = 2.0;
        const ox = obs.mesh.position.x;
        const oz = obs.mesh.position.z;
        const w = obs.w;
        const d = obs.d;
        // Points on ground
        const pts = [
            [ox + w / 2 + offset, oz], [ox - w / 2 - offset, oz],
            [ox, oz + d / 2 + offset], [ox, oz - d / 2 - offset]
        ];
        pts.forEach(p => this.coverPoints.push(new THREE.Vector3(p[0], 0, p[1])));

        // Points ON TOP? (Tactical high ground)
        this.coverPoints.push(new THREE.Vector3(ox, obs.h, oz));
    }

    update(dt, bots) {
        this.shuffleTimer -= dt;
        if (this.shuffleTimer <= 0) {
            this._shuffleObstacles(bots);
            this.shuffleTimer = 10.0;
        }
        this._updateProjectiles(dt, bots);
        this._updateParticles(dt);
        this._updateGameMode(dt, bots);
    }

    _shuffleObstacles(bots) {
        // console.log("Shuffling Arena...");
        this.coverPoints = [];
        this.playSfx('shuffle');

        this.obstacles.forEach(obs => {
            // Check if ANY bot is "on" this obstacle
            let isOccupied = false;
            for (const bot of bots) {
                if (bot.hp > 0 && bot.group.position.y >= obs.h * 0.9) {
                    // Check if x/z inside
                    const bPos = bot.group.position;
                    // Simple bounds check with margin
                    if (obs.box.containsPoint(bPos) || (Math.abs(bPos.x - obs.mesh.position.x) < obs.w / 2 + 0.5 && Math.abs(bPos.z - obs.mesh.position.z) < obs.d / 2 + 0.5)) {
                        isOccupied = true;
                        break;
                    }
                }
            }

            if (isOccupied) {
                // DON'T MOVE THIS ONE
                this._spawnSpark(obs.mesh.position, 0xff0000, 5); // Red warning spark
                this._generateCoverPoints(obs); // Keep points
                return;
            }

            // Normal Move Logic
            this._spawnSpark(obs.mesh.position, 0x00f0ff, 10);

            for (let i = 0; i < 10; i++) {
                const newX = (Math.random() - 0.5) * 100;
                const newZ = (Math.random() - 0.5) * 60;

                const tempBox = new THREE.Box3();
                tempBox.min.set(newX - obs.w / 2 - 0.5, 0, newZ - obs.d / 2 - 0.5);
                tempBox.max.set(newX + obs.w / 2 + 0.5, obs.h, newZ + obs.d / 2 + 0.5);

                let safe = true;
                // Check against bots (all positions)
                for (const bot of bots) {
                    if (bot.hp > 0 && tempBox.distanceToPoint(bot.group.position) < 1.0) { safe = false; break; }
                }

                if (safe) {
                    for (const other of this.obstacles) {
                        if (other === obs) continue;
                        const dist = new THREE.Vector3(newX, 0, newZ).distanceTo(other.mesh.position);
                        if (dist < (Math.max(obs.w, obs.d) + Math.max(other.w, other.d)) / 1.5) { safe = false; break; }
                    }
                }

                if (safe) {
                    obs.mesh.position.set(newX, obs.h / 2, newZ);
                    obs.edges.position.set(newX, obs.h / 2, newZ);
                    obs.box.copy(tempBox);
                    this._spawnSpark(obs.mesh.position, 0x00f0ff, 10);
                    break;
                }
            }
            this._generateCoverPoints(obs);
        });
    }

    spawnProjectile(shooter, target, spread) {
        this.playSfx('shoot');
        const start = shooter.group.position.clone().setY(shooter.group.position.y + 0.5);
        const end = target.group.position.clone().setY(target.group.position.y + 0.5);

        end.x += (Math.random() - 0.5) * spread;
        end.z += (Math.random() - 0.5) * spread;

        const dir = new THREE.Vector3().subVectors(end, start).normalize();

        const geo = new THREE.BoxGeometry(0.1, 0.1, 4);
        const mat = new THREE.MeshBasicMaterial({ color: shooter.color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(start);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        this.scene.add(mesh);

        this.projectiles.push({
            mesh, dir, speed: 180, life: 1.0,
            shooterTeam: shooter.team,
            damage: shooter.role === 'SNIPER' ? 80 : 25
        });
    }

    _updateProjectiles(dt, bots) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            const prev = p.mesh.position.clone();
            const move = p.dir.clone().multiplyScalar(p.speed * dt);
            const next = prev.clone().add(move);
            const dist = move.length();

            let hit = false;
            let hitP = next;

            // 1. Wall Check (Raycast)
            this.raycaster.set(prev, p.dir);
            this.raycaster.far = dist + 1.0; // Margin for high speed
            const walls = this.obstacles.map(o => o.mesh);
            const wallHits = this.raycaster.intersectObjects(walls);

            if (wallHits.length > 0) {
                // Check if hit point is effectively within segment
                if (wallHits[0].distance <= dist) {
                    hit = true;
                    hitP = wallHits[0].point;
                    this._spawnSpark(hitP, 0xffffff, 4);
                }
            }

            // 2. Fallback Box Check (Bullet Thru Wall Fix)
            if (!hit) {
                for (const obs of this.obstacles) {
                    if (obs.box.containsPoint(next)) {
                        hit = true;
                        hitP = next.clone().sub(p.dir.clone().multiplyScalar(0.5)); // push back
                        this._spawnSpark(hitP, 0xffffff, 4);
                        break;
                    }
                }
            }

            if (!hit) {
                for (const bot of bots) {
                    if (bot.team !== p.shooterTeam && bot.hp > 0) {
                        const seg = new THREE.Line3(prev, next);
                        const pt = new THREE.Vector3();
                        // Bot Y can be anything now (jumping)
                        const botCenter = bot.group.position.clone();
                        botCenter.y += 0.8; // mid-body

                        seg.closestPointToPoint(botCenter, true, pt);
                        if (pt.distanceTo(botCenter) < 0.6) { // slightly tighter hit
                            hit = true; hitP = pt;
                            this._spawnSpark(pt, bot.color, 10);
                            bot.takeDamage(p.damage);
                            if (bot.hp <= 0) {
                                // Kill confirmed
                                this.registerKill(p.shooterTeam);
                                this._respawnBot(bot);
                            }
                            break;
                        }
                    }
                }
            }

            if (hit) {
                this.scene.remove(p.mesh);
                this.projectiles.splice(i, 1);
            } else {
                p.mesh.position.copy(next);
                p.life -= dt;
                if (p.life <= 0) {
                    this.scene.remove(p.mesh);
                    this.projectiles.splice(i, 1);
                }
            }
        }
    }

    _respawnBot(bot) {
        const x = bot.team === 'blue' ? -60 : 60;
        const z = (Math.random() - 0.5) * 80;
        this._spawnSpark(bot.group.position, bot.color, 30);
        bot.respawn(x, z);
    }

    _spawnSpark(pos, color, n) {
        const mat = new THREE.MeshBasicMaterial({ color });
        const geo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        for (let i = 0; i < n; i++) {
            const m = new THREE.Mesh(geo, mat);
            m.position.copy(pos);
            const v = new THREE.Vector3((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15);
            this.scene.add(m);
            this.particles.push({ mesh: m, vel: v, life: 0.2 + Math.random() * 0.2 });
        }
    }

    _updateParticles(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            p.mesh.position.addScaledVector(p.vel, dt);
            p.mesh.scale.multiplyScalar(0.9);
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                this.particles.splice(i, 1);
            }
        }
    }

    // --- PHYSICS HELPERS ---

    // Returns the exact obstacle object under/at this position (accounting for height)
    // Physics Resolution
    resolveCollision(pos, radius) {
        let collision = null;

        // Sphere vs AABB check for all obstacles
        for (const obs of this.obstacles) {
            // Expand box by radius for check
            const closest = new THREE.Vector3();
            obs.box.clampPoint(pos, closest);

            const dist = pos.distanceTo(closest);

            if (dist < radius) {
                // Collided
                // Determine push normal (simple axis separation)
                const push = pos.clone().sub(closest);
                if (push.lengthSq() < 0.00001) {
                    // Center exact overlap, push X
                    push.set(1, 0, 0);
                }
                push.normalize().multiplyScalar(radius - dist);

                // Return collision info (first confirm is usually enough for simple bots)
                // Also ignore if we are ON TOP (vertical check is handled by bot gravity usually)
                // But for horizontal push, ensure we deal with Y

                if (pos.y < obs.h) { // Only collide if body is within height
                    return {
                        obj: obs,
                        push: push,
                        h: obs.h
                    };
                }
            }
        }
        return null;
    }

    getCollisionData(x, z) {
        // Find if inside any box XZ (Legacy helper for jumps)
        for (const obs of this.obstacles) {
            const dx = Math.abs(x - obs.mesh.position.x);
            const dz = Math.abs(z - obs.mesh.position.z);
            if (dx < obs.w / 2 && dz < obs.d / 2) {
                return obs;
            }
        }
        return null;
    }

    checkVisibility(s, e) {
        const _s = s.clone(); if (_s.y < 0.5) _s.y = 1.5;
        const _e = e.clone(); if (_e.y < 0.5) _e.y = 1.5;
        const dir = new THREE.Vector3().subVectors(_e, _s);
        const dist = dir.length();
        dir.normalize();

        this.raycaster.set(_s, dir);
        this.raycaster.far = dist;
        const walls = this.obstacles.map(o => o.mesh);
        return this.raycaster.intersectObjects(walls).length === 0;
    }

    getRandomCoverPoint() {
        if (this.coverPoints.length === 0) return null;
        return this.coverPoints[Math.floor(Math.random() * this.coverPoints.length)];
    }

    // --- AUDIO SYSTEM ---
    playSfx(type) {
        if (!this.audioCtx) return;
        if (Math.random() > 0.3 && type === 'shoot') return; // Don't spam limits

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.masterGain);

        const now = this.audioCtx.currentTime;

        if (type === 'shoot') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(800 + Math.random() * 400, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'jump') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.linearRampToValueAtTime(400, now + 0.2);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'shuffle') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.3);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        }
    }

    destroy() {
        if (this.audioCtx) this.audioCtx.close();
        this.objects.forEach(o => this.scene.remove(o));
        this.obstacles.forEach(o => {
            this.scene.remove(o.mesh);
            this.scene.remove(o.edges);
        });
        this.projectiles.forEach(p => this.scene.remove(p.mesh));
        this.particles.forEach(p => this.scene.remove(p.mesh));

        // Cleanup game mode objects
        if (this.hillZone) {
            this.scene.remove(this.hillZone.mesh);
            this.scene.remove(this.hillZone.indicator);
        }
        if (this.flags.blue) {
            this.scene.remove(this.flags.blue.group);
            if (this.flags.blue.baseMesh) this.scene.remove(this.flags.blue.baseMesh);
        }
        if (this.flags.red) {
            this.scene.remove(this.flags.red.group);
            if (this.flags.red.baseMesh) this.scene.remove(this.flags.red.baseMesh);
        }
    }

    // ========================================
    // GAME MODE SYSTEM
    // ========================================

    _setupGameMode() {
        if (this.gameMode === 'koth') {
            this._setupKingOfHill();
        } else if (this.gameMode === 'ctf') {
            this._setupCaptureFlag();
        }
        // Deathmatch needs no special setup - just brutal fighting
    }

    _setupKingOfHill() {
        // Create glowing hill zone at center
        const zoneRadius = 15;
        const zoneGeo = new THREE.CylinderGeometry(zoneRadius, zoneRadius, 0.5, 32);
        const zoneMat = new THREE.MeshBasicMaterial({
            color: 0x888888,
            transparent: true,
            opacity: 0.4
        });
        const zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
        zoneMesh.position.set(0, 0.3, 0);
        this.scene.add(zoneMesh);

        // Indicator ring
        const ringGeo = new THREE.RingGeometry(zoneRadius - 0.5, zoneRadius, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        ringMesh.position.set(0, 0.6, 0);
        this.scene.add(ringMesh);

        this.hillZone = {
            mesh: zoneMesh,
            indicator: ringMesh,
            radius: zoneRadius,
            position: new THREE.Vector3(0, 0, 0)
        };
    }

    _setupCaptureFlag() {
        // Create flags at each team's base
        this.flags.blue = this._createFlag('blue', this.flagBases.blue);
        this.flags.red = this._createFlag('red', this.flagBases.red);
    }

    _createFlag(team, position) {
        const group = new THREE.Group();
        const color = team === 'blue' ? 0x00ffff : 0xff3366;

        // Pole
        const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, 8, 8);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 4;
        group.add(pole);

        // Flag cloth
        const flagGeo = new THREE.PlaneGeometry(5, 3);
        const flagMat = new THREE.MeshBasicMaterial({
            color: color,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9
        });
        const flag = new THREE.Mesh(flagGeo, flagMat);
        flag.position.set(2.5, 6.5, 0);
        group.add(flag);

        // Glow base - SEPARATE from flag group so it always stays visible
        const baseGeo = new THREE.CylinderGeometry(3, 3, 0.3, 16);
        const baseMat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.5
        });
        const baseMesh = new THREE.Mesh(baseGeo, baseMat);
        baseMesh.position.copy(position);
        baseMesh.position.y = 0.15;
        this.scene.add(baseMesh); // Add to scene, not group

        group.position.copy(position);
        this.scene.add(group);

        return {
            group,
            baseMesh, // Store reference for cleanup
            basePosition: position.clone(),
            isHome: true,
            carrier: null
        };
    }

    _updateGameMode(dt, bots) {
        if (this.gameMode === 'koth') {
            this._updateKingOfHill(dt, bots);
        } else if (this.gameMode === 'ctf') {
            this._updateCaptureFlag(dt, bots);
        }
        // Deathmatch: no special update needed
    }

    _updateKingOfHill(dt, bots) {
        if (!this.hillZone) return;

        // Count bots in zone
        let blueInZone = 0;
        let redInZone = 0;

        bots.forEach(bot => {
            if (bot.hp <= 0) return;
            const dist = bot.group.position.distanceTo(this.hillZone.position);
            if (dist < this.hillZone.radius) {
                if (bot.team === 'blue') blueInZone++;
                else redInZone++;
            }
        });

        // Determine zone control
        let newOwner = this.hillOwner;
        if (blueInZone > 0 && redInZone === 0) {
            newOwner = 'blue';
            this.hillProgress.blue += dt * 10;
        } else if (redInZone > 0 && blueInZone === 0) {
            newOwner = 'red';
            this.hillProgress.red += dt * 10;
        } else if (blueInZone > 0 && redInZone > 0) {
            // Contested - no progress
            newOwner = null;
        }

        // Update visuals
        if (newOwner !== this.hillOwner) {
            this.hillOwner = newOwner;
            this.dominationTimer = 0; // Reset timer on change

            if (newOwner === 'blue') {
                this.hillZone.mesh.material.color.setHex(0x00ffff);
                this.hillZone.indicator.material.color.setHex(0x00ffff);
            } else if (newOwner === 'red') {
                this.hillZone.mesh.material.color.setHex(0xff3366);
                this.hillZone.indicator.material.color.setHex(0xff3366);
            } else {
                this.hillZone.mesh.material.color.setHex(0x888888);
                this.hillZone.indicator.material.color.setHex(0xffffff);
            }
        }

        // Domination Buff Logic (+10% every 5s)
        if (this.hillOwner) {
            this.dominationTimer = (this.dominationTimer || 0) + dt;
            if (this.dominationTimer >= 5.0) {
                this._applyTeamBuff(this.hillOwner, 1.10); // +10%
                this.dominationTimer = 0;
                this.playSfx('shuffle');
                // Flash effect
                this._spawnSpark(this.hillZone.position, this.hillOwner === 'blue' ? 0x00ffff : 0xff3366, 20);
            }
        }

        // Pulse effect
        const pulse = 0.4 + Math.sin(performance.now() * 0.005) * 0.2;
        this.hillZone.mesh.material.opacity = pulse;
    }

    // Called by MenuBot when it kills an enemy
    registerKill(killerTeam) {
        if (this.gameMode === 'dm') {
            // Deathmatch: +2% for every kill
            this._applyTeamBuff(killerTeam, 1.02);
        }
    }

    _updateCaptureFlag(dt, bots) {
        ['blue', 'red'].forEach(team => {
            const enemyTeam = team === 'blue' ? 'red' : 'blue';
            const flag = this.flags[team];
            if (!flag) return;

            if (flag.carrier) {
                // Flag is being carried
                if (flag.carrier.hp <= 0) {
                    // Carrier died - drop flag
                    flag.group.position.copy(flag.carrier.group.position);
                    flag.group.position.y = 0;
                    // Remove indicator from carrier
                    this._removeFlagIndicator(flag.carrier);
                    flag.carrier = null;
                    flag.isHome = false;
                } else {
                    // Move flag with carrier (hide main flag, show indicator)
                    flag.group.position.copy(flag.carrier.group.position);
                    flag.group.position.y = -10; // Hide below ground

                    // Update indicator position
                    if (flag.carrier._flagIndicator) {
                        flag.carrier._flagIndicator.position.y = 4;
                    }

                    // Check if carrier reached their base (capture)
                    const distToBase = flag.carrier.group.position.distanceTo(this.flagBases[enemyTeam]);
                    if (distToBase < 5) {
                        // CAPTURED! +20% BUFF TO TEAM
                        this.scores[enemyTeam]++;
                        this._spawnSpark(flag.carrier.group.position, team === 'blue' ? 0x00ffff : 0xff3366, 50);
                        this.playSfx('shuffle');

                        // Apply +20% buff to capturing team
                        this._applyTeamBuff(enemyTeam, 1.20);

                        // Remove indicator and RESPAWN flag at enemy base for loop
                        this._removeFlagIndicator(flag.carrier);
                        flag.group.position.copy(flag.basePosition);
                        flag.carrier = null;
                        flag.isHome = true;
                    }
                }
            } else {
                // Flag visible at position
                flag.group.position.y = 0;

                // Flag is stationary - check for pickup by enemy
                bots.forEach(bot => {
                    if (bot.team === enemyTeam && bot.hp > 0 && !flag.carrier) {
                        const dist = bot.group.position.distanceTo(flag.group.position);
                        if (dist < 3) {
                            // Pickup flag
                            flag.carrier = bot;
                            flag.isHome = false;
                            this._spawnSpark(flag.group.position, 0xffff00, 15);
                            // Add flag indicator above carrier
                            this._addFlagIndicator(bot, team);
                        }
                    }
                });

                // Auto-return if dropped and own team touches it
                if (!flag.isHome) {
                    bots.forEach(bot => {
                        if (bot.team === team && bot.hp > 0) {
                            const dist = bot.group.position.distanceTo(flag.group.position);
                            if (dist < 3) {
                                // Return flag
                                flag.group.position.copy(flag.basePosition);
                                flag.isHome = true;
                                this._spawnSpark(flag.group.position, 0x00ff00, 20);
                            }
                        }
                    });
                }
            }
        });
    }

    _addFlagIndicator(bot, flagTeam) {
        if (bot._flagIndicator) return; // Already has one

        const color = flagTeam === 'blue' ? 0x00ffff : 0xff3366;
        const group = new THREE.Group();

        // Mini pole
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 2, 6),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        pole.position.y = 1;
        group.add(pole);

        // Mini flag
        const flagMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1.2, 0.8),
            new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
        );
        flagMesh.position.set(0.6, 1.8, 0);
        group.add(flagMesh);

        group.position.y = 4;
        bot.group.add(group);
        bot._flagIndicator = group;
    }

    _removeFlagIndicator(bot) {
        if (bot && bot._flagIndicator) {
            bot.group.remove(bot._flagIndicator);
            bot._flagIndicator = null;
        }
    }

    // Apply buff to all team bots on flag capture
    _applyTeamBuff(team, multiplier) {
        if (!this._teamBuffs) this._teamBuffs = { blue: 1.0, red: 1.0 };
        this._teamBuffs[team] *= multiplier;

        // Apply to all bots of this team (will be applied in next update via MenuScene)
        console.log(`[CTF] Team ${team.toUpperCase()} captured flag! Buff now: ${(this._teamBuffs[team] * 100).toFixed(0)}%`);

        // Store buff level for bots to reference
        this.teamBuffLevel = this._teamBuffs;
    }

    // Get team buff multiplier
    getTeamBuff(team) {
        if (!this._teamBuffs) return 1.0;
        return this._teamBuffs[team] || 1.0;
    }

    // Get current objective for AI - Role-based intelligent assignments
    getObjective(bot, allBots) {
        if (this.gameMode === 'koth') {
            // KOTH: Most go to zone, some flank
            const offset = new THREE.Vector3(
                (Math.random() - 0.5) * 12,
                0,
                (Math.random() - 0.5) * 12
            );
            return {
                type: 'zone',
                position: this.hillZone.position.clone().add(offset)
            };
        }

        if (this.gameMode === 'ctf') {
            const enemyTeam = bot.team === 'blue' ? 'red' : 'blue';
            const ownFlag = this.flags[bot.team];
            const enemyFlag = this.flags[enemyTeam];

            // Get bot's role index (0-11 per team)
            const teamBots = allBots ? allBots.filter(b => b.team === bot.team && b.hp > 0) : [];
            const botIndex = teamBots.indexOf(bot);

            // CRITICAL: If our flag is dropped, some must return it
            if (ownFlag && !ownFlag.isHome && !ownFlag.carrier) {
                // First 4 bots prioritize returning
                if (botIndex < 4 || Math.random() < 0.3) {
                    return { type: 'return', position: ownFlag.group.position.clone() };
                }
            }

            // If this bot is carrying enemy flag - GO HOME FAST
            if (enemyFlag && enemyFlag.carrier === bot) {
                return { type: 'capture', position: this.flagBases[bot.team].clone() };
            }

            // If teammate is carrying enemy flag - ESCORT them
            if (enemyFlag && enemyFlag.carrier && enemyFlag.carrier.team === bot.team) {
                // Escorts surround the carrier
                const carrierPos = enemyFlag.carrier.group.position.clone();
                const angle = (botIndex / 12) * Math.PI * 2;
                const escortOffset = new THREE.Vector3(
                    Math.cos(angle) * 8,
                    0,
                    Math.sin(angle) * 8
                );
                return { type: 'escort', position: carrierPos.add(escortOffset) };
            }

            // If enemy is carrying our flag - INTERCEPT
            if (ownFlag && ownFlag.carrier) {
                // Predict where carrier is going (their base)
                const carrierPos = ownFlag.carrier.group.position.clone();
                const enemyBase = this.flagBases[enemyTeam];
                // Intercept between carrier and their base
                const interceptPos = carrierPos.clone().lerp(enemyBase, 0.3);
                if (botIndex < 6) {
                    return { type: 'intercept', position: interceptPos };
                } else {
                    // Others chase directly
                    return { type: 'chase', position: carrierPos };
                }
            }

            // Normal CTF roles based on bot index (0-11)
            // 0-5: ATTACKERS - go get enemy flag
            // 6-8: MIDFIELDERS - patrol middle
            // 9-11: DEFENDERS - protect base

            if (botIndex < 6) {
                // ATTACKERS
                if (enemyFlag && !enemyFlag.carrier) {
                    // Add flanking offset for sneaky approach
                    const flankOffset = new THREE.Vector3(
                        (Math.random() - 0.5) * 15,
                        0,
                        (Math.random() - 0.5) * 15
                    );
                    return {
                        type: 'attack',
                        position: enemyFlag.group.position.clone().add(flankOffset)
                    };
                }
            } else if (botIndex < 9) {
                // MIDFIELDERS - patrol center, intercept enemies
                const patrolPos = new THREE.Vector3(
                    (bot.team === 'blue' ? -20 : 20) + (Math.random() - 0.5) * 30,
                    0,
                    (Math.random() - 0.5) * 40
                );
                return { type: 'patrol', position: patrolPos };
            } else {
                // DEFENDERS - stay near own flag
                const defenseOffset = new THREE.Vector3(
                    (Math.random() - 0.5) * 10,
                    0,
                    (Math.random() - 0.5) * 10
                );
                return {
                    type: 'defend',
                    position: this.flagBases[bot.team].clone().add(defenseOffset)
                };
            }

            return null;
        }

        return null; // Deathmatch - fight freely
    }
}

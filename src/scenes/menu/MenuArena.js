import * as THREE from 'three';

export class MenuArena {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.obstacles = []; // { mesh, box, edges, w, d, h }
        this.coverPoints = [];
        this.particles = [];
        this.projectiles = [];

        this.raycaster = new THREE.Raycaster();
        this.arenaSize = 80; // Expanded Area

        this.shuffleTimer = 10.0;

        // Audio
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.audioCtx.createGain();
        this.masterGain.gain.value = 0.05; // Low volume
        this.masterGain.connect(this.audioCtx.destination);

        this._setupEnv();
    }

    _setupEnv() {
        // Floor
        // Floor (Neon Grid)
        const grid = new THREE.GridHelper(this.arenaSize * 2, 80, 0x00ffff, 0x8800ff);
        grid.position.y = 0.05;
        grid.material.opacity = 0.6;
        grid.material.transparent = true;
        this.scene.add(grid);

        const planeGeo = new THREE.PlaneGeometry(this.arenaSize * 2, this.arenaSize * 2);
        const planeMat = new THREE.MeshBasicMaterial({ color: 0x040408 });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.rotation.x = -Math.PI / 2;
        this.scene.add(plane);

        this.objects = [grid, plane];
        this._spawnInitialObstacles();
    }

    _spawnInitialObstacles() {
        // Procedural Generation: Create 40 random obstacles
        for (let i = 0; i < 40; i++) {
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

        const mesh = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({
            color: 0x222233,
            roughness: 0.2,
            metalness: 0.8,
            emissive: 0x111122,
            emissiveIntensity: 0.4
        }));
        mesh.position.set(cfg.x, cfg.h / 2, cfg.z);
        mesh.scale.set(cfg.w, cfg.h, cfg.d);
        this.scene.add(mesh);

        const edges = new THREE.LineSegments(edgesGeo, new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.4 }));
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
                const newX = (Math.random() - 0.5) * 50;
                const newZ = (Math.random() - 0.5) * 30;

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
                            if (bot.hp <= 0) this._respawnBot(bot);
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
        const x = bot.team === 'blue' ? -35 : 35;
        const z = (Math.random() - 0.5) * 40;
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
    }
}

/**
 * FlatShot Performance Optimization & Security Module
 * Provides utilities for game performance and anti-cheat measures
 */

// ============================================
// PERFORMANCE OPTIMIZATION
// ============================================

/**
 * Object Pool - Reuse objects to reduce GC pressure
 */
export class ObjectPool {
    constructor(factory, initialSize = 10, maxSize = 100) {
        this.factory = factory;
        this.maxSize = maxSize;
        this.pool = [];
        this.active = new Set();

        // Pre-populate pool
        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.factory());
        }
    }

    acquire() {
        let obj = this.pool.pop();
        if (!obj) {
            if (this.active.size < this.maxSize) {
                obj = this.factory();
            } else {
                console.warn('[ObjectPool] Max size reached');
                return null;
            }
        }
        this.active.add(obj);
        return obj;
    }

    release(obj) {
        if (this.active.has(obj)) {
            this.active.delete(obj);
            if (this.pool.length < this.maxSize) {
                this.pool.push(obj);
            }
        }
    }

    clear() {
        this.pool = [];
        this.active.clear();
    }

    get activeCount() { return this.active.size; }
    get pooledCount() { return this.pool.length; }
}

/**
 * Frame Rate Limiter - Ensures consistent frame timing
 */
export class FrameLimiter {
    constructor(targetFps = 60) {
        this.targetFps = targetFps;
        this.frameInterval = 1000 / targetFps;
        this.lastFrameTime = 0;
        this.deltaTime = 0;
        this.fps = 0;
        this.fpsUpdateInterval = 500;
        this.lastFpsUpdate = 0;
        this.frameCount = 0;
    }

    shouldRender(currentTime) {
        const elapsed = currentTime - this.lastFrameTime;
        if (elapsed >= this.frameInterval) {
            this.deltaTime = Math.min(elapsed / 1000, 0.1); // Cap at 100ms
            this.lastFrameTime = currentTime - (elapsed % this.frameInterval);
            this.frameCount++;

            // Update FPS counter
            if (currentTime - this.lastFpsUpdate >= this.fpsUpdateInterval) {
                this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFpsUpdate));
                this.lastFpsUpdate = currentTime;
                this.frameCount = 0;
            }

            return true;
        }
        return false;
    }

    setTargetFps(fps) {
        this.targetFps = Math.max(15, Math.min(240, fps));
        this.frameInterval = 1000 / this.targetFps;
    }
}

/**
 * Spatial Hash Grid - Efficient spatial queries
 */
export class SpatialHashGrid {
    constructor(cellSize = 10) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }

    _getKey(x, z) {
        const cx = Math.floor(x / this.cellSize);
        const cz = Math.floor(z / this.cellSize);
        return `${cx},${cz}`;
    }

    insert(entity, x, z) {
        const key = this._getKey(x, z);
        if (!this.cells.has(key)) {
            this.cells.set(key, new Set());
        }
        this.cells.get(key).add(entity);
        entity._spatialKey = key;
    }

    remove(entity) {
        if (entity._spatialKey && this.cells.has(entity._spatialKey)) {
            this.cells.get(entity._spatialKey).delete(entity);
        }
    }

    update(entity, x, z) {
        const newKey = this._getKey(x, z);
        if (entity._spatialKey !== newKey) {
            this.remove(entity);
            this.insert(entity, x, z);
        }
    }

    query(x, z, radius) {
        const results = [];
        const cellRadius = Math.ceil(radius / this.cellSize);
        const cx = Math.floor(x / this.cellSize);
        const cz = Math.floor(z / this.cellSize);

        for (let dx = -cellRadius; dx <= cellRadius; dx++) {
            for (let dz = -cellRadius; dz <= cellRadius; dz++) {
                const key = `${cx + dx},${cz + dz}`;
                if (this.cells.has(key)) {
                    for (const entity of this.cells.get(key)) {
                        if (entity.mesh) {
                            const dist = Math.hypot(entity.mesh.position.x - x, entity.mesh.position.z - z);
                            if (dist <= radius) {
                                results.push({ entity, distance: dist });
                            }
                        }
                    }
                }
            }
        }

        return results.sort((a, b) => a.distance - b.distance);
    }

    clear() {
        this.cells.clear();
    }
}

/**
 * LOD Manager - Level of Detail management
 */
export class LODManager {
    constructor() {
        this.entities = new Set();
        this.cameraPosition = { x: 0, y: 0, z: 0 };
        this.lodThresholds = {
            high: 20,
            medium: 50,
            low: 100
        };
    }

    register(entity) {
        this.entities.add(entity);
    }

    unregister(entity) {
        this.entities.delete(entity);
    }

    update(cameraPosition) {
        this.cameraPosition = cameraPosition;

        for (const entity of this.entities) {
            if (!entity.mesh) continue;

            const dist = Math.hypot(
                entity.mesh.position.x - cameraPosition.x,
                entity.mesh.position.z - cameraPosition.z
            );

            let lod = 'high';
            if (dist > this.lodThresholds.low) lod = 'culled';
            else if (dist > this.lodThresholds.medium) lod = 'low';
            else if (dist > this.lodThresholds.high) lod = 'medium';

            this._applyLOD(entity, lod, dist);
        }
    }

    _applyLOD(entity, lod, distance) {
        if (entity._currentLOD === lod) return;
        entity._currentLOD = lod;

        switch (lod) {
            case 'culled':
                if (entity.mesh) entity.mesh.visible = false;
                break;
            case 'low':
                if (entity.mesh) {
                    entity.mesh.visible = true;
                    // Reduce update frequency
                    entity._updateSkip = 3;
                }
                break;
            case 'medium':
                if (entity.mesh) {
                    entity.mesh.visible = true;
                    entity._updateSkip = 2;
                }
                break;
            case 'high':
                if (entity.mesh) {
                    entity.mesh.visible = true;
                    entity._updateSkip = 1;
                }
                break;
        }
    }
}

/**
 * Async Task Queue - Spread heavy work across frames
 */
export class AsyncTaskQueue {
    constructor(maxTimePerFrame = 4) {
        this.queue = [];
        this.maxTimePerFrame = maxTimePerFrame; // ms
        this.running = false;
    }

    add(task, priority = 0) {
        this.queue.push({ task, priority });
        this.queue.sort((a, b) => b.priority - a.priority);
    }

    process() {
        const startTime = performance.now();
        while (this.queue.length > 0) {
            if (performance.now() - startTime > this.maxTimePerFrame) break;
            const { task } = this.queue.shift();
            try {
                task();
            } catch (e) {
                console.error('[AsyncTaskQueue] Task error:', e);
            }
        }
    }

    get pending() { return this.queue.length; }
}

// ============================================
// SECURITY & ANTI-CHEAT
// ============================================

/**
 * Value Validator - Sanitize and validate game values
 */
export const ValueValidator = {
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    },

    isValidNumber(value) {
        return typeof value === 'number' && !isNaN(value) && isFinite(value);
    },

    isValidVector3(v) {
        return v &&
            this.isValidNumber(v.x) &&
            this.isValidNumber(v.y) &&
            this.isValidNumber(v.z);
    },

    sanitizePosition(pos, bounds) {
        if (!this.isValidVector3(pos)) {
            return { x: 0, y: 1, z: 0 };
        }
        return {
            x: this.clamp(pos.x, -bounds, bounds),
            y: this.clamp(pos.y, 0, 100),
            z: this.clamp(pos.z, -bounds, bounds)
        };
    },

    sanitizeHealth(health, max = 200) {
        if (!this.isValidNumber(health)) return 100;
        return Math.floor(this.clamp(health, 0, max));
    },

    sanitizeAmmo(ammo, max = 999) {
        if (!this.isValidNumber(ammo)) return 0;
        return Math.floor(this.clamp(ammo, 0, max));
    },

    sanitizeSpeed(speed, max = 50) {
        if (!this.isValidNumber(speed)) return 0;
        return this.clamp(speed, 0, max);
    }
};

/**
 * Rate Limiter - Prevent action spam
 */
export class RateLimiter {
    constructor() {
        this.actions = new Map();
    }

    canPerform(actionId, cooldown) {
        const now = performance.now();
        const last = this.actions.get(actionId) || 0;
        if (now - last < cooldown) return false;
        this.actions.set(actionId, now);
        return true;
    }

    reset(actionId) {
        this.actions.delete(actionId);
    }

    clear() {
        this.actions.clear();
    }
}

/**
 * Integrity Checker - Detect memory tampering
 */
export class IntegrityChecker {
    constructor() {
        this._checksums = new Map();
        this._warningCount = 0;
        this._maxWarnings = 10;
    }

    protect(key, value) {
        this._checksums.set(key, this._hash(value));
    }

    verify(key, currentValue) {
        const expected = this._checksums.get(key);
        if (!expected) return true;

        const actual = this._hash(currentValue);
        if (actual !== expected) {
            this._warningCount++;
            console.warn(`[IntegrityChecker] Value tampering detected for: ${key}`);

            if (this._warningCount >= this._maxWarnings) {
                this._onCheatDetected();
            }
            return false;
        }
        return true;
    }

    update(key, value) {
        this._checksums.set(key, this._hash(value));
    }

    _hash(value) {
        const str = JSON.stringify(value);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }

    _onCheatDetected() {
        console.error('[IntegrityChecker] Multiple cheat attempts detected!');
        // You can add actions here like:
        // - Disable scoring
        // - Mark session as suspicious
        // - Log to server (if multiplayer)
    }
}

/**
 * Input Sanitizer - Prevent injection attacks
 */
export const InputSanitizer = {
    sanitizeString(input, maxLength = 100) {
        if (typeof input !== 'string') return '';
        return input
            .slice(0, maxLength)
            .replace(/[<>]/g, '') // Remove HTML-like chars
            .replace(/[\x00-\x1F\x7F]/g, '') // Remove control chars
            .trim();
    },

    sanitizeUsername(input) {
        return this.sanitizeString(input, 20)
            .replace(/[^a-zA-Z0-9_-]/g, '');
    },

    sanitizeChatMessage(input) {
        return this.sanitizeString(input, 200);
    }
};

/**
 * Session Manager - Track game session integrity
 */
export class SessionManager {
    constructor() {
        this.sessionStart = Date.now();
        this.sessionId = this._generateSessionId();
        this.stats = {
            kills: 0,
            deaths: 0,
            shotsFired: 0,
            shotsHit: 0,
            damageDealt: 0,
            damageTaken: 0,
            playTime: 0
        };
        this._suspicious = false;
    }

    _generateSessionId() {
        return 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
    }

    recordKill() {
        this.stats.kills++;
        this._checkSuspicious();
    }

    recordDeath() {
        this.stats.deaths++;
    }

    recordShot(hit) {
        this.stats.shotsFired++;
        if (hit) this.stats.shotsHit++;
        this._checkSuspicious();
    }

    recordDamage(dealt, taken) {
        if (dealt > 0) this.stats.damageDealt += dealt;
        if (taken > 0) this.stats.damageTaken += taken;
    }

    getAccuracy() {
        if (this.stats.shotsFired === 0) return 0;
        return this.stats.shotsHit / this.stats.shotsFired;
    }

    getKDR() {
        if (this.stats.deaths === 0) return this.stats.kills;
        return this.stats.kills / this.stats.deaths;
    }

    getPlayTime() {
        return (Date.now() - this.sessionStart) / 1000;
    }

    _checkSuspicious() {
        const playTime = this.getPlayTime();

        // Suspicious: Too many kills too fast
        if (playTime > 0 && this.stats.kills / (playTime / 60) > 120) {
            this._markSuspicious('kill_rate');
        }

        // Suspicious: Perfect accuracy with many shots
        if (this.stats.shotsFired > 50 && this.getAccuracy() > 0.95) {
            this._markSuspicious('accuracy');
        }
    }

    _markSuspicious(reason) {
        if (!this._suspicious) {
            console.warn(`[SessionManager] Suspicious activity: ${reason}`);
            this._suspicious = true;
        }
    }

    isSuspicious() {
        return this._suspicious;
    }

    getStats() {
        return {
            ...this.stats,
            playTime: this.getPlayTime(),
            accuracy: this.getAccuracy(),
            kdr: this.getKDR(),
            sessionId: this.sessionId
        };
    }
}

// ============================================
// MEMORY MANAGEMENT
// ============================================

/**
 * Dispose helper for Three.js objects
 */
export function disposeObject(obj) {
    if (!obj) return;

    if (obj.geometry) {
        obj.geometry.dispose();
    }

    if (obj.material) {
        if (Array.isArray(obj.material)) {
            obj.material.forEach(m => disposeMaterial(m));
        } else {
            disposeMaterial(obj.material);
        }
    }

    if (obj.children) {
        for (const child of [...obj.children]) {
            disposeObject(child);
        }
    }
}

function disposeMaterial(material) {
    if (!material) return;

    // Dispose textures
    const textures = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'];
    for (const key of textures) {
        if (material[key]) {
            material[key].dispose();
        }
    }

    material.dispose();
}

/**
 * Memory Monitor - Track memory usage
 */
export class MemoryMonitor {
    constructor() {
        this.samples = [];
        this.maxSamples = 60;
    }

    sample() {
        if (performance.memory) {
            this.samples.push({
                time: Date.now(),
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize
            });

            if (this.samples.length > this.maxSamples) {
                this.samples.shift();
            }
        }
    }

    getUsage() {
        if (!performance.memory) return null;
        return {
            used: Math.round(performance.memory.usedJSHeapSize / 1048576), // MB
            total: Math.round(performance.memory.totalJSHeapSize / 1048576),
            limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576)
        };
    }

    getTrend() {
        if (this.samples.length < 2) return 0;
        const first = this.samples[0].used;
        const last = this.samples[this.samples.length - 1].used;
        return last - first; // Positive = growing
    }
}

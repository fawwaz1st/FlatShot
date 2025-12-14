import * as THREE from 'three';

/**
 * AI Blackboard - Shared knowledge base for AI decision making
 * Updated every frame with world state
 */
export class Blackboard {
    constructor() {
        // Player info
        this.playerPos = null;
        this.playerHealth = 100;
        this.playerUnderAttack = false;
        this.playerDirection = null;

        // Enemy tracking
        this.enemies = [];
        this.visibleEnemies = [];
        this.nearestEnemy = null;
        this.nearestEnemyDist = Infinity;
        this.nearbyEnemyCount = 0;
        this.lastKnownEnemyPos = null;
        this.currentTarget = null;
        this.targetDistance = Infinity;

        // Ally awareness
        this.allies = [];
        this.nearbyAllyCount = 0;

        // Threats
        this.grenades = [];
        this.nearestGrenade = null;
        this.nearestGrenadeDist = Infinity;
        this.dangerZones = [];

        // Cover
        this.coverPoints = [];
        this.nearestCover = null;
        this.isInCover = false;

        // Tactical
        this.flankingRoute = null;
        this.suppressionTargets = [];

        // World
        this.obstacles = [];
        this.worldCenter = new THREE.Vector3(0, 1, 0);
        this.worldBounds = 100;

        // Performance
        this._lastUpdateTime = 0;
        this._updateInterval = 100; // ms
    }

    /**
     * Update blackboard with current world state
     */
    update(entity, context) {
        const now = performance.now();
        if (now - this._lastUpdateTime < this._updateInterval) return;
        this._lastUpdateTime = now;

        const { playerPos, enemies, allies, obstacles, grenades, pickups } = context;
        const entityPos = entity.mesh.position;

        // Player
        this.playerPos = playerPos ? playerPos.clone() : null;
        this.playerHealth = context.playerHealth || 100;

        // Enemies
        this.enemies = enemies || [];
        this.visibleEnemies = [];
        this.nearestEnemy = null;
        this.nearestEnemyDist = Infinity;
        this.nearbyEnemyCount = 0;

        for (const e of this.enemies) {
            const dist = entityPos.distanceTo(e.mesh.position);
            if (dist < this.nearestEnemyDist) {
                this.nearestEnemyDist = dist;
                this.nearestEnemy = e;
            }
            if (dist < 40) {
                this.nearbyEnemyCount++;
                if (entity._hasLineOfSight && entity._hasLineOfSight(e.mesh.position, obstacles)) {
                    this.visibleEnemies.push(e);
                }
            }
        }

        // Select current target (prioritize closest visible enemy)
        if (this.visibleEnemies.length > 0) {
            this.currentTarget = this.visibleEnemies.reduce((best, e) => {
                const dist = entityPos.distanceTo(e.mesh.position);
                const bestDist = entityPos.distanceTo(best.mesh.position);
                // Prefer lower health targets
                const healthBonus = (100 - (e.health || 100)) * 0.5;
                return (dist - healthBonus < bestDist) ? e : best;
            });
            this.targetDistance = entityPos.distanceTo(this.currentTarget.mesh.position);
            this.lastKnownEnemyPos = this.currentTarget.mesh.position.clone();
        } else if (this.nearestEnemy) {
            this.lastKnownEnemyPos = this.nearestEnemy.mesh.position.clone();
            this.currentTarget = null;
            this.targetDistance = Infinity;
        }

        // Allies
        this.allies = allies || [];
        this.nearbyAllyCount = 0;
        for (const a of this.allies) {
            if (a !== entity && a.mesh && entityPos.distanceTo(a.mesh.position) < 15) {
                this.nearbyAllyCount++;
            }
        }

        // Grenades
        this.grenades = grenades || [];
        this.nearestGrenade = null;
        this.nearestGrenadeDist = Infinity;
        for (const g of this.grenades) {
            if (!g.alive || !g.mesh) continue;
            const dist = entityPos.distanceTo(g.mesh.position);
            if (dist < this.nearestGrenadeDist) {
                this.nearestGrenadeDist = dist;
                this.nearestGrenade = g;
            }
        }

        // Cover analysis
        this.obstacles = obstacles || [];
        this.updateCoverPoints(entity, obstacles);

        // World info
        this.worldCenter = context.worldCenter || new THREE.Vector3(0, 1, 0);
    }

    /**
     * Find cover points relative to threats
     */
    updateCoverPoints(entity, obstacles) {
        this.coverPoints = [];
        this.nearestCover = null;
        let minCoverDist = Infinity;

        if (!this.nearestEnemy || !obstacles) return;

        const entityPos = entity.mesh.position;
        const threatPos = this.nearestEnemy.mesh.position;

        for (const obs of obstacles) {
            if (!obs.mesh || !obs.half) continue;

            // Check 4 sides of obstacle
            const sides = [
                { x: obs.mesh.position.x + obs.half.x + 1, z: obs.mesh.position.z },
                { x: obs.mesh.position.x - obs.half.x - 1, z: obs.mesh.position.z },
                { x: obs.mesh.position.x, z: obs.mesh.position.z + obs.half.z + 1 },
                { x: obs.mesh.position.x, z: obs.mesh.position.z - obs.half.z - 1 }
            ];

            for (const side of sides) {
                const coverPos = new THREE.Vector3(side.x, 1, side.z);

                // Check if this position is on opposite side of threat
                const toThreat = threatPos.clone().sub(coverPos).setY(0);
                const toObs = obs.mesh.position.clone().sub(coverPos).setY(0);

                // Good cover if obstacle is between us and threat
                if (toThreat.dot(toObs) > 0) {
                    this.coverPoints.push(coverPos);

                    const dist = entityPos.distanceTo(coverPos);
                    if (dist < minCoverDist) {
                        minCoverDist = dist;
                        this.nearestCover = coverPos;
                    }
                }
            }
        }

        // Check if currently in cover
        this.isInCover = this.nearestCover && entityPos.distanceTo(this.nearestCover) < 2;
    }

    /**
     * Calculate flanking route to target
     */
    calculateFlankingRoute(entity) {
        if (!this.currentTarget) {
            this.flankingRoute = null;
            return;
        }

        const entityPos = entity.mesh.position;
        const targetPos = this.currentTarget.mesh.position;

        // Get perpendicular direction
        const toTarget = targetPos.clone().sub(entityPos).setY(0).normalize();
        const perpendicular = new THREE.Vector3(-toTarget.z, 0, toTarget.x);

        // Choose side (prefer side with more cover)
        const leftPoint = entityPos.clone().add(perpendicular.clone().multiplyScalar(15));
        const rightPoint = entityPos.clone().add(perpendicular.clone().multiplyScalar(-15));

        // Simple heuristic: choose random side with slight preference for less-crowded
        this.flankingRoute = Math.random() < 0.5 ? leftPoint : rightPoint;
    }
}

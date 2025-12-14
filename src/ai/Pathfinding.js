import * as THREE from 'three';

/**
 * A* Pathfinding with Navigation Grid
 * Provides intelligent navigation around obstacles
 */
export class NavGrid {
    constructor(worldBounds = 100, cellSize = 2) {
        this.worldBounds = worldBounds;
        this.cellSize = cellSize;
        this.gridSize = Math.ceil((worldBounds * 2) / cellSize);
        this.grid = null; // 2D array: 0 = walkable, 1 = blocked
        this.obstacles = [];
    }

    /**
     * Build navigation grid from obstacles
     */
    buildFromObstacles(obstacles) {
        this.obstacles = obstacles || [];
        this.grid = [];

        for (let x = 0; x < this.gridSize; x++) {
            this.grid[x] = [];
            for (let z = 0; z < this.gridSize; z++) {
                const worldX = (x * this.cellSize) - this.worldBounds;
                const worldZ = (z * this.cellSize) - this.worldBounds;

                // Check if this cell overlaps any obstacle
                let blocked = false;
                for (const obs of this.obstacles) {
                    if (!obs.mesh || !obs.half) continue;

                    const obsX = obs.mesh.position.x;
                    const obsZ = obs.mesh.position.z;
                    const halfX = obs.half.x + 0.5; // Add padding
                    const halfZ = obs.half.z + 0.5;

                    if (worldX >= obsX - halfX && worldX <= obsX + halfX &&
                        worldZ >= obsZ - halfZ && worldZ <= obsZ + halfZ) {
                        blocked = true;
                        break;
                    }
                }
                this.grid[x][z] = blocked ? 1 : 0;
            }
        }
    }

    /**
     * Convert world position to grid coordinates
     */
    worldToGrid(worldPos) {
        const x = Math.floor((worldPos.x + this.worldBounds) / this.cellSize);
        const z = Math.floor((worldPos.z + this.worldBounds) / this.cellSize);
        return {
            x: Math.max(0, Math.min(this.gridSize - 1, x)),
            z: Math.max(0, Math.min(this.gridSize - 1, z))
        };
    }

    /**
     * Convert grid coordinates to world position
     */
    gridToWorld(gridX, gridZ) {
        return new THREE.Vector3(
            (gridX * this.cellSize) - this.worldBounds + this.cellSize / 2,
            1,
            (gridZ * this.cellSize) - this.worldBounds + this.cellSize / 2
        );
    }

    /**
     * A* Pathfinding algorithm
     */
    findPath(startWorld, endWorld) {
        if (!this.grid) return [endWorld];

        const start = this.worldToGrid(startWorld);
        const end = this.worldToGrid(endWorld);

        // Quick checks
        if (start.x === end.x && start.z === end.z) return [endWorld];
        if (this.grid[end.x] && this.grid[end.x][end.z] === 1) {
            // End is blocked, find nearest unblocked
            const nearest = this.findNearestWalkable(end);
            if (!nearest) return [endWorld];
            end.x = nearest.x;
            end.z = nearest.z;
        }

        const openSet = new Map();
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const key = (x, z) => `${x},${z}`;
        const heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

        const startKey = key(start.x, start.z);
        openSet.set(startKey, start);
        gScore.set(startKey, 0);
        fScore.set(startKey, heuristic(start, end));

        const directions = [
            { x: 0, z: 1 }, { x: 1, z: 0 }, { x: 0, z: -1 }, { x: -1, z: 0 },
            { x: 1, z: 1 }, { x: 1, z: -1 }, { x: -1, z: 1 }, { x: -1, z: -1 }
        ];

        let iterations = 0;
        const maxIterations = 1000;

        while (openSet.size > 0 && iterations < maxIterations) {
            iterations++;

            // Get node with lowest fScore
            let currentKey = null;
            let currentNode = null;
            let lowestF = Infinity;
            for (const [k, node] of openSet) {
                const f = fScore.get(k) || Infinity;
                if (f < lowestF) {
                    lowestF = f;
                    currentKey = k;
                    currentNode = node;
                }
            }

            if (!currentNode) break;

            // Check if we reached the goal
            if (currentNode.x === end.x && currentNode.z === end.z) {
                return this.reconstructPath(cameFrom, currentNode);
            }

            openSet.delete(currentKey);
            closedSet.add(currentKey);

            // Check neighbors
            for (const dir of directions) {
                const nx = currentNode.x + dir.x;
                const nz = currentNode.z + dir.z;
                const neighborKey = key(nx, nz);

                // Skip if out of bounds, blocked, or already visited
                if (nx < 0 || nx >= this.gridSize || nz < 0 || nz >= this.gridSize) continue;
                if (this.grid[nx] && this.grid[nx][nz] === 1) continue;
                if (closedSet.has(neighborKey)) continue;

                // Diagonal movement cost is higher
                const moveCost = (dir.x !== 0 && dir.z !== 0) ? 1.414 : 1;
                const tentativeG = (gScore.get(currentKey) || 0) + moveCost;

                if (!openSet.has(neighborKey)) {
                    openSet.set(neighborKey, { x: nx, z: nz });
                } else if (tentativeG >= (gScore.get(neighborKey) || Infinity)) {
                    continue;
                }

                cameFrom.set(neighborKey, currentNode);
                gScore.set(neighborKey, tentativeG);
                fScore.set(neighborKey, tentativeG + heuristic({ x: nx, z: nz }, end));
            }
        }

        // No path found, return direct line
        return [endWorld];
    }

    /**
     * Reconstruct path from cameFrom map
     */
    reconstructPath(cameFrom, current) {
        const path = [this.gridToWorld(current.x, current.z)];
        const key = (x, z) => `${x},${z}`;
        let currentKey = key(current.x, current.z);

        while (cameFrom.has(currentKey)) {
            const prev = cameFrom.get(currentKey);
            path.unshift(this.gridToWorld(prev.x, prev.z));
            currentKey = key(prev.x, prev.z);
        }

        // Smooth the path
        return this.smoothPath(path);
    }

    /**
     * Smooth path by removing unnecessary waypoints
     */
    smoothPath(path) {
        if (path.length <= 2) return path;

        const smoothed = [path[0]];
        let current = 0;

        while (current < path.length - 1) {
            // Try to skip waypoints while maintaining line of sight
            let farthest = current + 1;
            for (let i = current + 2; i < path.length; i++) {
                if (this.hasDirectPath(path[current], path[i])) {
                    farthest = i;
                }
            }
            smoothed.push(path[farthest]);
            current = farthest;
        }

        return smoothed;
    }

    /**
     * Check if direct path exists between two points
     */
    hasDirectPath(from, to) {
        const steps = Math.ceil(from.distanceTo(to) / this.cellSize);
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = from.x + (to.x - from.x) * t;
            const z = from.z + (to.z - from.z) * t;
            const grid = this.worldToGrid({ x, z });
            if (this.grid[grid.x] && this.grid[grid.x][grid.z] === 1) {
                return false;
            }
        }
        return true;
    }

    /**
     * Find nearest walkable cell to given grid position
     */
    findNearestWalkable(pos) {
        const maxRadius = 10;
        for (let r = 1; r <= maxRadius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
                    const nx = pos.x + dx;
                    const nz = pos.z + dz;
                    if (nx >= 0 && nx < this.gridSize && nz >= 0 && nz < this.gridSize) {
                        if (this.grid[nx] && this.grid[nx][nz] === 0) {
                            return { x: nx, z: nz };
                        }
                    }
                }
            }
        }
        return null;
    }
}

/**
 * Singleton pathfinding manager for the game
 */
export class PathfindingManager {
    constructor() {
        this.navGrid = null;
        this.pathCache = new Map();
        this.cacheTimeout = 2000; // ms
    }

    initialize(worldBounds, obstacles) {
        this.navGrid = new NavGrid(worldBounds, 2);
        this.navGrid.buildFromObstacles(obstacles);
        this.pathCache.clear();
    }

    findPath(from, to) {
        if (!this.navGrid) return [to];

        const cacheKey = `${Math.round(from.x)},${Math.round(from.z)}-${Math.round(to.x)},${Math.round(to.z)}`;
        const cached = this.pathCache.get(cacheKey);

        if (cached && performance.now() - cached.time < this.cacheTimeout) {
            return cached.path;
        }

        const path = this.navGrid.findPath(from, to);
        this.pathCache.set(cacheKey, { path, time: performance.now() });

        // Limit cache size
        if (this.pathCache.size > 100) {
            const oldest = this.pathCache.keys().next().value;
            this.pathCache.delete(oldest);
        }

        return path;
    }

    update(obstacles) {
        if (this.navGrid) {
            this.navGrid.buildFromObstacles(obstacles);
            this.pathCache.clear();
        }
    }
}

// Global pathfinding instance
export const pathfinding = new PathfindingManager();

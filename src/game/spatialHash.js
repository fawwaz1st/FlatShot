
export class SpatialHash {
    constructor(bounds, cellSize) {
        this.bounds = bounds;
        this.cellSize = cellSize;
        this.cells = new Map();
        this.objects = [];
    }

    _getKey(x, z) {
        const cx = Math.floor(x / this.cellSize);
        const cz = Math.floor(z / this.cellSize);
        return `${cx},${cz}`;
    }

    _getKeysForObject(obj) {
        // Safety Check
        if (!obj || !obj.mesh || !obj.mesh.position) return [];

        const pos = obj.mesh.position;
        // Ensure radius is valid
        const rVal = (obj.half ? Math.max(obj.half.x, obj.half.z) : (obj.radius || 1));
        const radius = (Number.isFinite(rVal) ? rVal : 1) + 0.5;

        const startX = Math.floor((pos.x - radius) / this.cellSize);
        const endX = Math.floor((pos.x + radius) / this.cellSize);
        const startZ = Math.floor((pos.z - radius) / this.cellSize);
        const endZ = Math.floor((pos.z + radius) / this.cellSize);

        const keys = [];
        for (let x = startX; x <= endX; x++) {
            for (let z = startZ; z <= endZ; z++) {
                keys.push(`${x},${z}`);
            }
        }
        return keys;
    }

    insert(obj) {
        this.objects.push(obj);
        const keys = this._getKeysForObject(obj);
        for (const k of keys) {
            if (!this.cells.has(k)) this.cells.set(k, []);
            this.cells.get(k).push(obj);
        }
    }

    // For static objects like "obstacles", we might just insert once.
    // For dynamic, we need update() or clear/reinsert.

    query(pos, radius) {
        const startX = Math.floor((pos.x - radius) / this.cellSize);
        const endX = Math.floor((pos.x + radius) / this.cellSize);
        const startZ = Math.floor((pos.z - radius) / this.cellSize);
        const endZ = Math.floor((pos.z + radius) / this.cellSize);

        const results = new Set();
        for (let x = startX; x <= endX; x++) {
            for (let z = startZ; z <= endZ; z++) {
                const k = `${x},${z}`;
                if (this.cells.has(k)) {
                    const bucket = this.cells.get(k);
                    for (const o of bucket) results.add(o);
                }
            }
        }
        return Array.from(results);
    }
}

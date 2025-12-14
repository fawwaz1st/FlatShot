import * as THREE from 'three';
import { TextureGenerator } from '../rendering/TextureGenerator.js';

/**
 * Map Generator System
 * Creates diverse, expandable game maps
 */

export const MapTypes = {
    ARENA: 'arena',
    CITY: 'city',
    WAREHOUSE: 'warehouse',
    FORTRESS: 'fortress',
    HIGHWAY: 'highway'
};

/**
 * Map configuration presets
 */
const MapConfigs = {
    arena: {
        name: 'Combat Arena',
        bounds: 120,
        floorColor: 0x0a1424,
        gridColor: 0x30cfd0,
        fogDensity: 0.012,
        pillars: { count: 24, minHeight: 3, maxHeight: 8 },
        platforms: { count: 18, minSize: 4, maxSize: 12 },
        buildings: { count: 8, minSize: 6, maxSize: 15 },
        walls: true,
        decorations: ['crates', 'barriers']
    },
    city: {
        name: 'Urban Warfare',
        bounds: 180,
        floorColor: 0x1a1a2e,
        gridColor: 0xff6b6b,
        fogDensity: 0.008,
        pillars: { count: 0, minHeight: 0, maxHeight: 0 },
        platforms: { count: 8, minSize: 3, maxSize: 8 },
        buildings: { count: 25, minSize: 8, maxSize: 25, minHeight: 6, maxHeight: 20 },
        walls: false,
        roads: true,
        streetLights: true,
        decorations: ['cars', 'dumpsters', 'barriers']
    },
    warehouse: {
        name: 'Abandoned Warehouse',
        bounds: 100,
        floorColor: 0x1c1c1c,
        gridColor: 0xffd166,
        fogDensity: 0.015,
        pillars: { count: 16, minHeight: 4, maxHeight: 6 },
        platforms: { count: 12, minSize: 3, maxSize: 8 },
        buildings: { count: 0 },
        walls: true,
        crates: { count: 40, minSize: 1, maxSize: 3 },
        shelves: { count: 8, length: 15 },
        decorations: ['barrels', 'pallets', 'forklifts']
    },
    fortress: {
        name: 'Military Fortress',
        bounds: 150,
        floorColor: 0x0d1117,
        gridColor: 0x00ff88,
        fogDensity: 0.01,
        pillars: { count: 8, minHeight: 5, maxHeight: 10 },
        platforms: { count: 20, minSize: 5, maxSize: 15 },
        buildings: { count: 6, minSize: 10, maxSize: 20, minHeight: 8, maxHeight: 15 },
        walls: true,
        bunkers: true,
        turretPlatforms: true,
        decorations: ['sandbags', 'barriers', 'crates']
    },
    highway: {
        name: 'Highway Overpass',
        bounds: 200,
        floorColor: 0x1a1a1a,
        gridColor: 0xffffff,
        fogDensity: 0.006,
        pillars: { count: 20, minHeight: 8, maxHeight: 12 },
        platforms: { count: 6, minSize: 8, maxSize: 20 },
        buildings: { count: 4, minSize: 8, maxSize: 15 },
        walls: false,
        overpass: true,
        vehicles: true,
        decorations: ['barriers', 'signs', 'debris']
    }
};

/**
 * Main Map Generator class
 */
export class MapGenerator {
    constructor(scene) {
        this.scene = scene;
        this.objects = [];
        this.obstacles = [];
        this.spawnPoints = { red: [], blue: [] };
        this.pickupLocations = [];
    }

    /**
     * Generate a map based on type
     */
    generate(mapType = 'arena') {
        this.clear();
        const config = MapConfigs[mapType] || MapConfigs.arena;

        console.log(`[MapGenerator] Generating map: ${config.name}`);

        // 1. Floor
        this.createFloor(config);

        // 2. Boundary walls (if enabled)
        if (config.walls) {
            this.createBoundaryWalls(config);
        }

        // 3. Pillars
        if (config.pillars && config.pillars.count > 0) {
            this.createPillars(config);
        }

        // 4. Platforms
        if (config.platforms && config.platforms.count > 0) {
            this.createPlatforms(config);
        }

        // 5. Buildings
        if (config.buildings && config.buildings.count > 0) {
            this.createBuildings(config);
        }

        // 6. Map-specific features
        if (config.roads) this.createRoads(config);
        if (config.crates) this.createCrates(config);
        if (config.shelves) this.createShelves(config);
        if (config.bunkers) this.createBunkers(config);
        if (config.overpass) this.createOverpass(config);
        if (config.streetLights) this.createStreetLights(config);
        if (config.vehicles) this.createVehicles(config);

        // 7. Generate spawn points
        this.generateSpawnPoints(config);

        // 8. Generate pickup locations
        this.generatePickupLocations(config);

        return {
            obstacles: this.obstacles,
            spawnPoints: this.spawnPoints,
            pickupLocations: this.pickupLocations,
            bounds: config.bounds,
            config: config
        };
    }

    /**
     * Clear current map
     */
    clear() {
        for (const obj of this.objects) {
            this.scene.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        }
        this.objects = [];
        this.obstacles = [];
        this.spawnPoints = { red: [], blue: [] };
        this.pickupLocations = [];
    }

    createFloor(config) {
        const size = config.bounds * 2.5;
        const floorGeo = new THREE.PlaneGeometry(size, size, 1, 1);

        // Create grid texture using TextureGenerator (supports hex numbers)
        const gridTex = TextureGenerator.createGrid(64, 64, config.gridColor, config.floorColor, 2);
        gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
        gridTex.repeat.set(config.bounds / 4, config.bounds / 4);

        const floorMat = new THREE.MeshStandardMaterial({
            map: gridTex,
            roughness: 0.8,
            metalness: 0.2
        });

        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);
        this.objects.push(floor);
    }

    createBoundaryWalls(config) {
        const bounds = config.bounds;
        const wallH = 6;
        const wallT = 1;

        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x1a1f2e,
            roughness: 0.6,
            metalness: 0.4
        });

        const walls = [
            { size: [bounds * 2, wallH, wallT], pos: [0, wallH / 2, -bounds] },
            { size: [bounds * 2, wallH, wallT], pos: [0, wallH / 2, bounds] },
            { size: [wallT, wallH, bounds * 2], pos: [-bounds, wallH / 2, 0] },
            { size: [wallT, wallH, bounds * 2], pos: [bounds, wallH / 2, 0] }
        ];

        for (const wall of walls) {
            const geo = new THREE.BoxGeometry(...wall.size);
            const mesh = new THREE.Mesh(geo, wallMat);
            mesh.position.set(...wall.pos);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            this.objects.push(mesh);
        }
    }

    createPillars(config) {
        const { count, minHeight, maxHeight } = config.pillars;
        const bounds = config.bounds * 0.8;

        const pillarMat = new THREE.MeshStandardMaterial({
            color: 0x2a3442,
            roughness: 0.5,
            metalness: 0.6,
            emissive: config.gridColor,
            emissiveIntensity: 0.1
        });

        for (let i = 0; i < count; i++) {
            const height = minHeight + Math.random() * (maxHeight - minHeight);
            const radius = 0.6 + Math.random() * 0.4;
            const x = (Math.random() - 0.5) * bounds * 2;
            const z = (Math.random() - 0.5) * bounds * 2;

            const geo = new THREE.CylinderGeometry(radius, radius, height, 12);
            const mesh = new THREE.Mesh(geo, pillarMat);
            mesh.position.set(x, height / 2, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            this.objects.push(mesh);

            this.obstacles.push({
                type: 'pillar',
                mesh: mesh,
                half: new THREE.Vector3(radius, height / 2, radius)
            });
        }
    }

    createPlatforms(config) {
        const { count, minSize, maxSize } = config.platforms;
        const bounds = config.bounds * 0.7;

        const platMat = new THREE.MeshStandardMaterial({
            color: 0x1e2832,
            roughness: 0.4,
            metalness: 0.5
        });

        for (let i = 0; i < count; i++) {
            const w = minSize + Math.random() * (maxSize - minSize);
            const d = minSize + Math.random() * (maxSize - minSize);
            const h = 0.4 + Math.random() * 0.4;
            const x = (Math.random() - 0.5) * bounds * 2;
            const y = Math.random() * 3 + 0.5;
            const z = (Math.random() - 0.5) * bounds * 2;

            const geo = new THREE.BoxGeometry(w, h, d);
            const mesh = new THREE.Mesh(geo, platMat);
            mesh.position.set(x, y, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            this.objects.push(mesh);

            this.obstacles.push({
                type: 'platform',
                mesh: mesh,
                half: new THREE.Vector3(w / 2, h / 2, d / 2)
            });

            // Add edge lights
            this.addEdgeLights(mesh, config.gridColor, w, d);
        }
    }

    createBuildings(config) {
        const { count, minSize, maxSize, minHeight = 4, maxHeight = 12 } = config.buildings;
        const bounds = config.bounds * 0.6;

        const buildingMat = new THREE.MeshStandardMaterial({
            color: 0x151b24,
            roughness: 0.3,
            metalness: 0.7
        });

        for (let i = 0; i < count; i++) {
            const w = minSize + Math.random() * (maxSize - minSize);
            const d = minSize + Math.random() * (maxSize - minSize);
            const h = minHeight + Math.random() * (maxHeight - minHeight);
            const x = (Math.random() - 0.5) * bounds * 2;
            const z = (Math.random() - 0.5) * bounds * 2;

            const geo = new THREE.BoxGeometry(w, h, d);
            const mesh = new THREE.Mesh(geo, buildingMat);
            mesh.position.set(x, h / 2, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            this.objects.push(mesh);

            this.obstacles.push({
                type: 'building',
                mesh: mesh,
                half: new THREE.Vector3(w / 2, h / 2, d / 2)
            });

            // Add windows
            this.addBuildingWindows(mesh, w, h, d, config.gridColor);
        }
    }

    createRoads(config) {
        const bounds = config.bounds;

        const roadMat = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.9,
            metalness: 0.1
        });

        // Main roads (cross pattern)
        const roadWidth = 10;
        const roads = [
            { size: [bounds * 2, 0.1, roadWidth], pos: [0, 0.05, 0] },
            { size: [roadWidth, 0.1, bounds * 2], pos: [0, 0.05, 0] }
        ];

        for (const road of roads) {
            const geo = new THREE.BoxGeometry(...road.size);
            const mesh = new THREE.Mesh(geo, roadMat);
            mesh.position.set(...road.pos);
            this.scene.add(mesh);
            this.objects.push(mesh);
        }

        // Road markings
        const markingMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        for (let i = -bounds + 10; i < bounds; i += 8) {
            const marking = new THREE.Mesh(
                new THREE.BoxGeometry(3, 0.11, 0.3),
                markingMat
            );
            marking.position.set(i, 0.06, 0);
            this.scene.add(marking);
            this.objects.push(marking);

            const marking2 = marking.clone();
            marking2.rotation.y = Math.PI / 2;
            marking2.position.set(0, 0.06, i);
            this.scene.add(marking2);
            this.objects.push(marking2);
        }
    }

    createCrates(config) {
        const { count, minSize, maxSize } = config.crates;
        const bounds = config.bounds * 0.85;

        for (let i = 0; i < count; i++) {
            const size = minSize + Math.random() * (maxSize - minSize);
            const x = (Math.random() - 0.5) * bounds * 2;
            const z = (Math.random() - 0.5) * bounds * 2;

            const crate = this.createCrate(size);
            crate.position.set(x, size / 2, z);
            crate.rotation.y = Math.random() * Math.PI;
            this.scene.add(crate);
            this.objects.push(crate);

            this.obstacles.push({
                type: 'crate',
                mesh: crate,
                half: new THREE.Vector3(size / 2, size / 2, size / 2)
            });
        }
    }

    createCrate(size) {
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x8b7355,
            roughness: 0.8,
            metalness: 0.1
        });
        const mesh = new THREE.Mesh(geo, mat);

        // Add wooden plank details
        const plankMat = new THREE.MeshStandardMaterial({ color: 0x6b5344 });
        const plank1 = new THREE.Mesh(new THREE.BoxGeometry(size * 0.1, size, size * 0.02), plankMat);
        plank1.position.set(-size * 0.3, 0, size / 2 + 0.01);
        mesh.add(plank1);

        const plank2 = plank1.clone();
        plank2.position.x = size * 0.3;
        mesh.add(plank2);

        return mesh;
    }

    createShelves(config) {
        const { count, length } = config.shelves;
        const bounds = config.bounds * 0.7;

        const shelfMat = new THREE.MeshStandardMaterial({
            color: 0x444444,
            roughness: 0.6,
            metalness: 0.5
        });

        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * bounds * 1.5;
            const z = (Math.random() - 0.5) * bounds * 1.5;
            const rotation = Math.floor(Math.random() * 2) * Math.PI / 2;

            // Shelf frame
            const frameGeo = new THREE.BoxGeometry(1, 4, length);
            const frame = new THREE.Mesh(frameGeo, shelfMat);
            frame.position.set(x, 2, z);
            frame.rotation.y = rotation;
            this.scene.add(frame);
            this.objects.push(frame);

            // Shelves
            for (let h = 1; h <= 3; h++) {
                const shelf = new THREE.Mesh(
                    new THREE.BoxGeometry(0.8, 0.1, length),
                    shelfMat
                );
                shelf.position.set(x, h * 1.2, z);
                shelf.rotation.y = rotation;
                this.scene.add(shelf);
                this.objects.push(shelf);
            }

            this.obstacles.push({
                type: 'shelf',
                mesh: frame,
                half: new THREE.Vector3(0.5, 2, length / 2)
            });
        }
    }

    createBunkers(config) {
        const bounds = config.bounds * 0.5;
        const bunkerMat = new THREE.MeshStandardMaterial({
            color: 0x2a3a2a,
            roughness: 0.7,
            metalness: 0.3
        });

        // 4 corner bunkers
        const positions = [
            { x: bounds, z: bounds },
            { x: -bounds, z: bounds },
            { x: bounds, z: -bounds },
            { x: -bounds, z: -bounds }
        ];

        for (const pos of positions) {
            const bunker = new THREE.Group();

            // Main structure
            const main = new THREE.Mesh(
                new THREE.BoxGeometry(8, 3, 8),
                bunkerMat
            );
            main.position.y = 1.5;
            bunker.add(main);

            // Roof
            const roof = new THREE.Mesh(
                new THREE.BoxGeometry(9, 0.5, 9),
                bunkerMat
            );
            roof.position.y = 3.25;
            bunker.add(roof);

            // Gun slit
            const slit = new THREE.Mesh(
                new THREE.BoxGeometry(3, 0.5, 0.5),
                new THREE.MeshBasicMaterial({ color: 0x111111 })
            );
            slit.position.set(0, 2, 4.25);
            bunker.add(slit);

            bunker.position.set(pos.x, 0, pos.z);
            this.scene.add(bunker);
            this.objects.push(bunker);

            this.obstacles.push({
                type: 'bunker',
                mesh: bunker,
                half: new THREE.Vector3(4, 1.5, 4)
            });
        }
    }

    createOverpass(config) {
        const bounds = config.bounds;

        const overpassMat = new THREE.MeshStandardMaterial({
            color: 0x3a3a3a,
            roughness: 0.7,
            metalness: 0.3
        });

        // Main overpass deck
        const deck = new THREE.Mesh(
            new THREE.BoxGeometry(20, 1, bounds * 1.5),
            overpassMat
        );
        deck.position.set(0, 8, 0);
        this.scene.add(deck);
        this.objects.push(deck);

        // Support pillars
        for (let z = -bounds * 0.6; z <= bounds * 0.6; z += 30) {
            const pillar = new THREE.Mesh(
                new THREE.CylinderGeometry(1.5, 2, 8, 12),
                overpassMat
            );
            pillar.position.set(-7, 4, z);
            this.scene.add(pillar);
            this.objects.push(pillar);

            const pillar2 = pillar.clone();
            pillar2.position.x = 7;
            this.scene.add(pillar2);
            this.objects.push(pillar2);

            this.obstacles.push({
                type: 'pillar',
                mesh: pillar,
                half: new THREE.Vector3(1.5, 4, 1.5)
            });
            this.obstacles.push({
                type: 'pillar',
                mesh: pillar2,
                half: new THREE.Vector3(1.5, 4, 1.5)
            });
        }

        // Ramps
        const rampGeo = new THREE.BoxGeometry(8, 0.5, 20);
        const ramp1 = new THREE.Mesh(rampGeo, overpassMat);
        ramp1.position.set(0, 4, -bounds * 0.75 - 10);
        ramp1.rotation.x = Math.PI * 0.1;
        this.scene.add(ramp1);
        this.objects.push(ramp1);

        const ramp2 = ramp1.clone();
        ramp2.position.z = bounds * 0.75 + 10;
        ramp2.rotation.x = -Math.PI * 0.1;
        this.scene.add(ramp2);
        this.objects.push(ramp2);
    }

    createStreetLights(config) {
        const bounds = config.bounds * 0.7;

        for (let x = -bounds; x <= bounds; x += 30) {
            for (let z = -bounds; z <= bounds; z += 30) {
                if (Math.random() < 0.7) continue;

                // Pole
                const pole = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.1, 0.15, 6, 8),
                    new THREE.MeshStandardMaterial({ color: 0x333333 })
                );
                pole.position.set(x, 3, z);
                this.scene.add(pole);
                this.objects.push(pole);

                // Light
                const light = new THREE.PointLight(0xffdd88, 0.8, 15);
                light.position.set(x, 6, z);
                this.scene.add(light);

                // Light housing
                const housing = new THREE.Mesh(
                    new THREE.SphereGeometry(0.3, 8, 8),
                    new THREE.MeshBasicMaterial({ color: 0xffdd88 })
                );
                housing.position.set(x, 6, z);
                this.scene.add(housing);
                this.objects.push(housing);
            }
        }
    }

    createVehicles(config) {
        const bounds = config.bounds * 0.6;
        const count = 8;

        for (let i = 0; i < count; i++) {
            const x = (Math.random() - 0.5) * bounds * 2;
            const z = (Math.random() - 0.5) * bounds * 2;
            const car = this.createCar();
            car.position.set(x, 0, z);
            car.rotation.y = Math.random() * Math.PI * 2;
            this.scene.add(car);
            this.objects.push(car);

            this.obstacles.push({
                type: 'vehicle',
                mesh: car,
                half: new THREE.Vector3(1.5, 0.8, 2.5)
            });
        }
    }

    createCar() {
        const group = new THREE.Group();
        const carColors = [0x3366cc, 0xcc3333, 0x33cc33, 0xcccc33, 0xffffff, 0x333333];
        const color = carColors[Math.floor(Math.random() * carColors.length)];

        // Body
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(3, 1.2, 5),
            new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.7 })
        );
        body.position.y = 0.8;
        group.add(body);

        // Cabin
        const cabin = new THREE.Mesh(
            new THREE.BoxGeometry(2.6, 1, 2.5),
            new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.8 })
        );
        cabin.position.set(0, 1.7, -0.5);
        group.add(cabin);

        // Wheels
        const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const wheelPositions = [
            { x: -1.4, z: 1.5 }, { x: 1.4, z: 1.5 },
            { x: -1.4, z: -1.5 }, { x: 1.4, z: -1.5 }
        ];
        for (const wp of wheelPositions) {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(wp.x, 0.4, wp.z);
            group.add(wheel);
        }

        return group;
    }

    addEdgeLights(mesh, color, w, d) {
        const lightMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
        const positions = [
            { geo: [w, 0.05, 0.05], pos: [0, 0.2, d / 2] },
            { geo: [w, 0.05, 0.05], pos: [0, 0.2, -d / 2] },
            { geo: [0.05, 0.05, d], pos: [w / 2, 0.2, 0] },
            { geo: [0.05, 0.05, d], pos: [-w / 2, 0.2, 0] }
        ];
        for (const p of positions) {
            const light = new THREE.Mesh(new THREE.BoxGeometry(...p.geo), lightMat);
            light.position.set(...p.pos);
            mesh.add(light);
        }
    }

    addBuildingWindows(mesh, w, h, d, color) {
        const windowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 });
        const windowSize = 0.8;
        const spacing = 2.5;

        for (let y = 2; y < h - 1; y += spacing) {
            for (let x = -w / 2 + 1.5; x < w / 2 - 1; x += spacing) {
                if (Math.random() < 0.3) continue; // Some windows off
                const window = new THREE.Mesh(
                    new THREE.PlaneGeometry(windowSize, windowSize),
                    windowMat
                );
                window.position.set(x, y - h / 2, d / 2 + 0.01);
                mesh.add(window);

                const window2 = window.clone();
                window2.position.z = -d / 2 - 0.01;
                window2.rotation.y = Math.PI;
                mesh.add(window2);
            }
        }
    }

    generateSpawnPoints(config) {
        const bounds = config.bounds * 0.4;

        // Red team spawns (one side)
        for (let i = 0; i < 5; i++) {
            this.spawnPoints.red.push(new THREE.Vector3(
                -bounds + Math.random() * 10,
                1,
                (Math.random() - 0.5) * bounds
            ));
        }

        // Blue team spawns (other side)
        for (let i = 0; i < 5; i++) {
            this.spawnPoints.blue.push(new THREE.Vector3(
                bounds - Math.random() * 10,
                1,
                (Math.random() - 0.5) * bounds
            ));
        }
    }

    generatePickupLocations(config) {
        const bounds = config.bounds * 0.6;
        const count = Math.floor(config.bounds / 15);

        for (let i = 0; i < count; i++) {
            this.pickupLocations.push(new THREE.Vector3(
                (Math.random() - 0.5) * bounds * 2,
                0.5,
                (Math.random() - 0.5) * bounds * 2
            ));
        }
    }
}

/**
 * Get list of available maps
 */
export function getAvailableMaps() {
    return Object.entries(MapConfigs).map(([id, config]) => ({
        id,
        name: config.name,
        bounds: config.bounds
    }));
}

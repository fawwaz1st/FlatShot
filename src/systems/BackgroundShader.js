import * as THREE from 'three';

export class BackgroundShader {
    constructor(renderer) {
        this.renderer = renderer;
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        this.uniforms = {
            uTime: { value: 0 },
            uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            uMouse: { value: new THREE.Vector2(0.5, 0.5) },
            uColor1: { value: new THREE.Color('#050508') }, // Dark BG
            uColor2: { value: new THREE.Color('#1a0b2e') }  // Deep Purple
        };

        const geometry = new THREE.PlaneGeometry(2, 2);
        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform vec2 uResolution;
                uniform vec2 uMouse;
                uniform vec3 uColor1;
                uniform vec3 uColor2;
                varying vec2 vUv;

                // Simple noise
                float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

                void main() {
                    vec2 uv = vUv;
                    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
                    vec2 p = (uv - 0.5) * aspect;

                    // Grid
                    float size = 10.0;
                    vec2 grid = fract(p * size) - 0.5;
                    float line = 1.0 - smoothstep(0.0, 0.05, abs(grid.x)) * (1.0 - smoothstep(0.0, 0.05, abs(grid.y)));
                    
                    // Wave distortion from mouse
                    float d = distance(uv, uMouse);
                    float wave = sin(d * 20.0 - uTime * 2.0) * 0.05 * exp(-d * 3.0);
                    
                    // Mix colors
                    vec3 color = mix(uColor1, uColor2, uv.y + wave);
                    
                    // Add grid lines (faint)
                    // float gridLines = step(0.98, fract(uv.x * 20.0)) + step(0.98, fract(uv.y * 20.0));
                    // color += vec3(0.1, 0.8, 1.0) * gridLines * 0.1;

                    // Vignette
                    float vign = smoothstep(1.5, 0.5, length(p));
                    color *= vign;

                    gl_FragColor = vec4(color, 1.0);
                }
            `
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);
    }

    resize(width, height) {
        this.uniforms.uResolution.value.set(width, height);
    }

    update(dt) {
        this.uniforms.uTime.value += dt;
        // Mouse update logic should be handled by an InputManager and passed here if needed specifically every frame
        // For now we rely on the pointer event listener updating the uniform value directly
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }

    setMouse(x, y) {
        // x,y normalized 0..1
        this.uniforms.uMouse.value.set(x, y);
    }
}

import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const PostFXShader = {
	uniforms: {
		"tDiffuse": { value: null },
		"resolution": { value: null }, // Vector2
		"time": { value: 0.0 },
		"vignetteDarkness": { value: 2.5 },
		"vignetteOffset": { value: 1.2 },
		"aberrationOffset": { value: 0.0025 }
	},

	vertexShader: `
		varying highp vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}
	`,

	fragmentShader: `
		uniform sampler2D tDiffuse;
		uniform vec2 resolution;
		uniform float time;
		uniform float vignetteDarkness;
		uniform float vignetteOffset;
		uniform float aberrationOffset;
		varying highp vec2 vUv;

		float random(vec2 p) {
			return fract(sin(dot(p.xy, vec2(12.9898, 78.233))) * 43758.5453);
		}

		void main() {
			vec2 uv = vUv;
			
			// Chromatic Aberration
			vec2 dist = uv - 0.5;
			vec2 offset = dist * aberrationOffset;
			
			float r = texture2D(tDiffuse, uv + offset).r;
			float g = texture2D(tDiffuse, uv).g;
			float b = texture2D(tDiffuse, uv - offset).b;
			vec3 color = vec3(r, g, b);

			// Vignette
			uv = uv * 2.0 - 1.0;
			float vignette = length(uv);
			vignette = 1.0 - smoothstep(vignetteOffset, vignetteDarkness, vignette);
			color *= vignette;

			// Scanline / Noise (subtle)
			float scanline = sin(uv.y * resolution.y * 0.5 + time * 10.0) * 0.02;
			color -= scanline;
			
			// Film Grain
			float noise = random(uv + time) * 0.04;
			color += noise;

			gl_FragColor = vec4(color, 1.0);
		}
	`
};

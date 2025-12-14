import * as THREE from 'three';

/**
 * TextureGenerator - Modern texture generation utilities
 * Cleaner API and better organization
 */
export class TextureGenerator {
    /**
     * Create a grid texture
     * @param {number} width - Canvas width
     * @param {number} height - Canvas height  
     * @param {string|number} primaryColor - Primary grid line color
     * @param {string|number} backgroundColor - Background color
     * @param {number} thickness - Line thickness
     */
    static createGrid(width, height, primaryColor, backgroundColor, thickness = 2) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Convert hex numbers to strings if needed
        const bgColor = typeof backgroundColor === 'number'
            ? `#${backgroundColor.toString(16).padStart(6, '0')}`
            : backgroundColor;
        const lineColor = typeof primaryColor === 'number'
            ? `#${primaryColor.toString(16).padStart(6, '0')}`
            : primaryColor;

        // Background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);

        // Glow effect
        ctx.shadowBlur = 8;
        ctx.shadowColor = lineColor;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = thickness;

        // Grid Lines - border
        ctx.beginPath();
        ctx.strokeRect(0, 0, width, height);

        // Cross pattern
        ctx.moveTo(width / 2, 0);
        ctx.lineTo(width / 2, height);
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Secondary subtle lines
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(width / 4, 0); ctx.lineTo(width / 4, height);
        ctx.moveTo(width * 0.75, 0); ctx.lineTo(width * 0.75, height);
        ctx.moveTo(0, height / 4); ctx.lineTo(width, height / 4);
        ctx.moveTo(0, height * 0.75); ctx.lineTo(width, height * 0.75);
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 16;
        return tex;
    }

    /**
     * Create noise texture
     */
    static createNoise(width, height, opacity = 0.1) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        const id = ctx.createImageData(width, height);
        const data = id.data;
        for (let i = 0; i < data.length; i += 4) {
            const v = Math.random() * 255;
            data[i] = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = opacity * 255;
        }
        ctx.putImageData(id, 0, 0);

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    /**
     * Create solid color texture
     */
    static createSolid(width, height, color) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        const fillColor = typeof color === 'number'
            ? `#${color.toString(16).padStart(6, '0')}`
            : color;

        ctx.fillStyle = fillColor;
        ctx.fillRect(0, 0, width, height);

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }
}

// Alias for backward compatibility
export const TextureGen = TextureGenerator;

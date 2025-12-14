import * as THREE from 'three';

export class TextureGen {
    static createGrid(width, height, color1, color2, thickness = 2) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Background (Dark)
        ctx.fillStyle = '#0a0a10'; // Dark almost black
        ctx.fillRect(0, 0, width, height);

        // Glow effect
        ctx.shadowBlur = 8;
        ctx.shadowColor = color1;
        ctx.strokeStyle = color1;
        ctx.lineWidth = thickness;

        // Grid Lines
        ctx.beginPath();
        // border
        ctx.strokeRect(0, 0, width, height);

        // internal pattern (cross)
        ctx.moveTo(width / 2, 0);
        ctx.lineTo(width / 2, height);
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Secondary subtle lines
        ctx.shadowBlur = 0;
        ctx.strokeStyle = color2;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(width / 4, 0); ctx.lineTo(width / 4, height);
        ctx.moveTo(width * 0.75, 0); ctx.lineTo(width * 0.75, height);
        ctx.moveTo(0, height / 4); ctx.lineTo(width, height / 4);
        ctx.moveTo(0, height * 0.75); ctx.lineTo(width, height * 0.75);
        ctx.stroke();

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 16;
        return tex;
    }

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
}

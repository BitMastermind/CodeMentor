const fs = require('fs');
const { createCanvas } = require('canvas');

function drawIcon(size) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#6366f1');
    gradient.addColorStop(1, '#8b5cf6');
    
    // Draw rounded rectangle background
    const radius = size * 0.2;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    // Use manual path for rounded rectangle (compatible with all canvas versions)
    ctx.moveTo(radius, 0);
    ctx.lineTo(size - radius, 0);
    ctx.quadraticCurveTo(size, 0, size, radius);
    ctx.lineTo(size, size - radius);
    ctx.quadraticCurveTo(size, size, size - radius, size);
    ctx.lineTo(radius, size);
    ctx.quadraticCurveTo(0, size, 0, size - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();
    
    // Draw "LC" text
    ctx.fillStyle = 'white';
    ctx.font = `bold ${size * 0.5}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LC', size / 2, size / 2 + size * 0.05);
    
    // Add subtle shine
    const shine = ctx.createLinearGradient(0, 0, 0, size / 2);
    shine.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = shine;
    ctx.beginPath();
    // Rounded rectangle for top half only
    ctx.moveTo(radius, 0);
    ctx.lineTo(size - radius, 0);
    ctx.quadraticCurveTo(size, 0, size, radius);
    ctx.lineTo(size, size / 2);
    ctx.lineTo(0, size / 2);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();
    
    return canvas;
}

// Generate icons
const sizes = [16, 48, 128];
sizes.forEach(size => {
    const canvas = drawIcon(size);
    const buffer = canvas.toBuffer('image/png');
    const filename = `assets/icon${size}.png`;
    fs.writeFileSync(filename, buffer);
    console.log(`✅ Generated ${filename}`);
});

console.log('\n🎉 All icons generated successfully!');


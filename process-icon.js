const fs = require('fs');
const path = require('path');

// Try to use sharp if available, otherwise fallback to canvas
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.log('Sharp not available, trying canvas...');
}

async function processIconWithSharp(sourcePath) {
  const sizes = [16, 48, 128];
  
  for (const size of sizes) {
    await sharp(sourcePath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
      })
      .png()
      .toFile(`assets/icon${size}.png`);
    console.log(`✅ Generated assets/icon${size}.png (${size}x${size})`);
  }
}

function processIconWithCanvas(sourcePath) {
  const { createCanvas, loadImage } = require('canvas');
  const sizes = [16, 48, 128];
  
  return loadImage(sourcePath).then(image => {
    sizes.forEach(size => {
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext('2d');
      
      // Clear canvas with transparent background
      ctx.clearRect(0, 0, size, size);
      
      // Calculate scaling to fit the image while maintaining aspect ratio
      const scale = Math.min(size / image.width, size / image.height);
      const scaledWidth = image.width * scale;
      const scaledHeight = image.height * scale;
      const x = (size - scaledWidth) / 2;
      const y = (size - scaledHeight) / 2;
      
      // Draw the image centered
      ctx.drawImage(image, x, y, scaledWidth, scaledHeight);
      
      // Save the icon
      const buffer = canvas.toBuffer('image/png');
      fs.writeFileSync(`assets/icon${size}.png`, buffer);
      console.log(`✅ Generated assets/icon${size}.png (${size}x${size})`);
    });
  });
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node process-icon.js <path-to-icon-image>');
    console.log('\nExample: node process-icon.js lightning-icon.png');
    console.log('\nSupported formats: PNG, JPG, JPEG, SVG, WebP');
    process.exit(1);
  }
  
  const sourcePath = args[0];
  
  if (!fs.existsSync(sourcePath)) {
    console.error(`❌ Error: File not found: ${sourcePath}`);
    process.exit(1);
  }
  
  console.log(`📸 Processing icon: ${sourcePath}`);
  console.log('📐 Generating sizes: 16x16, 48x48, 128x128\n');
  
  try {
    if (sharp) {
      await processIconWithSharp(sourcePath);
    } else {
      await processIconWithCanvas(sourcePath);
    }
    console.log('\n🎉 All icons generated successfully!');
    console.log('💡 Reload your extension to see the new icons.');
  } catch (error) {
    console.error('❌ Error processing icon:', error.message);
    process.exit(1);
  }
}

main();


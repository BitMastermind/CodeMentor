#!/bin/bash

# Package Extension for Chrome Web Store Submission
# This script creates a clean ZIP file excluding development files

echo "📦 Packaging CodeMentor Extension for Chrome Web Store..."

# Extension name and version
EXT_NAME="codementor-extension"
VERSION="1.0.0"
ZIP_NAME="${EXT_NAME}-v${VERSION}.zip"

# Remove old package if exists
if [ -f "$ZIP_NAME" ]; then
    echo "🗑️  Removing old package..."
    rm "$ZIP_NAME"
fi

# Create ZIP excluding unnecessary files
echo "📦 Creating ZIP package..."
zip -r "$ZIP_NAME" . \
    -x "*.git*" \
    -x "*.DS_Store" \
    -x "node_modules/*" \
    -x "CHROME_STORE_READINESS_REPORT.md" \
    -x "STORE_READINESS.md" \
    -x "VALUE_PROPOSITION_ANALYSIS.md" \
    -x "PUBLISHING_GUIDE.md" \
    -x "CODEFORCES_BLOG_POST.md" \
    -x "SCREENSHOT_GUIDE.md" \
    -x "package-extension.sh" \
    -x "*.md" \
    -x ".cursor/*" \
    -x "prompt-examples/*" \
    -x "test-reminders.*" \
    -x "TEST_REMINDERS_README.md" \
    -x "create-icons.html" \
    -x "generate-icons.js" \
    -x "process-icon.js" \
    -x "requirements.txt"

if [ $? -eq 0 ]; then
    echo "✅ Package created successfully: $ZIP_NAME"
    echo "📊 Package size: $(du -h "$ZIP_NAME" | cut -f1)"
    echo ""
    echo "📝 Next steps:"
    echo "1. Test the package by loading it in Chrome (chrome://extensions/)"
    echo "2. Verify all features work correctly"
    echo "3. Upload to Chrome Web Store Developer Dashboard"
else
    echo "❌ Error creating package"
    exit 1
fi


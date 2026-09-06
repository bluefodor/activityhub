#!/bin/bash
# Script to verify iOS icon configuration

echo "🔍 iOS Icon Configuration Verification"
echo "======================================"
echo ""

ERRORS=0

# Check Info.plist
echo "1. Checking Info.plist..."
if grep -q "<key>CFBundleIconName</key>" ios/ActivePortland/Info.plist && grep -q "<string>AppIcon</string>" ios/ActivePortland/Info.plist; then
    echo "   ✅ CFBundleIconName = AppIcon found in Info.plist"
else
    echo "   ❌ CFBundleIconName missing or incorrect in Info.plist"
    ERRORS=$((ERRORS + 1))
fi

# Check app.json
echo ""
echo "2. Checking app.json..."
if grep -q '"CFBundleIconName": "AppIcon"' app.json; then
    echo "   ✅ CFBundleIconName found in app.json"
else
    echo "   ❌ CFBundleIconName missing in app.json"
    ERRORS=$((ERRORS + 1))
fi

# Check build settings
echo ""
echo "3. Checking Xcode build settings..."
if grep -q "INFOPLIST_KEY_CFBundleIconName = AppIcon" ios/ActivePortland.xcodeproj/project.pbxproj; then
    echo "   ✅ INFOPLIST_KEY_CFBundleIconName found in build settings"
else
    echo "   ❌ INFOPLIST_KEY_CFBundleIconName missing in build settings"
    ERRORS=$((ERRORS + 1))
fi

# Check asset catalog
echo ""
echo "4. Checking asset catalog..."
if [ -f "ios/ActivePortland/Images.xcassets/AppIcon.appiconset/Contents.json" ]; then
    echo "   ✅ Asset catalog Contents.json exists"
    
    if [ -f "ios/ActivePortland/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png" ]; then
        echo "   ✅ Icon file exists: App-Icon-1024x1024@1x.png"
        ICON_SIZE=$(file ios/ActivePortland/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png 2>&1 | grep -o "[0-9]* x [0-9]*" | head -1)
        echo "      Icon size: $ICON_SIZE"
    else
        echo "   ❌ Icon file missing: App-Icon-1024x1024@1x.png"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "   ❌ Asset catalog Contents.json missing"
    ERRORS=$((ERRORS + 1))
fi

# Check ASSETCATALOG_COMPILER_APPICON_NAME
echo ""
echo "5. Checking ASSETCATALOG_COMPILER_APPICON_NAME..."
if grep -q "ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon" ios/ActivePortland.xcodeproj/project.pbxproj; then
    echo "   ✅ ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon"
else
    echo "   ❌ ASSETCATALOG_COMPILER_APPICON_NAME not set"
    ERRORS=$((ERRORS + 1))
fi

# Check asset catalog in Resources
echo ""
echo "6. Checking asset catalog in Resources build phase..."
if grep -q "Images.xcassets in Resources" ios/ActivePortland.xcodeproj/project.pbxproj; then
    echo "   ✅ Asset catalog included in Resources"
else
    echo "   ❌ Asset catalog NOT in Resources build phase"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "======================================"
if [ $ERRORS -eq 0 ]; then
    echo "✅ All checks passed! Configuration looks correct."
    echo ""
    echo "⚠️  If builds still fail, the issue is likely in the EAS build process."
    echo "   Consider:"
    echo "   1. Running 'expo prebuild --clean' to regenerate native files"
    echo "   2. Checking EAS build logs for asset catalog compilation errors"
    echo "   3. Verifying the built IPA contains icons (requires downloading the build)"
    exit 0
else
    echo "❌ Found $ERRORS error(s). Please fix before building."
    exit 1
fi


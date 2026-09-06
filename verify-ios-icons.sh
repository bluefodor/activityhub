#!/bin/bash

# Script to verify iOS icon configuration before building
# This checks that all required files and configurations are in place

echo "🔍 Verifying iOS Icon Configuration..."
echo ""

# Check 1: Info.plist has CFBundleIconName
echo "1. Checking Info.plist for CFBundleIconName..."
if grep -q "CFBundleIconName" ios/ActivePortland/Info.plist; then
    echo "   ✅ CFBundleIconName found in Info.plist"
    grep "CFBundleIconName" ios/ActivePortland/Info.plist
else
    echo "   ❌ CFBundleIconName NOT found in Info.plist"
fi
echo ""

# Check 2: app.json has CFBundleIconName
echo "2. Checking app.json for CFBundleIconName..."
if grep -q "CFBundleIconName" app.json; then
    echo "   ✅ CFBundleIconName found in app.json"
    grep "CFBundleIconName" app.json
else
    echo "   ❌ CFBundleIconName NOT found in app.json"
fi
echo ""

# Check 3: Xcode build settings have INFOPLIST_KEY_CFBundleIconName
echo "3. Checking Xcode build settings for INFOPLIST_KEY_CFBundleIconName..."
if grep -q "INFOPLIST_KEY_CFBundleIconName" ios/ActivePortland.xcodeproj/project.pbxproj; then
    echo "   ✅ INFOPLIST_KEY_CFBundleIconName found in build settings"
    grep "INFOPLIST_KEY_CFBundleIconName" ios/ActivePortland.xcodeproj/project.pbxproj | head -2
else
    echo "   ❌ INFOPLIST_KEY_CFBundleIconName NOT found in build settings"
fi
echo ""

# Check 4: Asset catalog exists and has Contents.json
echo "4. Checking asset catalog..."
if [ -f "ios/ActivePortland/Images.xcassets/AppIcon.appiconset/Contents.json" ]; then
    echo "   ✅ Asset catalog Contents.json exists"
    
    # Check if icon file exists
    ICON_FILE=$(grep -o '"filename": "[^"]*"' ios/ActivePortland/Images.xcassets/AppIcon.appiconset/Contents.json | head -1 | cut -d'"' -f4)
    if [ -f "ios/ActivePortland/Images.xcassets/AppIcon.appiconset/$ICON_FILE" ]; then
        echo "   ✅ Icon file exists: $ICON_FILE"
        file "ios/ActivePortland/Images.xcassets/AppIcon.appiconset/$ICON_FILE"
    else
        echo "   ❌ Icon file NOT found: $ICON_FILE"
    fi
else
    echo "   ❌ Asset catalog Contents.json NOT found"
fi
echo ""

# Check 5: ASSETCATALOG_COMPILER_APPICON_NAME is set
echo "5. Checking ASSETCATALOG_COMPILER_APPICON_NAME..."
if grep -q "ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon" ios/ActivePortland.xcodeproj/project.pbxproj; then
    echo "   ✅ ASSETCATALOG_COMPILER_APPICON_NAME is set to AppIcon"
else
    echo "   ❌ ASSETCATALOG_COMPILER_APPICON_NAME NOT set correctly"
fi
echo ""

# Check 6: Asset catalog is in Resources build phase
echo "6. Checking if asset catalog is in Resources build phase..."
if grep -q "Images.xcassets in Resources" ios/ActivePortland.xcodeproj/project.pbxproj; then
    echo "   ✅ Asset catalog is included in Resources"
else
    echo "   ❌ Asset catalog NOT in Resources build phase"
fi
echo ""

echo "✅ Verification complete!"
echo ""
echo "If all checks pass, the configuration should be correct."
echo "If the build still fails, the issue is likely in the EAS build process itself."


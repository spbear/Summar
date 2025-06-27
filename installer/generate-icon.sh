#!/bin/bash

# 간단한 PNG 아이콘을 생성하고 .icns로 변환하는 스크립트

# 1024x1024 PNG 아이콘 생성 (ImageMagick 필요)
if command -v magick &> /dev/null; then
    echo "🎨 ImageMagick으로 아이콘 생성 중..."
    
    # 배경과 아이콘을 하나의 명령으로 생성
    magick -size 1024x1024 xc:none -background none \
        \( -size 1024x1024 xc:none -fill "#667eea" -draw "roundrectangle 0,0 1024,1024 100,100" \) \
        \( -size 1024x1024 xc:none -fill white \
           -draw "roundrectangle 250,200 774,400 20,20" \
           -draw "roundrectangle 250,450 774,550 20,20" \
           -draw "roundrectangle 250,600 774,700 20,20" \
           -draw "roundrectangle 250,750 600,850 20,20" \
        \) \
        -composite assets/icon.png
    
    # .icns 변환 (macOS에서만 가능)
    if command -v iconutil &> /dev/null; then
        echo "🔄 .icns 파일로 변환 중..."
        mkdir -p assets/icon.iconset
        
        # 다양한 크기의 아이콘 생성
        magick assets/icon.png -resize 16x16 assets/icon.iconset/icon_16x16.png
        magick assets/icon.png -resize 32x32 assets/icon.iconset/icon_16x16@2x.png
        magick assets/icon.png -resize 32x32 assets/icon.iconset/icon_32x32.png
        magick assets/icon.png -resize 64x64 assets/icon.iconset/icon_32x32@2x.png
        magick assets/icon.png -resize 128x128 assets/icon.iconset/icon_128x128.png
        magick assets/icon.png -resize 256x256 assets/icon.iconset/icon_128x128@2x.png
        magick assets/icon.png -resize 256x256 assets/icon.iconset/icon_256x256.png
        magick assets/icon.png -resize 512x512 assets/icon.iconset/icon_256x256@2x.png
        magick assets/icon.png -resize 512x512 assets/icon.iconset/icon_512x512.png
        magick assets/icon.png -resize 1024x1024 assets/icon.iconset/icon_512x512@2x.png
        
        iconutil -c icns assets/icon.iconset
        rm -rf assets/icon.iconset
        echo "✅ 아이콘 생성 완료: assets/icon.icns"
    else
        echo "⚠️  iconutil을 찾을 수 없습니다. PNG 아이콘만 생성됩니다."
    fi
else
    echo "⚠️  ImageMagick이 설치되지 않았습니다."
    echo "Homebrew로 설치: brew install imagemagick"
    echo "또는 수동으로 assets/icon.icns 파일을 생성해주세요."
fi

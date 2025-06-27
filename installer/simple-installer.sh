#!/bin/bash

# Summar Plugin Simple Installer
# 용량: 몇 KB

echo "🚀 Summar Plugin Installer"
echo "=========================="

# Obsidian vault 찾기 함수
find_obsidian_vaults() {
    local vaults=()
    
    # 일반적인 Obsidian vault 위치들 검색
    local search_paths=(
        "$HOME/Documents"
        "$HOME/Desktop"
        "$HOME"
        "$HOME/Library/Application Support/obsidian"
        "$HOME/.obsidian"
    )
    
    for path in "${search_paths[@]}"; do
        if [ -d "$path" ]; then
            # .obsidian 폴더가 있는 디렉토리들을 찾기
            while IFS= read -r -d '' vault_path; do
                vault_dir=$(dirname "$vault_path")
                vault_name=$(basename "$vault_dir")
                if [[ "$vault_name" != "." && "$vault_name" != ".obsidian" ]]; then
                    vaults+=("$vault_dir")
                fi
            done < <(find "$path" -maxdepth 3 -name ".obsidian" -type d -print0 2>/dev/null)
        fi
    done
    
    # 중복 제거
    printf '%s\n' "${vaults[@]}" | sort -u
}

# Vault 선택 함수
select_vaults() {
    local vaults=($(find_obsidian_vaults))
    
    if [ ${#vaults[@]} -eq 0 ]; then
        echo "❌ Obsidian vault를 찾을 수 없습니다."
        echo "Obsidian이 설치되어 있고 vault가 생성되어 있는지 확인해주세요."
        exit 1
    fi
    
    echo "� 발견된 Obsidian Vault들:"
    echo ""
    
    for i in "${!vaults[@]}"; do
        vault_name=$(basename "${vaults[$i]}")
        echo "  $((i+1)). $vault_name (${vaults[$i]})"
    done
    
    echo ""
    echo "설치할 vault를 선택해주세요:"
    echo "- 단일 선택: 숫자 입력 (예: 1)"
    echo "- 다중 선택: 쉼표로 구분 (예: 1,3,5)"
    echo "- 전체 선택: 'all' 입력"
    echo ""
    read -p "선택: " selection
    
    local selected_vaults=()
    
    if [[ "$selection" == "all" ]]; then
        selected_vaults=("${vaults[@]}")
    else
        IFS=',' read -ra selections <<< "$selection"
        for sel in "${selections[@]}"; do
            sel=$(echo "$sel" | tr -d ' ')
            if [[ "$sel" =~ ^[0-9]+$ ]] && [ "$sel" -ge 1 ] && [ "$sel" -le ${#vaults[@]} ]; then
                selected_vaults+=("${vaults[$((sel-1))]}")
            else
                echo "⚠️  잘못된 선택: $sel"
            fi
        done
    fi
    
    if [ ${#selected_vaults[@]} -eq 0 ]; then
        echo "❌ 유효한 vault가 선택되지 않았습니다."
        exit 1
    fi
    
    echo "${selected_vaults[@]}"
}

# 플러그인을 vault에 설치하는 함수
install_plugin_to_vault() {
    local vault_path="$1"
    local vault_name=$(basename "$vault_path")
    
    echo "📦 $vault_name vault에 플러그인 설치 중..."
    
    # 플러그인 디렉토리 생성
    local plugins_dir="$vault_path/.obsidian/plugins"
    local summar_dir="$plugins_dir/summar"
    mkdir -p "$summar_dir"
    
    # 플러그인 파일들 복사
    local script_dir="$(dirname "$0")"
    if [ -f "$script_dir/plugin/summar.zip" ]; then
        unzip -q "$script_dir/plugin/summar.zip" -d "$summar_dir"
        echo "  ✅ 플러그인 파일 복사 완료"
    else
        echo "  ❌ 플러그인 파일을 찾을 수 없습니다."
        return 1
    fi
    
    # 플러그인 자동 활성화
    enable_plugin_in_vault "$vault_path"
    
    return 0
}

# 플러그인을 자동으로 활성화하는 함수
enable_plugin_in_vault() {
    local vault_path="$1"
    local vault_name=$(basename "$vault_path")
    local config_dir="$vault_path/.obsidian"
    
    echo "� $vault_name vault에서 플러그인 자동 활성화 중..."
    
    # community-plugins.json 파일 처리
    local community_plugins_file="$config_dir/community-plugins.json"
    
    if [ -f "$community_plugins_file" ]; then
        # 기존 파일이 있는 경우, summar가 이미 있는지 확인
        if ! grep -q '"summar"' "$community_plugins_file"; then
            # summar가 없으면 추가
            local temp_file=$(mktemp)
            jq '. += ["summar"]' "$community_plugins_file" > "$temp_file" 2>/dev/null
            if [ $? -eq 0 ]; then
                mv "$temp_file" "$community_plugins_file"
                echo "  ✅ community-plugins.json 업데이트 완료"
            else
                # jq가 없는 경우 수동으로 추가
                sed 's/]$/,"summar"]/' "$community_plugins_file" > "$temp_file"
                mv "$temp_file" "$community_plugins_file"
                echo "  ✅ community-plugins.json 업데이트 완료 (fallback)"
            fi
            rm -f "$temp_file"
        else
            echo "  ℹ️  플러그인이 이미 활성화되어 있습니다"
        fi
    else
        # 파일이 없는 경우 새로 생성
        echo '["summar"]' > "$community_plugins_file"
        echo "  ✅ community-plugins.json 생성 완료"
    fi
    
    # hotkeys.json 파일 확인/생성 (필요한 경우)
    local hotkeys_file="$config_dir/hotkeys.json"
    if [ ! -f "$hotkeys_file" ]; then
        echo '{}' > "$hotkeys_file"
        echo "  ✅ hotkeys.json 생성 완료"
    fi
    
    echo "  🎉 $vault_name vault에서 Summar 플러그인이 활성화되었습니다!"
}

# 메인 설치 로직
echo "🔍 Obsidian vault 검색 중..."
selected_vaults=($(select_vaults))

echo ""
echo "📋 선택된 vault들:"
for vault in "${selected_vaults[@]}"; do
    echo "  - $(basename "$vault")"
done

echo ""
read -p "계속 진행하시겠습니까? (y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "설치가 취소되었습니다."
    exit 0
fi

echo ""
echo "🚀 플러그인 설치 시작..."
echo ""

# 각 선택된 vault에 플러그인 설치
success_count=0
total_count=${#selected_vaults[@]}

for vault in "${selected_vaults[@]}"; do
    if install_plugin_to_vault "$vault"; then
        ((success_count++))
    fi
    echo ""
done

echo "=========================="
echo "📊 설치 완료 보고:"
echo "  성공: $success_count/$total_count vault"

if [ $success_count -eq $total_count ]; then
    echo "  🎉 모든 vault에 성공적으로 설치되었습니다!"
else
    echo "  ⚠️  일부 vault 설치에 실패했습니다."
fi

echo ""
echo "📝 다음 단계:"
echo "  1. Obsidian을 재시작해주세요"
echo "  2. 플러그인이 자동으로 활성화되어 있을 것입니다"
echo "  3. 설정에서 Summar 플러그인을 확인해주세요"
echo ""
echo "✨ 설치가 완료되었습니다!"

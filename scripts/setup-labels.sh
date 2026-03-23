#!/usr/bin/env bash
# Setup GitHub Issue labels for empire_lms
# Usage: bash scripts/setup-labels.sh

set -euo pipefail

REPO="linda9090/empire_lms"

echo "Creating type labels..."
gh label create "type:feat"     --repo "$REPO" --color "0075ca" --description "새로운 기능"        --force
gh label create "type:fix"      --repo "$REPO" --color "0075ca" --description "버그 수정"          --force
gh label create "type:refactor" --repo "$REPO" --color "0075ca" --description "리팩토링"           --force
gh label create "type:chore"    --repo "$REPO" --color "0075ca" --description "설정·빌드·패키지"   --force
gh label create "type:docs"     --repo "$REPO" --color "0075ca" --description "문서"               --force
gh label create "type:test"     --repo "$REPO" --color "0075ca" --description "테스트"             --force

echo "Creating scope labels..."
gh label create "scope:auth"      --repo "$REPO" --color "0e8a16" --description "인증/권한"        --force
gh label create "scope:course"    --repo "$REPO" --color "0e8a16" --description "수업 관리"        --force
gh label create "scope:activity"  --repo "$REPO" --color "0e8a16" --description "활동 타입 시스템" --force
gh label create "scope:pdf"       --repo "$REPO" --color "0e8a16" --description "PDF 수업·판서"    --force
gh label create "scope:payment"   --repo "$REPO" --color "0e8a16" --description "결제"             --force
gh label create "scope:analytics" --repo "$REPO" --color "0e8a16" --description "학습 분석"        --force
gh label create "scope:lti"       --repo "$REPO" --color "0e8a16" --description "LTI 1.3 연동"     --force
gh label create "scope:api"       --repo "$REPO" --color "0e8a16" --description "API 레이어"       --force
gh label create "scope:ui"        --repo "$REPO" --color "0e8a16" --description "UI 컴포넌트"      --force
gh label create "scope:db"        --repo "$REPO" --color "0e8a16" --description "스키마·마이그레이션" --force

echo "Creating priority labels..."
gh label create "priority:high"   --repo "$REPO" --color "d73a4a" --description "이번 스프린트 필수" --force
gh label create "priority:medium" --repo "$REPO" --color "fbca04" --description "다음 스프린트 고려" --force
gh label create "priority:low"    --repo "$REPO" --color "e4e669" --description "백로그"            --force

echo "All labels created successfully!"

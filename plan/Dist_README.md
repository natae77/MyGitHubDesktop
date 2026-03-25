# GitHub Desktop N - 변경사항 요약

GitHub Desktop 원본(upstream)과의 주요 차별점을 정리한 문서입니다.

---

## 1. External Diff Tool 지원

- Preferences > Integrations에 **External Diff Tool** 설정 추가
- 지원 도구: WinMerge, Beyond Compare, KDiff3, P4Merge, Meld 등 자동 감지
- Custom Diff Tool 경로 직접 지정 가능
- `git difftool --extcmd` 기반으로 동작
- Changes, History, PR 파일 목록 등 **모든 컨텍스트 메뉴에서 Diff tool 실행 가능**
- Merge commit은 첫 번째 부모와 비교, Initial commit은 비활성화

## 2. 선택적 파일 Stash

- 기존 "Stash All Changes"를 **"Stash Selected Files"로 대체**
- 체크박스가 체크된 파일만 선택적으로 stash 가능
- `git stash push -u` 사용으로 untracked 파일도 정상 처리
- 메뉴바 단축키: `Ctrl+Shift+S`

## 3. 선택적 파일 Discard

- 기존 "Discard All Changes"를 **"Discard Selected Files"로 대체**
- 체크된 파일(checked)만 discard 대상
- Partial selection(일부 hunk만 선택) 파일은 자동 제외
- 메뉴바 단축키: `Ctrl+Shift+Backspace`

## 4. MSI 인스톨러 (Program Files 직접 설치)

- **WiX Toolset** 기반 MSI 생성
- `C:\Program Files\GitHubDesktopN\`에 직접 설치 (설치 경로 선택 가능)
- 앱 이름, 실행 파일명을 `GitHubDesktopN`으로 분리하여 원본과 공존 가능

## 5. 키보드 단축키 추가

| 단축키 | 동작 |
|--------|------|
| `Ctrl+C` | 선택된 파일의 relative path 복사 (Changed files 리스트 포커스 시) |
| `Ctrl+E` | Repository root 폴더를 Explorer로 열기 |
| `Ctrl+R` | Repository root 폴더에서 터미널 열기 |

## 6. 컨텍스트 메뉴 재배치 및 개선

- **메뉴 순서 재배치**: 자주 쓰는 항목(Copy path, Diff tool, Explorer)을 상단으로, Ignore 관련 항목은 하단으로 이동

---

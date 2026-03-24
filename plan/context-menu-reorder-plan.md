# 컨텍스트 메뉴 재배치, 레이블 수정 및 키보드 단축키 추가

## 배경
Changed files 목록의 컨텍스트 메뉴에서 잘 쓰이지 않는 Ignore 관련 메뉴가 상단에 위치하여 사용성이 떨어짐.
메뉴 순서를 재배치하고, 레이블을 수정하고, 키보드 단축키를 추가하여 사용성을 개선.

## 수정 파일
- `app/src/ui/changes/filter-changes-list.tsx` — 컨텍스트 메뉴 순서, 레이블, Ctrl+C 단축키
- `app/src/ui/repository.tsx` — Ctrl+E 단축키

## 변경 내용

### 1. Diff Tool 레이블 변경
- **파일**: `app/src/ui/changes/filter-changes-list.tsx` — `getOpenInExternalDiffToolMenuItem()`
- `Open in ${externalDiffToolLabel}` → `Diff by ${externalDiffToolLabel}`

### 2. 컨텍스트 메뉴 순서 재배치
- **파일**: `app/src/ui/changes/filter-changes-list.tsx` — `getDefaultContextMenu()`

변경 후 메뉴 순서:
```
Copy relative file path
Copy file path
─────────────────────
Diff by WinMerge
Show in Explorer
Open in terminal
─────────────────────
Discard changes...
Stash changes
─────────────────────
Open in Visual Studio Code
Open with default program
─────────────────────
(Include/Exclude selected files — 다중 선택 시만)
─────────────────────
Ignore file (add to .gitignore)
Ignore folder (add to .gitignore)
Ignore all .ext files (add to .gitignore)
```

주요 변경점:
1. Copy path 메뉴를 맨 위로 이동 (순서: relative path → file path)
2. Diff tool 바로 아래에 Show in Explorer, Open in terminal 배치
3. Discard + Stash를 중간으로 이동
4. Open in editor, Open with default program을 그 다음에 배치
5. Ignore 관련 메뉴들을 맨 아래로 이동
6. 다중 선택 시 Include/Exclude selected files는 Ignore 위에 배치

### 3. 키보드 단축키 추가

#### Ctrl+C — 선택된 파일의 relative path를 클립보드에 복사
- **파일**: `app/src/ui/changes/filter-changes-list.tsx` — `onItemKeyDown()`
- Changed files 리스트에 포커스가 있을 때 동작
- 단일 선택: 해당 파일의 relative path
- 다중 선택: 선택된 파일들의 relative path를 줄바꿈(`\n`)으로 구분하여 복사
- `selectedFileIDs`로 선택된 파일들을 조회, `Path.normalize()`로 경로 정규화 후 `clipboard.writeText()`로 복사

#### Ctrl+E — root folder에서 Explorer 열기
- **파일**: `app/src/ui/repository.tsx` — `onGlobalKeyDown()`
- Repository 화면에서 포커스가 있을 때 동작 (모달/폴드아웃 열려있으면 무시)
- `shell.showFolderContents(repository.path)`로 repository root folder를 Windows Explorer로 열기
- 참고: `shell.openPath()`는 renderer process에서 동작하지 않아 `shell.showFolderContents()`를 사용

#### Ctrl+R — 터미널에서 열기
- **파일**: `app/src/ui/repository.tsx` — `onGlobalKeyDown()`
- Repository 화면에서 포커스가 있을 때 동작 (모달/폴드아웃 열려있으면 무시)
- `dispatcher.openShell(repository.path)`로 repository root folder에서 터미널 열기

## 검증
- 앱 빌드 후 Changed files 목록에서 우클릭하여 메뉴 순서 확인
- 단일 파일 선택 / 다중 파일 선택 두 경우 모두 메뉴 확인
- Ctrl+C로 단일/다중 파일 relative path 복사 확인
- Ctrl+E로 Explorer 열기 확인
- Ctrl+R로 터미널 열기 확인

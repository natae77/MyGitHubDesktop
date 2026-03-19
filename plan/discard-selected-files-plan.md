# Discard Selected Files 계획서

## Context

현재 "Discard All Changes"는 working directory의 **모든** 파일을 discard합니다. 이를 "Stash Selected Files"와 동일한 패턴으로, **체크된(checked) 파일만** discard하도록 변경합니다. UI 라벨은 "Discard Selected Files"로, 코드 내부 명칭은 `checked` 기반으로 통일합니다.

## 선택 정책

- **`isIncludedInCommit()` (`DiffSelectionType.All`)인 파일만** discard 대상으로 포함
- Partial selection(일부 hunk/line만 선택) 파일은 **제외**
- 이 정책은 Discard, Stash, Commit 모두 동일하게 적용

## 명명 규칙

| 위치 | 이름 |
|------|------|
| UI 라벨 (메뉴, 컨텍스트 메뉴) | `Discard Selected Files` |
| Menu ID / Event | `discard-checked-files` |
| 코드 내부 함수명 | `discardCheckedFiles`, `onDiscardCheckedFiles` |

## 변경 파일 목록

### 1. Menu ID 변경
**`app/src/models/menu-ids.ts`** (line 5)
- `'discard-all-changes'` → `'discard-checked-files'`

### 2. Menu Event 변경
**`app/src/main-process/menu/menu-event.ts`** (line 15)
- `'discard-all-changes'` → `'discard-checked-files'`

### 3. 메뉴 빌드 (라벨 + ID)
**`app/src/main-process/menu/build-default-menu.ts`** (lines 400-404)
- label: `'Discard Selected Files…'` (macOS) / `'Discard selected files…'` (Windows/Linux)
- id: `'discard-all-changes'` → `'discard-checked-files'`
- 키보드 단축키 `CmdOrCtrl+Shift+Backspace` 유지

### 4. 메뉴 활성화 조건 변경
**`app/src/lib/menu-update.ts`** (lines 329-332)
- ID: `'discard-all-changes'` → `'discard-checked-files'`
- 조건: `hasChangedFiles` → `hasCheckedFiles` (체크된 파일이 있을 때만 활성화)
- `hasCheckedFiles`는 이미 line 170, 236-238에 정의되어 있으므로 추가 작업 불필요
- `!rebaseInProgress` 조건 유지
- line 112, 370도 동일하게 ID 변경

### 5. app.tsx - 메뉴 이벤트 핸들러 변경
**`app/src/ui/app.tsx`**
- case 문 (line 462): `'discard-all-changes'` → `'discard-checked-files'`
- `discardAllChanges()` 메서드 (lines 771-787)를 `discardCheckedFiles()`로 이름 변경
- **핵심 변경**: `workingDirectory.files` (전체 파일) 대신 `workingDirectory.files.filter(f => f.isIncludedInCommit())` (체크된 파일만) 사용
- `stashSelectedFiles()`와 동일한 패턴으로 `ChangesSelectionKind.WorkingDirectory` 체크 추가
- 체크된 파일이 0개면 early return
- `discardingAllChanges` 플래그는 넘기지 않음 (기본값 `false` 사용 — 팝업은 항상 "Discard Changes"로 표시)

### 6. 컨텍스트 메뉴 (빈 공간 우클릭)
**`app/src/ui/changes/filter-changes-list.tsx`** (lines 590-604)
- `onDiscardAllChanges` 메서드 → `onDiscardCheckedFiles`로 변경
  - `this.props.workingDirectory.files` → `this.getCheckedFiles()` 사용
  - `discardingAllChanges` 플래그는 넘기지 않음 (기본값 `false`)
- 컨텍스트 메뉴 라벨: `'Discard All Changes…'` → `'Discard Selected Files…'` / `'Discard selected files…'`
- 활성화 조건: `hasLocalChanges` → `hasCheckedFiles`

## 변경하지 않는 것

- **git 레이어**: `discardChanges()` (git-store.ts, app-store.ts, dispatcher.ts)는 이미 파일 배열을 받아 처리하므로 변경 불필요
- **ConfirmDiscardChanges 팝업**: 이미 files 배열을 받아 표시하며, `discardingAllChanges`가 `false`이면 "Discard Changes" / "Confirm Discard Changes"로 표시되므로 변경 불필요
- **개별 파일 우클릭 Discard**: 기존 `onDiscardChanges` (파일 단위 discard)는 그대로 유지
- **키보드 단축키**: `CmdOrCtrl+Shift+Backspace` 그대로 유지

## 검증 방법

1. 빌드: `yarn build:dev` 성공 확인
2. 테스트: `yarn test` 실행하여 기존 유닛 테스트 통과 확인
3. UI 테스트:
   - Changes 탭에서 일부 파일만 체크 → Branch 메뉴 "Discard Selected Files…" 클릭 → 체크된 파일만 확인 팝업에 표시되는지 확인
   - Partial selection 파일(일부 hunk만 선택)은 discard 대상에서 제외되는지 확인
   - 체크된 파일이 없으면 메뉴 비활성화 확인
   - 빈 공간 우클릭 컨텍스트 메뉴에서도 동일하게 동작 확인
   - 개별 파일 우클릭 "Discard Changes"는 기존대로 동작 확인
   - 모든 파일이 체크된 상태에서 discard → 기존 "Discard All"과 동일하게 동작하는지 확인
   - Discard 후 파일 목록이 정상적으로 갱신되는지 확인 (체크 상태 초기화 등)
   - Untracked(new) 파일이 체크된 경우 discard 동작 확인

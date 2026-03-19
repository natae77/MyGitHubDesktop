# Checked vs Selected 메뉴 라벨 수정 및 Stash Selected Files 추가 계획서

## Context

현재 GitHub Desktop에는 두 가지 파일 선택 방식이 공존합니다:

1. **Checked (체크박스)**: `isIncludedInCommit()` — 커밋에 포함할 파일을 체크박스로 선택
2. **Selected (멀티 셀렉션)**: `selectedFileIDs` — 파일 리스트에서 Ctrl/Shift 클릭으로 하이라이트 선택

현재 문제:
- 헤더 컨텍스트 메뉴(빈 공간 우클릭)에서 "Discard Selected Files" / "Stash Selected Files"로 표기되어 있지만, 실제로는 **checked** 파일 기반으로 동작
- 멀티 셀렉션(하이라이트) 후 파일 우클릭 메뉴에는 "Discard n selected changes"만 있고, "Stash n selected files"는 없음

## 수정 내용

### 1. 헤더 컨텍스트 메뉴 라벨 변경 (checked 기반)
**파일:** `app/src/ui/changes/filter-changes-list.tsx` — `onContextMenu()` (line 566)

현재:
```
Discard Selected Files…
Stash Selected Files
```

변경:
```
Discard n Checked Files…    (macOS)
Discard n checked files…    (Windows/Linux)
Stash n Checked Files       (macOS)
Stash n checked files       (Windows/Linux)
```

- `n`은 `checkedFiles.length` 값
- `hasCheckedFiles`가 false면 비활성화 (기존과 동일)
- stash의 `…` 접미사는 기존 stash가 있을 때만 (기존과 동일)

### 2. 멀티 셀렉션 컨텍스트 메뉴에 Stash 추가 (selected 기반)
**파일:** `app/src/ui/changes/filter-changes-list.tsx` — `getDefaultContextMenu()` (line 717)

현재 `paths.length > 1`일 때의 메뉴 구조:
```
Discard n Selected Changes…
---
Ignore n Selected Files (Add to .gitignore)
---
Include Selected Files
Exclude Selected Files
---
Copy Selected Paths
Copy Selected Relative Paths
```

변경: Discard 아래에 Stash 항목 추가:
```
Discard n Selected Changes…
Stash n Selected Files       (또는 Stash n Selected Files… — 기존 stash 있을 때)
---
(나머지 동일)
```

- **partial selection 파일 제외**: `selectedFiles`에서 `isIncludedInCommit()`이 아닌 파일도 포함될 수 있으나, stash 대상에서는 `DiffSelectionType.All`인 파일만 포함
  - 아니요, 여기서는 **하이라이트 선택된 파일 전체**를 stash 대상으로 삼아야 합니다. 멀티 셀렉션은 체크박스와 무관한 별도 선택입니다.
  - 단, **partial selection** (일부 hunk/line만 선택된 파일)은 제외합니다. 즉, `selection.getSelectionType() === DiffSelectionType.None`인 파일과 `DiffSelectionType.Partial`인 파일은 제외.
  - 실제로는 selectedFiles는 하이라이트 기준이므로 partial selection과는 무관합니다. **멀티 셀렉션된 파일 전체를 stash합니다.**
- 활성화 조건: `selectedFiles.length > 1 && this.props.branch !== null && !hasConflicts`
- 핸들러: 기존 `onStashSelectedFiles`를 재사용하되, 인자로 `selectedFiles`를 전달

### 3. 단일 파일 우클릭 시 Stash Changes… 추가
`paths.length === 1`일 때도 Discard Changes… 아래에 Stash Changes… 항목을 추가합니다.

```
Discard Changes…
Stash Changes…       (기존 stash 있을 때 … 붙임)
---
(나머지 동일)
```

- 핸들러: `onStashSelectedFiles([file])` — 단일 파일을 배열로 감싸서 전달
- 활성화 조건: `this.props.branch !== null && !hasConflicts`

### 4. 메뉴바 라벨 변경
**파일:** `app/src/main-process/menu/build-default-menu.ts` (line 400-412)

현재:
```
Discard Selected Files…
Stash Selected Files
```

변경:
```
Discard Checked Files…       (macOS)
Discard checked files…       (Windows/Linux)
Stash Checked Files          (macOS)
Stash checked files          (Windows/Linux)
```

메뉴바에서는 개수(`n`)를 표시하지 않습니다 (메뉴바는 정적 라벨이므로).

## 수정 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `app/src/ui/changes/filter-changes-list.tsx` | (1) `onContextMenu`: 라벨에 `n checked` 포함 (2) `getDefaultContextMenu`: 멀티 셀렉션 시 Stash 항목 추가 |
| `app/src/main-process/menu/build-default-menu.ts` | 메뉴바 라벨 "Selected" → "Checked" 변경 |

## 변경하지 않는 것

- git 레이어, app-store, dispatcher: 기존 `onStashSelectedFiles` 핸들러를 그대로 재사용
- 단일 파일 우클릭 메뉴: Stash Changes… 항목 추가 (Discard Changes… 아래)
- 메뉴 ID/이벤트: 기존 `discard-checked-files`, `stash-selected-files` 그대로 유지
- 체크박스 관련 로직: 변경 없음

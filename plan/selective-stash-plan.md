# 선택적 파일 Stash 기능 구현 계획

## Context

현재 GitHub Desktop의 Stash 기능은 **모든 변경 파일을 한꺼번에** stash하는 방식만 지원합니다.
특정 파일만 골라서 stash하고 싶은 경우가 많은데, 이 기능이 없어 불편합니다.
`git stash push -- <pathspec>` 명령을 활용하면 선택적 stash가 가능하므로,
Changes 탭의 파일 컨텍스트 메뉴에 "Stash Selected Files" 항목을 추가하고,
기존 "Stash All Changes" 메뉴는 제거합니다 (선택적 stash로 대체).

## 구현 범위

### 1. Git 레이어: `createDesktopStashEntry`에 파일 경로 필터 추가
**파일:** `app/src/lib/git/stash.ts` (line 143)

- `createDesktopStashEntry` 함수에 선택적 `files` 파라미터 추가
- `files`가 전달되면 `git stash push -m <message> -- <paths...>` 형태로 실행
- untracked 파일 처리: 선택된 파일 중 untracked 파일만 사전 staging

```typescript
export async function createDesktopStashEntry(
  repository: Repository,
  branch: Branch | string,
  untrackedFilesToStage: ReadonlyArray<WorkingDirectoryFileChange>,
  filesToStash?: ReadonlyArray<WorkingDirectoryFileChange>  // 새 파라미터
): Promise<boolean> {
  // filesToStash가 있으면 해당 파일의 untracked만 staging
  const targetUntracked = filesToStash
    ? untrackedFilesToStage.filter(f => filesToStash.some(s => s.path === f.path))
    : untrackedFilesToStage

  const fullySelectedUntrackedFiles = targetUntracked.map(x => x.withIncludeAll(true))
  await stageFiles(repository, fullySelectedUntrackedFiles)

  const branchName = typeof branch === 'string' ? branch : branch.name
  const message = createDesktopStashMessage(branchName)
  const args = ['stash', 'push', '-m', message]

  // 선택적 stash: pathspec 추가
  if (filesToStash) {
    args.push('--')
    args.push(...filesToStash.map(f => f.path))
  }

  // ... 기존 에러 처리 로직 동일
}
```

### 2. AppStore 레이어: 선택적 stash 메서드 추가
**파일:** `app/src/lib/stores/app-store.ts`

- `_createStashForSelectedFiles(repository, files)` public 메서드 추가
- 기존 `createStashEntry`를 수정하여 파일 목록을 전달할 수 있도록 변경
- 기존 stash 덮어쓰기 확인 로직 재사용

```typescript
public async _createStashForSelectedFiles(
  repository: Repository,
  files: ReadonlyArray<WorkingDirectoryFileChange>
): Promise<boolean> {
  // 기존 _createStashForCurrentBranch와 유사한 흐름
  // createStashEntry에 files 전달
}

private async createStashEntry(
  repository: Repository,
  branch: Branch,
  files?: ReadonlyArray<WorkingDirectoryFileChange>  // 새 파라미터
) {
  const { changesState } = this.repositoryStateCache.get(repository)
  const { workingDirectory } = changesState
  const untrackedFiles = getUntrackedFiles(workingDirectory)
  return createDesktopStashEntry(repository, branch, untrackedFiles, files)
}
```

### 3. Dispatcher 레이어
**파일:** `app/src/ui/dispatcher/dispatcher.ts`

- `createStashForSelectedFiles(repository, files)` 메서드 추가

### 4. UI: 컨텍스트 메뉴에 "Stash Selected Files" 추가
**파일:** `app/src/ui/changes/filter-changes-list.tsx`

**개별 파일 컨텍스트 메뉴** (`getDefaultContextMenu`, line 696):
- 선택된 파일 목록(selectedFiles)을 활용하여 "Stash N Selected File(s)" 메뉴 항목 추가
- separator 뒤, Discard Changes 근처에 배치

```typescript
// getDefaultContextMenu 내부에 추가
{
  label: selectedFiles.length === 1
    ? (__DARWIN__ ? 'Stash Selected File' : 'Stash selected file')
    : (__DARWIN__ ? `Stash ${selectedFiles.length} Selected Files` : `Stash ${selectedFiles.length} selected files`),
  action: () => this.onStashSelectedFiles(selectedFiles),
  enabled: this.props.branch !== null && !hasConflicts,
}
```

**헤더 컨텍스트 메뉴** (`onContextMenu`, line 553):
- "Stash All Changes" 메뉴 항목 제거 (선택적 stash로 대체)
- 메뉴바의 `stash-all-changes` 명령과 단축키(Ctrl+Shift+S)도 제거

**제거 대상 파일 추가:**
- `app/src/main-process/menu/build-default-menu.ts` - stash-all-changes 메뉴 항목 제거
- `app/src/models/menu-ids.ts` - stash-all-changes ID 제거
- `app/src/ui/app.tsx` - stashAllChanges 핸들러 제거
- `app/src/lib/menu-update.ts` - stash 메뉴 상태 업데이트 제거

### 5. 핸들러 메서드 추가
**파일:** `app/src/ui/changes/filter-changes-list.tsx`

```typescript
private onStashSelectedFiles = (files: ReadonlyArray<WorkingDirectoryFileChange>) => {
  const hasStash = this.props.stashEntry !== null
  if (hasStash) {
    // 기존 stash 덮어쓰기 확인 팝업 표시
    this.props.dispatcher.showPopup({
      type: PopupType.ConfirmOverwriteStash,
      branchToCheckout: null,
      repository: this.props.repository,
    })
    return
  }
  this.props.dispatcher.createStashForSelectedFiles(
    this.props.repository,
    files
  )
}
```

## 수정 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `app/src/lib/git/stash.ts` | `createDesktopStashEntry`에 선택적 파일 파라미터 추가 |
| `app/src/lib/stores/app-store.ts` | `_createStashForSelectedFiles` 메서드 + `createStashEntry` 수정 |
| `app/src/ui/dispatcher/dispatcher.ts` | `createStashForSelectedFiles` 메서드 추가 |
| `app/src/ui/changes/filter-changes-list.tsx` | 컨텍스트 메뉴 항목 + 핸들러 추가, "Stash All Changes" 제거 |
| `app/src/ui/app.tsx` | `stashAllChanges` 핸들러 제거 |
| `app/src/main-process/menu/build-default-menu.ts` | stash-all-changes 메뉴 항목 제거 |
| `app/src/models/menu-ids.ts` | stash-all-changes ID 제거 |
| `app/src/lib/menu-update.ts` | stash 메뉴 상태 업데이트 제거 |

## 검증 방법

1. **빌드 확인:** `yarn build:dev` 성공 확인
2. **기능 테스트:**
   - Changes 탭에서 파일 1개 우클릭 > "Stash Selected File" 클릭 → 해당 파일만 stash됨
   - 여러 파일 선택 후 우클릭 > "Stash N Selected Files" 클릭 → 선택된 파일만 stash됨
   - stash 후 나머지 파일은 working directory에 그대로 남아있음
   - 기존 stash가 있을 때 덮어쓰기 확인 다이얼로그 표시
3. **기존 기능 회귀 테스트:**
   - 브랜치 전환 시 자동 stash 여전히 정상 동작
   - "Stash All Changes" 메뉴 및 단축키가 완전히 제거되었는지 확인
4. **단위 테스트:** `yarn test:unit` 통과 확인

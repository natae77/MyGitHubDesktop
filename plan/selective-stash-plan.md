# 선택적 파일 Stash 기능 구현 계획

## Context

현재 GitHub Desktop의 Stash 기능은 **모든 변경 파일을 한꺼번에** stash하는 방식만 지원합니다.
특정 파일만 골라서 stash하고 싶은 경우가 많은데, 이 기능이 없어 불편합니다.
`git stash push -- <pathspec>` 명령을 활용하면 선택적 stash가 가능하므로,
Changes 탭의 헤더 컨텍스트 메뉴에 "Stash Selected Files" 항목을 추가하고,
기존 "Stash All Changes" 메뉴는 제거합니다 (선택적 stash로 대체).

**"Selected"의 의미:** 체크박스(✓)가 체크된 파일을 의미합니다.
파일 리스트의 하이라이트 선택(selectedFileIDs)이 아닌, 커밋에 포함하려고 체크한 파일(`isIncludedInCommit()`)을 기준으로 stash합니다.

## 구현 범위

### 1. Git 레이어: `createDesktopStashEntry`에 파일 경로 필터 추가
**파일:** `app/src/lib/git/stash.ts` (line 142)

- `createDesktopStashEntry` 함수에 선택적 `filesToStash` 파라미터 추가
- `filesToStash`가 전달되면 `git stash push -u -m <message> -- <paths...>` 형태로 실행
- **untracked 파일 처리:** `-u` (--include-untracked) 플래그를 사용하여 git이 네이티브하게 untracked 파일을 stash에 포함.
  이전 방식(untracked 파일을 사전 staging)은 pop 시 untracked 파일이 staged 상태로 복원되는 버그가 있었음.
  `-u` 플래그를 사용하면 pop 시 untracked 파일이 원래 상태(unstaged/untracked)로 정상 복원됨.
- `untrackedFilesToStage` 파라미터는 더 이상 불필요하여 제거됨

```typescript
export async function createDesktopStashEntry(
  repository: Repository,
  branch: Branch | string,
  filesToStash?: ReadonlyArray<WorkingDirectoryFileChange>
): Promise<boolean> {
  const branchName = typeof branch === 'string' ? branch : branch.name
  const message = createDesktopStashMessage(branchName)
  // -u로 untracked 파일을 네이티브 처리 (pop 시 원래 상태 유지)
  const args = ['stash', 'push', '-u', '-m', message]

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
  files?: ReadonlyArray<WorkingDirectoryFileChange>
) {
  // -u 플래그로 untracked 파일을 네이티브 처리하므로
  // getUntrackedFiles() 호출이 불필요해짐
  return createDesktopStashEntry(repository, branch, files)
}
```

### 3. Dispatcher 레이어
**파일:** `app/src/ui/dispatcher/dispatcher.ts`

- `createStashForSelectedFiles(repository, files)` 메서드 추가

### 4. UI: 컨텍스트 메뉴에 "Stash Selected Files" 추가
**파일:** `app/src/ui/changes/filter-changes-list.tsx`

**헤더 컨텍스트 메뉴** (`onContextMenu`):
- "Stash All Changes" 메뉴 항목을 제거하고, "Stash Selected Files"로 대체
- "Discard All Changes…" 바로 아래에 배치
- 체크박스가 체크된 파일이 있고, 브랜치 위에 있고, 충돌이 없을 때만 활성화
- 기존 stash가 있으면 `…` 접미사로 덮어쓰기 확인 다이얼로그 안내

```typescript
// onContextMenu 내부
const checkedFiles = this.getCheckedFiles()
const hasCheckedFiles = checkedFiles.length > 0

const stashLabel = hasStash
  ? (__DARWIN__ ? 'Stash Selected Files…' : 'Stash selected files…')
  : (__DARWIN__ ? 'Stash Selected Files' : 'Stash selected files')

const items: IMenuItem[] = [
  {
    label: __DARWIN__ ? 'Discard All Changes…' : 'Discard all changes…',
    action: this.onDiscardAllChanges,
    enabled: hasLocalChanges,
  },
  {
    label: stashLabel,
    action: () => this.onStashSelectedFiles(checkedFiles),
    enabled: hasCheckedFiles && this.props.branch !== null && !hasConflicts,
  },
]
```

**개별 파일 컨텍스트 메뉴** (`getDefaultContextMenu`):
- stash 메뉴 항목 없음 (파일 우클릭에서는 stash 불필요)

**메뉴바 변경:**
- `stash-all-changes` → `stash-selected-files`로 ID/이벤트/라벨 변경 (단축키 Ctrl+Shift+S 유지)
- `app/src/main-process/menu/build-default-menu.ts` - stash-selected-files로 변경
- `app/src/models/menu-ids.ts` - stash-selected-files ID로 변경
- `app/src/main-process/menu/menu-event.ts` - stash-selected-files 이벤트로 변경
- `app/src/ui/app.tsx` - stashSelectedFiles 핸들러로 변경 (체크된 파일 기반)
- `app/src/lib/menu-update.ts` - 체크된 파일(`isIncludedInCommit()`) 유무 기반으로 활성화 상태 업데이트

### 5. 핸들러 메서드 추가
**파일:** `app/src/ui/changes/filter-changes-list.tsx`

```typescript
// 체크박스가 체크된 파일 목록을 반환 (isIncludedInCommit 기반)
private getCheckedFiles = (): ReadonlyArray<WorkingDirectoryFileChange> => {
  return this.props.workingDirectory.files.filter(f =>
    f.isIncludedInCommit()
  )
}

// 체크된 파일들을 stash (덮어쓰기 확인은 dispatcher 체인에서 처리)
private onStashSelectedFiles = (files: ReadonlyArray<WorkingDirectoryFileChange>) => {
  this.props.dispatcher.createStashForCurrentBranch(
    this.props.repository,
    true,  // showConfirmationDialog
    files
  )
}
```

**파일:** `app/src/ui/app.tsx` (메뉴바 핸들러)

```typescript
private stashSelectedFiles() {
  // ... repository/state 체크 ...
  const checkedFiles = workingDirectory.files.filter(f =>
    f.isIncludedInCommit()
  )
  if (checkedFiles.length === 0) return
  this.props.dispatcher.createStashForCurrentBranch(repository, true, checkedFiles)
}
```

**파일:** `app/src/lib/menu-update.ts` (메뉴 활성화 상태)

```typescript
hasCheckedFiles =
  changesState.selection.kind === ChangesSelectionKind.WorkingDirectory &&
  workingDirectory.files.some(f => f.isIncludedInCommit())
```

**참고:** 기존 `createStashForCurrentBranch`에 `files` 파라미터를 추가하는 방식으로 구현.
별도의 `createStashForSelectedFiles` 메서드를 만들지 않고 기존 메서드를 확장함.
덮어쓰기 확인은 `_createStashForCurrentBranch` 내부에서 처리되며,
`ConfirmOverwriteStash` 팝업에 `filesToStash`를 전달하여 확인 후에도 체크된 파일만 stash됨.

**"Selected"의 의미:** UI 라벨은 사용자 친화적으로 "Selected Files"를 유지하되,
내부적으로는 체크박스 상태(`isIncludedInCommit()`)를 기준으로 동작합니다.
하이라이트 선택(`selectedFileIDs`)은 사용하지 않습니다.

## 수정 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `app/src/lib/git/stash.ts` | `createDesktopStashEntry`에 `filesToStash` 선택적 파라미터 추가, `-u` 플래그로 untracked 파일 네이티브 처리 (기존 `untrackedFilesToStage` 파라미터 및 사전 staging 로직 제거), `git stash push -u -- <paths>` 지원 |
| `app/src/lib/stores/app-store.ts` | `_createStashForCurrentBranch`, `createStashAndDropPreviousEntry`, `createStashEntry`에 `files` 파라미터 전달 체인 추가. `getUntrackedFiles()` 호출 제거 |
| `app/src/ui/dispatcher/dispatcher.ts` | `createStashForCurrentBranch`에 `files` 파라미터 추가 |
| `app/src/ui/changes/filter-changes-list.tsx` | 헤더 컨텍스트 메뉴에 "Stash Selected Files" 추가, `getCheckedFiles`/`onStashSelectedFiles` 핸들러 추가, 파일 우클릭 메뉴에서는 stash 없음 |
| `app/src/ui/app.tsx` | `stashAllChanges` → `stashSelectedFiles`로 변경, 체크된 파일(`isIncludedInCommit`) 기반 stash 처리 |
| `app/src/main-process/menu/build-default-menu.ts` | `stash-all-changes` → `stash-selected-files`로 변경 |
| `app/src/main-process/menu/menu-event.ts` | `stash-all-changes` → `stash-selected-files`로 변경 |
| `app/src/models/menu-ids.ts` | `stash-all-changes` → `stash-selected-files`로 변경 |
| `app/src/models/menu-labels.ts` | `askForConfirmationWhenStashingAllChanges` 속성 제거 |
| `app/src/models/popup.ts` | `ConfirmOverwriteStash`에 `filesToStash` 속성 추가 |
| `app/src/lib/menu-update.ts` | `hasCheckedFiles` (`isIncludedInCommit`) 기반으로 `stash-selected-files` 활성화 상태 업데이트 |
| `app/src/ui/stash-changes/overwrite-stashed-changes-dialog.tsx` | `filesToStash` prop 추가, 덮어쓰기 확인 시 선택된 파일만 stash |

## 검증 방법

1. **빌드 확인:** `yarn build:dev` 성공 확인
2. **Stash/Restore 상태 보존 테스트:**
   - 수정된 파일(tracked) + 새 파일(untracked)을 함께 stash → restore 후 새 파일이 untracked(unstaged) 상태로 복원되는지 확인
   - `-u` 플래그로 인해 `git stash pop` 시 원래 상태가 그대로 유지되어야 함
3. **기능 테스트:**
   - Changes 탭에서 파일 체크박스를 선택 후 Changed Files 영역 우클릭 > "Stash Selected Files" 클릭 → 체크된 파일만 stash됨
   - stash 후 체크하지 않은 파일은 working directory에 그대로 남아있음
   - 기존 stash가 있을 때 "Stash Selected Files…" (말줄임표)으로 표시되고 덮어쓰기 확인 다이얼로그 표시
   - 체크된 파일이 없으면 메뉴가 비활성화됨
   - 개별 파일 우클릭 메뉴에는 stash 항목이 없음
   - 메뉴바 Repository > "Stash Selected Files" (Ctrl+Shift+S) 정상 동작
3. **기존 기능 회귀 테스트:**
   - 브랜치 전환 시 자동 stash 여전히 정상 동작
   - "Stash All Changes" 메뉴가 "Stash Selected Files"로 완전히 대체되었는지 확인
4. **단위 테스트:** `yarn test:unit` 통과 확인

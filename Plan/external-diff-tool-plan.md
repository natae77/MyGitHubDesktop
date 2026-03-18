# External Diff Tool 기능 추가 계획서

## Context
GitHub Desktop에는 "Open in External Editor" 기능이 있지만, 파일의 변경사항을 외부 Diff Tool(Beyond Compare, WinMerge 등)로 비교하는 기능이 없다. 파일 컨텍스트 메뉴에 "Open in External Diff Tool" 항목을 추가하고, 설정에서 Diff Tool을 선택/구성할 수 있게 한다.

## 핵심 설계 결정

### `git difftool` 사용
- 직접 diff tool을 실행하는 대신 `git difftool --no-prompt --extcmd=<tool-path> -- <file>` 활용
- `--extcmd`는 git config에 등록된 tool 이름이 아닌 **직접 실행 명령/경로**를 받는다 (git 공식 문서 확인 완료)
  - git은 `<command> $LOCAL $REMOTE`를 실행하며, configured defaults를 무시한다
  - `$BASE`도 환경변수로 설정됨
- git이 base 버전 추출, temp 파일 생성, 인자 전달을 모두 처리
- 컨텍스트별 git 명령:
  | 컨텍스트 | 명령 |
  |---------|------|
  | 작업 디렉토리 (unstaged) | `git difftool --no-prompt --extcmd=<tool-path> -- <file>` |
  | 커밋 히스토리 (일반) | `git difftool --no-prompt --extcmd=<tool-path> <sha>~1 <sha> -- <file>` |
  | 커밋 히스토리 (merge commit) | `git difftool --no-prompt --extcmd=<tool-path> <parentSHAs[0]> <sha> -- <file>` |
  | PR 파일 | `git difftool --no-prompt --extcmd=<tool-path> <baseSha> <headSha> -- <file>` |

> **참고**: `--extcmd` 대신 임시 git config (`git -c difftool.custom.cmd=...`)를 사용하는 방법도 있으나,
> `--extcmd`가 직접 경로를 받는 것이 git 문서에 명시되어 있으므로 현 방식을 유지한다.

### Custom Diff Tool 인자 처리
- `git difftool --extcmd`가 자동으로 `$LOCAL $REMOTE`를 positional arg로 전달하므로, 커스텀 도구도 경로만 지정하면 됨
- 기존 `ICustomIntegration` 인터페이스 재사용 (path + arguments)

---

## 구현 단계

### Step 1: Diff Tool 감지 레이어 — `app/src/lib/diff-tools/` (신규 디렉토리)

기존 `app/src/lib/editors/` 구조를 그대로 미러링한다.

#### 1.1 `app/src/lib/diff-tools/shared.ts`
- `FoundDiffTool` 타입 (= `{ editor: string; path: string }`, `editors/shared.ts`의 `FoundEditor`와 동일 구조)
- `ExternalDiffToolError` 클래스 (`ExternalEditorError` 미러링)
- `suggestedExternalDiffTool` 상수 (예: Beyond Compare)

#### 1.2 `app/src/lib/diff-tools/found-diff-tool.ts`
- `IFoundDiffTool<T>` 인터페이스 (`editors/found-editor.ts`의 `IFoundEditor<T>`와 동일 구조)

#### 1.3 `app/src/lib/diff-tools/win32.ts`
- `editors/win32.ts` 패턴 복제, 레지스트리 기반 감지
- 감지 대상: Beyond Compare, WinMerge, KDiff3, P4Merge, Meld, DiffMerge, Araxis Merge, ExamDiff Pro, TortoiseMerge

#### 1.4 `app/src/lib/diff-tools/darwin.ts`
- bundle ID 기반 감지
- 감지 대상: Beyond Compare, Kaleidoscope, KDiff3, P4Merge, DiffMerge, Meld, Araxis Merge, FileMerge(opendiff)

#### 1.5 `app/src/lib/diff-tools/linux.ts`
- 파일시스템 경로 기반 감지
- 감지 대상: Meld, KDiff3, Beyond Compare, DiffMerge, P4Merge, Kompare

#### 1.6 `app/src/lib/diff-tools/lookup.ts`
- `getAvailableDiffTools()` — 캐시 포함, `editors/lookup.ts` 패턴 동일
- `findDiffToolOrDefault(name: string | null)` — 이름으로 찾기

#### 1.7 `app/src/lib/diff-tools/launch.ts`
- `launchExternalDiffTool(repositoryPath, file, diffTool, context)` — git difftool 실행
- `launchCustomExternalDiffTool(repositoryPath, file, customDiffTool, context)` — 커스텀 도구용
- `DiffToolContext` 타입 정의:
  ```typescript
  type DiffToolContext =
    | { kind: 'working-directory' }
    | { kind: 'commit'; sha: string; parentSHAs: ReadonlyArray<string> }
    | { kind: 'range'; baseSha: string; headSha: string }
  ```
- **Merge commit 처리**: `commit` 컨텍스트에서 `parentSHAs`를 전달받아 사용
  - 일반 커밋: `parentSHAs[0]` (= `sha~1`)
  - Merge commit (`parentSHAs.length > 1`): 첫 번째 부모(`parentSHAs[0]`)를 기본 사용
    - 이유: git revert도 동일하게 `-m 1` (첫 번째 부모)을 사용 (`app/src/lib/git/revert.ts:29`)
    - 향후 사용자가 부모를 선택하는 UI 확장 가능하나 초기 구현에서는 불필요
  - 부모가 없는 경우 (initial commit): diff tool 실행 불가 → 메뉴 비활성화
- 내부적으로 `child_process.spawn`으로 `git difftool` 실행 (detached, fire-and-forget)
- **오류 처리**:
  - tool 경로가 잘못된 경우: `ExternalDiffToolError` throw
  - spawn 실패 감지: `child.on('error', ...)` 핸들러에서 에러 emit
  - 기존 `editors/launch.ts`의 패턴 동일하게 적용

#### 1.8 `app/src/lib/diff-tools/index.ts`
- re-export

---

### Step 2: 앱 상태 확장

#### 2.1 `app/src/lib/app-state.ts` — IAppState에 속성 추가
```typescript
readonly selectedExternalDiffTool: string | null
readonly resolvedExternalDiffTool: string | null
readonly useCustomDiffTool: boolean
readonly customDiffTool: ICustomIntegration | null
```

#### 2.2 `app/src/lib/stores/app-store.ts` — 상태 관리
- localStorage 키 추가 (기존 에디터 키 패턴과 일관성 유지):
  - `externalDiffToolKey` = `'externalDiffTool'` (기존: `externalEditorKey` = `'externalEditor'`)
  - `useCustomDiffToolKey` = `'use-custom-diff-tool'` (기존: `useCustomEditorKey` = `'use-custom-editor'`)
  - `customDiffToolKey` = `'custom-diff-tool'` (기존: `customEditorKey` = `'custom-editor'`)
- private 필드 추가 (기존 editor 필드 미러링, ~line 418 근처)
- `getState()`에 새 속성 포함
- 초기 로드 로직 추가 (constructor, ~line 2350 근처)
- setter 메서드 추가:
  - `_setExternalDiffTool(name: string)`
  - `_setUseCustomDiffTool(use: boolean)`
  - `_setCustomDiffTool(tool: ICustomIntegration)`
- 실행 메서드: `_openInExternalDiffTool(repository, filePath, context)` (~line 6027 `_openInExternalEditor` 미러링)
  - useCustomDiffTool이면 커스텀 도구 실행
  - 아니면 findDiffToolOrDefault로 찾아서 실행

---

### Step 3: Dispatcher 확장

#### 3.1 `app/src/lib/dispatcher/dispatcher.ts`
- `openInExternalDiffTool(repository, filePath, context)` 메서드 추가
- `setExternalDiffTool(name)` 메서드 추가
- `setUseCustomDiffTool(use)` 메서드 추가
- `setCustomDiffTool(tool)` 메서드 추가

---

### Step 4: 설정(Preferences) UI

#### 4.1 `app/src/ui/preferences/integrations.tsx`
- `IIntegrationsPreferencesProps`에 diff tool 관련 props 추가:
  - `availableDiffTools`, `selectedExternalDiffTool`, `useCustomDiffTool`, `customDiffTool`
  - `onSelectedDiffToolChanged`, `onUseCustomDiffToolChanged`, `onCustomDiffToolChanged`
- `IIntegrationsPreferencesState`에 대응하는 state 추가
- 기존 Editor/Shell 섹션 아래에 **"External Diff Tool"** `<fieldset>` 추가
  - `<Select>` 드롭다운 (감지된 diff tool 목록 + "Configure Custom Diff Tool..." 옵션)
  - 커스텀 선택 시 `<CustomIntegrationForm>` 표시

#### 4.2 `app/src/ui/preferences/preferences.tsx`
- state에 `availableDiffTools` 추가
- `componentDidMount`에서 `getAvailableDiffTools()` 호출
- `Integrations` 컴포넌트에 새 props 전달
- `onSave`에서 dispatcher를 통해 diff tool 설정 저장

---

### Step 5: 컨텍스트 메뉴 추가 (4개 위치)

각 위치에 "Open in [DiffTool]" 또는 "Open in External Diff Tool" 메뉴 항목 추가.

#### 5.1 `app/src/ui/changes/filter-changes-list.tsx` — 작업 디렉토리 (기본 + 리베이스)
- props에 `externalDiffToolLabel?: string`, `onOpenInExternalDiffTool: (path: string) => void` 추가
- `getOpenInExternalDiffToolMenuItem()` 메서드 추가 (기존 `getOpenInExternalEditorMenuItem` 미러링, ~line 643)
- `getDefaultContextMenu()` (~line 662)와 `getRebaseContextMenu()` (~line 810)에 메뉴 항목 삽입
  - "Open in [Editor]" 바로 아래에 배치

#### 5.2 `app/src/ui/history/selected-commits.tsx` — 커밋 히스토리
- props에 `externalDiffToolLabel?: string` 추가
- `onContextMenu()` (~line 371)에 메뉴 항목 추가
- context: `{ kind: 'commit', sha: selectedCommits[0].sha, parentSHAs: selectedCommits[0].parentSHAs }`
- `Commit` 모델은 이미 `parentSHAs: ReadonlyArray<string>`과 `isMergeCommit: boolean`을 가지고 있음 (`app/src/models/commit.ts:126`)
- 부모가 없는 커밋(initial commit)이면 메뉴 항목 비활성화

#### 5.3 `app/src/ui/open-pull-request/pull-request-files-changed.tsx` — PR 파일
- props에 `externalDiffToolLabel?: string` 추가
- `onFileContextMenu()` (~line 154)에 메뉴 항목 추가
- **PR base/head SHA 확보 방법** (추가 API 호출 불필요):
  - `CommittedFileChange` 모델이 이미 `commitish` (head SHA)와 `parentCommitish` (base SHA)를 포함 (`app/src/models/status.ts:342-353`)
  - base SHA는 `getMergeBase()` (`app/src/lib/git/merge.ts`)로 로컬 git에서 계산됨
  - `IPullRequestState.commitSHAs`에 모든 PR 커밋 SHA가 있음 (`app/src/lib/app-state.ts:1094`)
  - 따라서 context: `{ kind: 'range', baseSha: file.parentCommitish, headSha: file.commitish }`
  - **주의**: PR diff는 merge-base 기준이므로, `git difftool`에도 동일한 base를 전달해야 정확한 비교가 됨

---

### Step 6: Props 전달 경로 (Prop Threading)

`externalDiffToolLabel`과 action callback을 app.tsx에서 각 컴포넌트까지 전달. 기존 `externalEditorLabel` 전달 경로를 그대로 따라간다.

**실제 확인된 전달 경로** (코드베이스 grep 결과):

1. **Changes 경로**:
   `App` (`app.tsx:1311` getter) → `Repository` (`repository.tsx:87` props, `:318` 전달) → `ChangesSidebar` (`changes/sidebar.tsx:75`) → `FilterChangesList`

2. **History 경로**:
   `App` → `Repository` (`repository.tsx:514` 전달) → `SelectedCommits` (`history/selected-commits.tsx:55`)
   - ⚠️ 계획서의 "HistorySidebar"는 존재하지 않음 → **`SelectedCommits`가 직접 수신**

3. **PR 경로**:
   `App` (`app.tsx:2421-2443`) → `OpenPullRequestDialog` (`open-pull-request-dialog.tsx:156,181`) → `PullRequestFilesChanged` (`pull-request-files-changed.tsx:52`)

중간 경로의 모든 컴포넌트 인터페이스에 새 props를 추가해야 함. `externalEditorLabel` 전달 경로를 grep하여 동일한 위치에 추가.

**추가 전달 필요 파일**:
- `app/src/ui/repository.tsx` — `IRepositoryViewProps` 인터페이스
- `app/src/ui/changes/sidebar.tsx` — `IChangesSidebarProps` 인터페이스
- `app/src/ui/open-pull-request/open-pull-request-dialog.tsx` — props 인터페이스

---

## 수정 대상 파일 요약

| 구분 | 파일 | 작업 |
|------|------|------|
| **신규** | `app/src/lib/diff-tools/shared.ts` | 타입, 에러 클래스, 추천 도구 |
| **신규** | `app/src/lib/diff-tools/found-diff-tool.ts` | IFoundDiffTool 인터페이스 |
| **신규** | `app/src/lib/diff-tools/win32.ts` | Windows 감지 |
| **신규** | `app/src/lib/diff-tools/darwin.ts` | macOS 감지 |
| **신규** | `app/src/lib/diff-tools/linux.ts` | Linux 감지 |
| **신규** | `app/src/lib/diff-tools/lookup.ts` | 조회 + 캐시 |
| **신규** | `app/src/lib/diff-tools/launch.ts` | git difftool 실행 + 오류 처리 |
| **신규** | `app/src/lib/diff-tools/index.ts` | re-export |
| **수정** | `app/src/lib/app-state.ts` | IAppState 속성 추가 |
| **수정** | `app/src/lib/stores/app-store.ts` | 상태 관리, localStorage, 실행 로직, 에러 핸들링 |
| **수정** | `app/src/lib/dispatcher/dispatcher.ts` | dispatcher 메서드 추가 |
| **수정** | `app/src/ui/preferences/integrations.tsx` | Diff Tool 설정 UI |
| **수정** | `app/src/ui/preferences/preferences.tsx` | props 연결 |
| **수정** | `app/src/ui/changes/filter-changes-list.tsx` | 컨텍스트 메뉴 (기본+리베이스) |
| **수정** | `app/src/ui/history/selected-commits.tsx` | 컨텍스트 메뉴 (히스토리, merge commit 처리 포함) |
| **수정** | `app/src/ui/open-pull-request/pull-request-files-changed.tsx` | 컨텍스트 메뉴 (PR, commitish/parentCommitish 활용) |
| **수정** | `app/src/ui/app.tsx` | externalDiffToolLabel getter, callback 정의 |
| **수정** | `app/src/ui/repository.tsx` | props 전달 (IRepositoryViewProps) |
| **수정** | `app/src/ui/changes/sidebar.tsx` | props 전달 (IChangesSidebarProps) |
| **수정** | `app/src/ui/open-pull-request/open-pull-request-dialog.tsx` | props 전달 |

---

## 검증 방법

1. **빌드 확인**: `yarn compile:dev` 성공 여부
2. **설정 UI**: Preferences > Integrations에서 Diff Tool 드롭다운이 표시되고, 설치된 도구가 감지되는지 확인
3. **커스텀 도구**: "Configure Custom Diff Tool..."을 선택하고 경로 입력 후 저장이 되는지 확인
4. **컨텍스트 메뉴 (Changes)**: 변경된 파일 우클릭 → "Open in [DiffTool]" 항목이 보이고 클릭 시 diff tool이 실행되는지
5. **컨텍스트 메뉴 (History)**: 커밋 히스토리의 파일 우클릭 → diff tool 실행 확인
6. **컨텍스트 메뉴 (PR)**: PR 파일 목록 우클릭 → diff tool 실행 확인
7. **설정 미지정 시**: diff tool이 설정되지 않았을 때 메뉴 항목이 비활성화 또는 숨겨지는지 확인
8. **Merge commit**: 히스토리에서 merge commit 파일을 우클릭 → 첫 번째 부모와의 diff가 정상 실행되는지
9. **Initial commit**: 최초 커밋의 파일 → diff tool 메뉴가 비활성화되는지
10. **오류 케이스**: 잘못된 tool 경로 설정 후 실행 → 에러 배너가 표시되는지
11. **테스트**: `yarn test:unit` 통과 여부

---

## Diff Tool 미설정 시 UI 처리

기존 External Editor의 패턴을 따른다:
- **메뉴 항목**: 항상 표시하되, diff tool이 미설정이면 **비활성화(disabled)** 처리
- **비활성화 라벨**: "Open in External Diff Tool" (tool 이름 없이)
- **클릭 시**: 비활성화 상태이므로 동작하지 않음
- Preferences에서 diff tool을 선택하면 즉시 활성화

---

## 오류 처리

| 오류 상황 | 처리 방법 |
|-----------|----------|
| tool 경로가 잘못됨 (spawn ENOENT) | `ExternalDiffToolError` throw → App 레벨 에러 핸들러가 배너 표시 |
| git difftool 실행 실패 | stderr 파싱 → 사용자에게 에러 메시지 표시 |
| diff 대상 파일이 없음 (삭제된 파일) | git difftool이 자체 처리 (빈 파일과 비교) |
| Initial commit (부모 없음) | 메뉴 비활성화로 사전 차단 |

오류 표시는 기존 `_openInExternalEditor`의 에러 핸들링 패턴을 동일하게 사용:
- `app-store.ts`의 `_openInExternalDiffTool`에서 try-catch
- `ExternalDiffToolError` 발생 시 `this.emitError(error)` 호출
- 기존 에러 배너 시스템이 자동으로 UI에 표시

---

## 단위 테스트 계획

구현 완료 후 `app/test/unit/diff-tools/` 디렉토리에 테스트 추가:

1. **`lookup-test.ts`** — `findDiffToolOrDefault()` 로직 테스트
2. **`launch-test.ts`** — `launchExternalDiffTool()` git 명령 인자 조합 검증
   - working-directory 컨텍스트 → `['difftool', '--no-prompt', '--extcmd=...', '--', file]`
   - commit 컨텍스트 (일반) → `[..., parentSHA, sha, '--', file]`
   - commit 컨텍스트 (merge) → `[..., parentSHAs[0], sha, '--', file]`
   - range 컨텍스트 → `[..., baseSha, headSha, '--', file]`
3. **`shared-test.ts`** — `ExternalDiffToolError` 생성 및 메시지 검증

> 우선순위: 낮음 (구현 후 추가 가능, 기능 동작 검증이 우선)

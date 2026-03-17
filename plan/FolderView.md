# GitHub Desktop UI 재구성: P4V 스타일 File Explorer + Scoped History

## Context

GitHub Desktop의 현재 레이아웃(좌측 사이드바: Changes/History 탭 + 우측: Diff)을 P4V(Perforce Visual Client) 스타일로 재구성한다. 좌측에 File Explorer를 배치하고, 파일/폴더 선택 시 해당 경로의 히스토리만 필터링하여 우측에 표시한다. `git log -- <path>`가 네이티브 지원되므로 백엔드 구현이 수월하다.

## 최종 레이아웃

```
┌─────────────────────────────────────────────────────────────────┐
│  [Repository ▼]  [Branch ▼]  [Fetch origin]                    │
├──────────────────┬──────────────────────────────────────────────┤
│  📁 Explorer     │  [Changes] [History]                         │
│  ├── 📁 app      │                                              │
│  │   ├── 📁 src  │  (탭에 따라 다른 콘텐츠)                      │
│  │   ├── ☑file   │                                              │
│  ├── 📁 docs     │                                              │
│  └── 📄 pkg.json │                                              │
├──────────────────┴──────────────────────────────────────────────┤
```

- **Explorer 클릭 → History 탭의 커밋 목록이 해당 경로로 필터링**
- **커밋 선택 시 파일 목록 동작** (아래 3.5.2에서 상세 정의)

---

## Phase 1: State & Data Layer

### 1.1 `getCommits()`에 path 필터링 파라미터 추가
- **파일**: `app/src/lib/git/log.ts` (line 120-205)
- 현재 `additionalArgs`가 `--` 앞에 위치 → `paths` 파라미터를 추가하여 `--` 뒤에 배치
- ```typescript
  export async function getCommits(
    repository, revisionRange?, limit?, skip?,
    additionalArgs = [],
    paths: ReadonlyArray<string> = []  // NEW
  )
  // args.push(...additionalArgs, '--', ...paths)
  ```
- **회귀 안전**: 기존 호출부 4곳 모두 `paths` 미지정 → 기본값 `[]`로 하위 호환 유지
  - `GitStore.loadCommitBatch()` (line 229)
  - `GitStore.loadLocalCommits()` (lines 621-628)
  - `GitStore.getCommitsBetweenBranches()` (line 1761)
  - `CompareSidebar.onScroll()` via dispatcher

### 1.2 `git ls-tree` 헬퍼 생성
- **새 파일**: `app/src/lib/git/ls-tree.ts`
- `git ls-tree -r --name-only HEAD` → flat path 목록 반환
- 트리 구조 빌드 유틸리티 함수 포함

### 1.3 새 State 정의
- **파일**: `app/src/lib/app-state.ts`
- ```typescript
  export interface IFileTreeNode {
    readonly name: string
    readonly path: string           // 전체 경로
    readonly type: 'tree' | 'blob'
    readonly children?: ReadonlyArray<IFileTreeNode>
  }

  export interface IExplorerState {
    /** HEAD 기준 파일 트리 (커밋된 파일만) */
    readonly fileTree: ReadonlyArray<IFileTreeNode>
    readonly selectedPath: string | null
    /** 선택된 경로가 폴더인지 파일인지 */
    readonly selectedPathType: 'tree' | 'blob' | null
    readonly expandedPaths: ReadonlySet<string>
    readonly filteredCommitSHAs: ReadonlyArray<string>
    readonly isLoadingFilteredCommits: boolean
    /**
     * 현재 로딩 중인 HEAD SHA. null이면 로딩 중이 아님.
     * 브랜치 전환 시 경쟁 조건 방지: ls-tree 완료 시 이 값과 현재 HEAD SHA를
     * 비교하여 불일치하면 결과를 폐기한다.
     * (isLoadingFileTree boolean 대신 SHA 추적으로 stale 응답 감지)
     */
    readonly loadingForBranchSha: string | null
    ```
  - **`loadingForBranchSha` 상태 전이 테이블**:
    | 현재 상태 | 이벤트 | 전이 조건 | 새 상태 |
    |-----------|--------|-----------|---------|
    | `null` | `loadRepositoryFileTree()` 시작 | — | 현재 HEAD SHA |
    | HEAD SHA | `ls-tree` 완료 (성공) | `loadingForBranchSha === 현재 HEAD SHA` (일치) | `null` (결과 적용) |
    | HEAD SHA | `ls-tree` 완료 (성공) | `loadingForBranchSha !== 현재 HEAD SHA` (불일치) | `null` (결과 **폐기**, stale 응답) |
    | HEAD SHA | `ls-tree` 실패 (에러) | — | `null` (에러 처리, 이전 트리 유지) |
    | HEAD SHA | 새 `loadRepositoryFileTree()` 호출 (브랜치 전환) | — | 새 HEAD SHA (이전 요청의 결과는 SHA 불일치로 자동 폐기) |
  - ```typescript
    /**
     * Working directory 변경 사항 (staged + unstaged 파일 경로 목록).
     * fileTree(HEAD 기준)와 별도로 관리되며, WorkingDirectoryStatus에서 파생.
     * Explorer에서 수정 파일 ☑ 표시에 사용.
     */
    readonly workingDirectoryChangedPaths: ReadonlySet<string>
  }
  ```
- `IRepositoryState`에 `explorerState` 추가
- `IAppState`에 `explorerWidth: IConstrainedValue` 추가
- **갱신 주기**:
  - `fileTree`: 브랜치 전환, 커밋 완료, fetch/pull 시 (`_refreshRepository()` 내에서)
  - `workingDirectoryChangedPaths`: `GitStore.loadStatus()` 완료 시마다 WorkingDirectoryStatus에서 파생
  - `expandedPaths`: 사용자 토글 액션 시
  - `filteredCommitSHAs`: `selectedPath` 변경 시
- **[피드백 #2] `workingDirectoryChangedPaths` 갱신 최적화**:
  - **경로 형식**: 상대 경로 (repository root 기준). `WorkingDirectoryStatus.files`의 `path`가 이미
    `git status --porcelain=2`에서 상대 경로로 반환되므로, `fileTree`의 `IFileTreeNode.path`와 동일 형식으로 통일됨.
  - **디바운싱 전략**: `workingDirectoryChangedPaths`의 갱신 자체는 디바운싱하지 않음 (데이터 정합성 우선).
    대신 **Explorer 리렌더링을 최적화**:
    1. `workingDirectoryChangedPaths`는 `ReadonlySet<string>`이므로 shallow equality 비교로 변경 감지
    2. `loadStatus()` 결과에서 경로 Set을 추출할 때, 이전 Set과 내용이 동일하면 **같은 참조를 유지** (불필요한 리렌더링 방지)
    3. FileExplorer 컴포넌트에서 `shouldComponentUpdate` (또는 `React.memo`)로 Set 참조 비교
  - 기존 `loadStatus()`에는 별도 디바운싱이 없으나, `requestsInFight` Set으로 동시 호출이 방지되므로
    실제 빈번한 갱신은 발생하지 않음

### 1.4 Dispatcher / AppStore / GitStore 연결
- **파일**: `app/src/ui/dispatcher/dispatcher.ts`, `app/src/lib/stores/app-store.ts`, `app/src/lib/stores/git-store.ts`
- 새 dispatcher 메서드:
  - `selectExplorerPath(repo, path, pathType)` → 경로 설정 + 필터링된 커밋 로드
  - `toggleExplorerFolder(repo, path)` → 폴더 접기/펼치기
  - `loadRepositoryFileTree(repo)` → 파일 트리 갱신
  - `setExplorerWidth(width)` / `resetExplorerWidth()`
- GitStore에 `loadFilteredCommitBatch(commitish, skip, path)` 추가

---

## Phase 2: File Explorer 컴포넌트

### 2.1 TreeList 가상화 어댑터
- **새 파일**: `app/src/ui/lib/list/tree-list.tsx`
- **배경**: 기존 `List` 컴포넌트는 flat list 전용, `SectionList`은 2레벨(section→row)까지만 지원.
  임의 깊이의 트리 구조를 지원하려면 **계층→평탄화 어댑터 레이어**가 필요.
- **설계**:
  ```typescript
  interface IFlattenedTreeRow {
    readonly node: IFileTreeNode
    readonly depth: number        // 들여쓰기 레벨
    readonly isExpanded: boolean  // 폴더인 경우
    readonly isExpandable: boolean
    readonly path: string         // 고유 식별자
  }

  /**
   * 트리 데이터를 expandedPaths 기준으로 평탄화하여
   * 기존 List 컴포넌트의 rowRenderer에 전달.
   * expand/collapse 시 평탄 목록을 재계산.
   */
  /**
   * 정렬 규칙: 각 depth에서 폴더 우선, 그 안에서 알파벳 순 (case-insensitive).
   * 예: app/, banana/, apple.ts, cat.ts (폴더 우선 → 파일, 각 그룹 내 알파벳순)
   * P4V/VS Code 관례와 동일.
   */
  function flattenTree(
    nodes: ReadonlyArray<IFileTreeNode>,
    expandedPaths: ReadonlySet<string>
  ): ReadonlyArray<IFlattenedTreeRow>
  ```
- 기존 `react-virtualized` 기반 `List` 컴포넌트를 내부적으로 사용
- `rowRenderer`에서 `depth`에 따라 `padding-left` 적용
- 키보드 내비게이션: 좌/우 화살표로 폴더 접기/펼치기, 상/하로 이동

- **[피드백 #1] 가상화 동적 rowCount 및 rowHeight 처리**:
  - 기존 `List` 컴포넌트는 `rowCount` 변경 시 `componentDidUpdate`에서 Grid 재렌더링을 자동 트리거함
    (`this.props.rowCount !== prevProps.rowCount` 체크, `list.tsx` line 1027)
  - **따라서 폴더 접기/펼치기 시 `flattenTree()` 재계산 → 새 `rowCount` prop 전달 → Grid 자동 갱신**으로 충분
  - `rowHeight`: **고정값 사용** (30px). depth별 들여쓰기는 `padding-left: ${depth * 16}px`로 CSS만으로 처리.
    기존 List가 `rowHeight`를 `number | ((info: {index}) => number)` 유니온으로 지원하므로,
    v1에서는 고정값으로 시작하고 필요 시 함수형으로 전환 가능
  - `onRowsRendered` 이슈: `flattenTree()`가 순수 함수이므로 expand/collapse 시점에 동기적으로
    평탄 목록이 갱신되며, React의 render cycle 내에서 rowCount가 일관되게 유지됨

### 2.2 FileExplorer 컴포넌트
- **새 파일**: `app/src/ui/explorer/file-explorer.tsx`
- **새 파일**: `app/src/ui/explorer/file-tree-node.tsx`
- **새 파일**: `app/src/ui/explorer/index.ts`
- Props: `fileTree`, `expandedPaths`, `selectedPath`, `workingDirectoryChangedPaths`
- 내부적으로 `TreeList` 사용 (2.1)
- 폴더 접기/펼치기, 파일 선택, 수정 파일 ☑ 표시
- **[피드백 #5] 컨텍스트 메뉴** (우클릭):
  - Copy Path / Copy Relative Path
  - Reveal in Explorer (OS 파일 탐색기)
  - Open in External Editor
  - (향후 확장: Rename, Delete 등은 git 연동 필요하므로 v2)
  - **구현 방식**: 기존 Electron 네이티브 컨텍스트 메뉴 시스템 재사용
    - `showContextualMenu(items: ReadonlyArray<IMenuItem>)` (`app/src/lib/menu-item.ts`) 호출
    - 기존 패턴 참고: `branch-list-item-context-menu.tsx`의 `generateBranchContextMenuItems()`
    - List 컴포넌트의 `onRowContextMenu` 핸들러에서 메뉴 아이템 생성 후 `showContextualMenu()` 호출
  - **플랫폼 감지**: `__DARWIN__`, `__WIN32__`, `__LINUX__` 컴파일 상수 사용 (기존 패턴)
    - "Reveal in Explorer" (Windows) / "Reveal in Finder" (macOS) / "Open in File Manager" (Linux)
    - 외부 프로그램 실행: 기존 `openInExternalEditor()` 패턴 재사용 (`app/src/lib/editors/`)
    - Linux 권한 문제는 기존 외부 에디터 연동과 동일한 에러 핸들링 적용
- **드래그 앤 드롭**: v1에서는 미지원 (git mv 연동 복잡성)

### 2.3 스타일
- **새 파일**: `app/styles/ui/explorer/_file-explorer.scss`
- 메인 스타일시트에 import 추가

---

## Phase 3: RepositoryView 레이아웃 재구성

### 3.1 `render()` 변경
- **파일**: `app/src/ui/repository.tsx` (line 650-658)
- 기존:
  ```tsx
  <UiView id="repository">
    {this.renderSidebar()}    // TabBar + ChangesSidebar/CompareSidebar
    {this.renderContent()}    // Diff viewer
  </UiView>
  ```
- 변경:
  ```tsx
  <UiView id="repository">
    {this.renderExplorerSidebar()}  // NEW: File Explorer
    {this.renderMainPane()}         // TabBar + 탭별 콘텐츠
  </UiView>
  ```

### 3.2 `renderExplorerSidebar()` 신규
- `Resizable` + `FileExplorer` 조합
- `explorerWidth` IConstrainedValue 사용

### 3.3 `renderMainPane()` 신규
- 상단: `TabBar` (Changes / History)
- 하단: 탭에 따라 `renderChangesPane()` 또는 `renderHistoryPane()`

### 3.4 Changes 탭 재구성
- **문제**: `FilterChangesList`는 1,543줄의 대형 컴포넌트이며 Fragment로 렌더링.
  `ChangesSidebar`(498줄)가 wrapper로 감싸고 autocompletion, undo 등의 로직을 관리.
  "CSS만 변경"으로는 전체 너비 렌더링이 불가능 — 구조적 변경이 필요.
- **접근 방식**:
  1. `ChangesSidebar`를 `renderChangesPane()` 안에서 직접 렌더링
  2. `ChangesSidebar`의 width 제약을 제거 (`sidebarWidth` prop 대신 부모 flex 컨테이너가 제어)
  3. `ChangesSidebar` 내부의 `FilterChangesList` + `UndoCommit` 구조는 그대로 유지
  4. CSS: `#changes-pane`에 `flex: 1; display: flex; flex-direction: column;` 적용
- **보존하는 로직**: 커밋 생성, 충돌 처리, Undo, autocompletion, stash
- **변경하지 않는 것**: `FilterChangesList` 내부 코드 (Fragment 구조, 가상화 목록, CommitMessage 등)

### 3.5 History 탭 재구성 (HistoryPane 신규)
- **새 파일**: `app/src/ui/history/history-pane.tsx`
- 레이아웃:
  ```
  ┌─────────────────┬──────────────────┐
  │  CommitList      │  FileList        │
  │  (커밋 목록)      │  (선택 커밋의     │
  │                  │   변경 파일)      │
  ├─────────────────┴──────────────────┤
  │         Diff Viewer                │
  └────────────────────────────────────┘
  ```
- `explorerState.selectedPath`가 있으면 → `filteredCommitSHAs` 사용
- `selectedPath`가 null이면 → 전체 히스토리
- 재사용할 기존 컴포넌트:
  - `CommitList` (`app/src/ui/history/commit-list.tsx`)
  - `FileList` (`app/src/ui/history/file-list.tsx`)
  - `SeamlessDiffSwitcher` (`app/src/ui/diff/seamless-diff-switcher.tsx`)

#### 3.5.1 폴더 vs 파일 필터링 동작
- **파일 선택** (`selectedPathType === 'blob'`):
  - `git log -- <filePath>` → 해당 파일을 변경한 커밋만 표시
- **폴더 선택** (`selectedPathType === 'tree'`):
  - `git log -- <folderPath>` → 해당 폴더 및 하위 파일을 변경한 커밋 표시
  - git은 `-- app/src`로 전달하면 자동으로 하위 파일 포함 (재귀적)
  - trailing slash 불필요 (`app/src` == `app/src/` in git log)
- **선택 해제** (`selectedPath === null`):
  - 전체 히스토리 (필터 없음)

#### 3.5.2 커밋 선택 시 FileList 표시 범위
- **기본 동작**: 커밋 선택 시 해당 커밋의 **전체 변경 파일**을 FileList에 표시
  - Explorer에서 `app/src` 선택 → History에서 커밋 목록은 `app/src` 하위 변경만 표시
  - 해당 커밋 클릭 → FileList에는 그 커밋의 **모든** 변경 파일 표시 (다른 경로 포함)
  - **이유**: 커밋의 전체 맥락을 보는 것이 코드 리뷰에 더 유용
- **FileList 선택은 Explorer 필터에 영향 받지 않음**: FileList에서 `docs/readme.md`를 선택하면
  Explorer 필터(`app/src`)와 무관하게 정상적으로 Diff를 표시한다. Explorer 필터는 커밋 목록
  필터링에만 적용되며, 개별 커밋의 파일 선택/Diff 표시와는 독립적이다.
- **필터링된 파일 하이라이트**: Explorer에서 선택한 경로에 해당하는 파일은 하이라이트 표시
  - 예: `app/src` 필터 중 커밋의 파일이 `app/src/foo.ts`, `docs/bar.md` → `app/src/foo.ts`에 하이라이트

### 3.6 PR Preview (Compare 뷰)
- **현재 상태**: `CompareSidebar`(`app/src/ui/history/compare.tsx`)가 History/Compare 모드를 모두 관리.
  PR Preview는 hover popup (`pull-request-quick-view.tsx`)으로만 존재하며 "View on GitHub" 버튼으로 브라우저 열기.

- **[피드백 #3] CompareSidebar 전략: 점진적 위임 (병존 → 단계적 제거)**:
  - **Phase 3.5**: HistoryPane이 History 모드(단순 커밋 목록 + Explorer 필터링)를 담당.
    CompareSidebar는 그대로 유지되며, `HistoryTabMode.History`일 때 HistoryPane이 렌더링됨.
  - **Phase 3.6**: CompareSidebar에서 브랜치 비교 UI만 CompareHeader로 추출.
    CommitList 렌더링과 페이지네이션은 HistoryPane이 담당.
    `HistoryTabMode.Compare`일 때 HistoryPane 상단에 CompareHeader가 렌더링됨.
  - **Phase 3.6 완료 후**: CompareSidebar의 남은 역할:
    - 키보드 기반 커밋 리오더링 (`ICompareSidebarState.keyboardReorderData`)
    - Squash 동작 + co-author 추출
    - Merge call-to-action UI
    - **이 로직들은 v1에서는 CompareSidebar에 유지**, v2에서 HistoryPane으로 이전 검토
  - **순환 의존 방지**: CompareHeader는 CompareSidebar에서 코드를 추출하는 것이 아니라,
    CompareSidebar의 `renderFilterList()`/`renderTabBar()`가 사용하는 **데이터 흐름만 참고**하여
    독립적으로 구현. CompareSidebar → CompareHeader 의존 없음.
  - **리스크 재평가**: CompareSidebar의 상태 관리 복잡도가 높음 (33개 props, 키보드 리오더링,
    ThrottledScheduler, `loadingMoreCommitsPromise` 동시성 제어). 전면 제거는 v1 범위를 초과하므로
    병존 전략이 현실적.

- **CompareSidebar에서 추출할 로직** (Phase 3.6):
  | 로직 | 현재 위치 | 이전 대상 | 방법 |
  |------|-----------|-----------|------|
  | `renderCommitList()` | CompareSidebar | HistoryPane | CommitList 컴포넌트 직접 사용 |
  | `onScroll()` 페이지네이션 | CompareSidebar | HistoryPane | `loadNextCommitBatch` dispatcher 호출 |
  | 브랜치 비교 UI (`renderFilterList`, `renderTabBar`) | CompareSidebar | CompareHeader (새 컴포넌트) | 브랜치 선택 + ahead/behind 탭 |
  | `onBranchFilterTextChanged` | CompareSidebar | CompareHeader | 브랜치 검색 로직 |

- **CompareSidebar에 유지되는 로직** (v1):
  | 로직 | 이유 |
  |------|------|
  | 키보드 커밋 리오더링 | HistoryPane에 이전 시 상태 관리 복잡도 과다 |
  | Squash + co-author 추출 | 기존 동작과 긴밀히 결합 |
  | Merge call-to-action | Compare 모드 전용 UI |

- **새 컴포넌트**: `app/src/ui/history/compare-header.tsx`
  - 브랜치 비교 드롭다운, Behind/Ahead 탭, PR 생성 버튼
  - `getAheadBehind()` (`app/src/lib/git/rev-list.ts`) 사용
  - **ahead/behind 캐싱**: 기존 `AheadBehindStore` (`app/src/lib/stores/ahead-behind-store.ts`)가
    LRU 캐시 (max 2500 entries)를 이미 관리하며, 동시 요청은 `MaxConcurrent=1`로 제한됨.
    캐시 키: `${repository.path}:${from}:${to}`. 브랜치 변경 시 자동으로 새 키로 조회되므로
    별도의 TTL이나 무효화 로직은 불필요. CompareHeader는 이 기존 캐시를 그대로 활용.
  - PR 생성: 기존 `dispatcher.createPullRequest()` 호출 (브라우저에서 GitHub 열기)

- **HistoryPane에서 Compare 모드 지원**:
  ```tsx
  // history-pane.tsx
  {compareState?.mode === 'compare' && (
    <CompareHeader
      branch={compareState.comparisonBranch}
      aheadBehind={compareState.aheadBehind}
      onCreatePR={...}
    />
  )}
  <CommitList commits={...} />
  ```

---

## Phase 4: CSS 레이아웃

### 4.1 `_repository.scss` 업데이트
- **파일**: `app/styles/ui/_repository.scss`
- ```scss
  #repository {
    display: flex;
    flex-direction: row;

    #explorer-sidebar {
      display: flex;
      flex-direction: column;
      min-width: 150px;    // 최소: 트리 노드 + 아이콘이 잘리지 않는 수준
      max-width: 500px;    // 최대: 메인 패인 공간 확보
      // 기본 너비는 IConstrainedValue (기본 250px, Resizable 컴포넌트가 제어)
      // 기존 Resizable 기본값 참고: DefaultMinWidth=200, DefaultMaxWidth=350

      .explorer-search { flex-shrink: 0; }
      .explorer-tree { flex: 1; overflow: hidden; }

      // 리사이즈 핸들: 기존 Resizable 컴포넌트의 handle 스타일 재사용
      // (app/styles/ui/resizable/_resizable.scss)
      // 더블클릭 시 기본 너비(250px)로 리셋 (Resizable.onReset)
    }

    #main-pane {
      flex: 1;
      display: flex;
      flex-direction: column;

      .tab-bar { flex-shrink: 0; }

      #changes-pane {
        flex: 1;
        display: flex;
        flex-direction: column;
        /* ChangesSidebar의 기존 max-width 제약 제거 */
      }

      #history-pane {
        .history-top { display: flex; flex-direction: row; }
        .history-bottom { /* diff viewer */ }
      }
    }
  }
  ```

### 4.2 새 스타일 파일
- `app/styles/ui/explorer/_file-explorer.scss`
- `app/styles/ui/history/_history-pane.scss`

### 4.3 [피드백 #8] 반응형 동작
- **창 크기 축소 시**: Explorer sidebar의 `min-width: 150px` 보장. 메인 패인이 남은 공간 차지 (`flex: 1`).
  창이 극단적으로 줄어들면 Explorer가 최소 너비를 유지하고 메인 패인이 축소됨.
- **Resizable 핸들**: 기존 `app/styles/ui/resizable/_resizable.scss` 스타일 재사용.
  우측 경계에 4px 드래그 영역, hover 시 커서 `col-resize`.
- **더블클릭 리셋**: Resizable 컴포넌트의 `onReset` → 기본 너비 250px로 복원
- **키보드 리사이즈**: 기존 Resizable의 `increase-active-resizable-width` / `decrease-active-resizable-width`
  커스텀 이벤트 지원 (±5px per keystroke)

---

## Phase 5: Integration & Edge Cases

### 5.1 파일 트리 갱신 트리거
- 커밋 완료 시, 브랜치 전환 시, fetch/pull 완료 시
- `AppStore._refreshRepository()` 내에서 `loadRepositoryFileTree()` 호출
- `workingDirectoryChangedPaths`는 `GitStore.loadStatus()` 완료 콜백에서 갱신
  - `WorkingDirectoryStatus.files` → 경로 Set 추출

### 5.2 성능
- **TreeList 가상화**: `react-virtualized`의 `Grid` 기반 List를 내부 사용
  - 트리를 평탄화(`flattenTree()`)한 flat list를 가상화 렌더링
  - 기존 List와 동일한 overscan(4행) 사용, 고정 행 높이 30px
- 파일 트리는 브랜치 변경/커밋 시에만 갱신 (매 status update마다 X)
- 필터링된 커밋 로딩은 기존 batch 패턴 사용 (CommitBatchSize = 100)
- **캐시 무효화 전략**:
  - `fileTree` 캐시 키: `${repository.id}:${HEAD SHA}` — HEAD가 변경되면 자동 무효화
  - `filteredCommitSHAs` 캐시 키: `${repository.id}:${HEAD SHA}:${selectedPath}` — 경로 또는 HEAD 변경 시 무효화
  - 브랜치 전환 시 HEAD SHA가 변경되므로 모든 캐시 자동 무효화

- **[피드백 #6] 히스토리 필터링 성능 (대규모 리포)**:
  - **문제**: `git log -- <path>`는 10만 커밋 리포에서 전체 히스토리를 스캔할 수 있음
  - **대응**: `--max-count` 제한을 항상 적용하여 batch loading
    ```typescript
    // loadFilteredCommitBatch()에서 항상 limit=100 적용
    git log --max-count=100 --skip=N -- <path>
    ```
  - 기존 `getCommits()`의 `limit` 파라미터가 `--max-count`로 매핑되므로 추가 구현 불필요
  - 스크롤 페이지네이션: 기존 `CompareSidebar`의 패턴 재사용
    - `CloseToBottomThreshold = 10` (하단 10행 이내 스크롤 시 다음 배치 로드)
    - `loadingMoreCommitsPromise` 가드로 동시 요청 방지
    - 500ms defer로 scroll event storm 방지
  - **초기 로딩 UX**: `isLoadingFilteredCommits: boolean` 상태로 스피너 표시
  - **빈 결과 처리**: 필터링 결과가 0건일 때 "No commits found for this path" 메시지 표시

### 5.3 키보드 단축키
- `Ctrl+Tab`: 탭 전환 (기존 유지)
- `Ctrl+Shift+E`: Explorer 포커스 (신규, VS Code 스타일)
- 화살표 키: 파일 트리 탐색 (좌/우: 접기/펼치기, 상/하: 이동)

### 5.4 검색 기능
- Explorer 상단에 필터 입력 (`Ctrl+Shift+F` 또는 Explorer 포커스 후 타이핑)
- v1에서는 클라이언트 사이드 필터링 (fileTree가 이미 메모리에 있으므로)
- **성능 최적화**:
  - **입력 디바운싱**: 검색어 입력 시 150ms 디바운스 적용 (매 키스트로크마다 재계산 방지)
    - **구현 위치**: `FileExplorer` 컴포넌트 내부에서 `lodash/debounce` 사용 (기존 패턴: `commit-list.tsx:18`의 `import debounce from 'lodash/debounce'`)
    - 디바운싱 대상: `filterText` state 업데이트 자체가 아닌, **필터링 결과 계산** (`flattenTree` + 매칭)을 디바운싱
    - `onChange` → 즉시 input value 업데이트 (UI 응답성 유지) → 150ms 디바운스 후 `filteredNodes` 재계산
    - AppStore에서는 디바운싱하지 않음 (검색은 순수 클라이언트 사이드 연산이므로 컴포넌트 레벨에서 처리)
  - **결과 캐싱**: `useMemo` 또는 `React.memo`로 `(searchQuery, expandedPaths, fileTree)` 조합에 대해
    `flattenTree()` + 필터링 결과를 메모이제이션. 동일 입력 시 재계산 없음.
  - 1만 노드 트리에서 매 타이핑마다 재계산하면 프레임 드롭 발생 가능 → 디바운싱+메모이제이션 필수

- **[피드백 #4] 검색 알고리즘 상세**:
  - **기존 패턴 참고**: `IFilterListGroup<T>` (`app/src/ui/lib/filter-list.tsx`, lines 26-36)
    및 `SectionFilterList`의 필터링 로직 (`app/src/ui/lib/section-filter-list.tsx`)
  - **매칭 방식**: substring matching (대소문자 무시, `String.toLowerCase()` 비교)
    - 외부 라이브러리 (fuse.js 등) 없이 기존 `filter-list.tsx`의 매칭 패턴 그대로 사용
    - 입력: `"comp"` → 매치: `app/src/ui/lib/list/component.tsx`, `docs/compare.md`
  - **대소문자 처리**: 항상 case-insensitive (파일 시스템 관습상 자연스러움)
  - **경로 매칭**: 전체 경로에 대해 부분 일치
    - `"app/src/test"` 입력 시 해당 경로를 포함하는 모든 파일 매치
    - `/` 구분자도 매칭 대상에 포함되므로 중첩 경로 필터 자연스럽게 지원
  - **다중 필터**: v1 미지원 (단일 텍스트 입력만)
  - **검색 결과 표시**:
    - 매치되는 노드의 상위 폴더 자동 전개
    - 매치되지 않는 노드는 숨김 (필터링)
    - 매치된 파일명의 매칭 부분은 `<mark>` 태그로 하이라이트 (기존 FilterList 패턴)
    - **하이라이트 구현 방식**: `IFlattenedTreeRow`에 하이라이트 범위를 추가하지 않음.
      대신 검색어 `filterText` prop을 `TreeList` → `rowRenderer`로 전달하고,
      렌더링 시점에 `node.name` 내 매칭 위치를 동적으로 계산하여 `<mark>` 래핑.
      기존 `HighlightText` 컴포넌트 사용 (`app/src/ui/lib/highlight-text.tsx` — 존재 확인 완료).
      Props: `text: string`, `highlight: ReadonlyArray<number>` (하이라이트할 문자 인덱스 배열).
      검색어 매칭 위치를 인덱스 배열로 변환하여 전달.
  - **멀티 토큰 지원** (v2 고려): 스페이스 구분 다중 키워드 AND 매칭

### 5.5 [피드백 #10] 에러 처리

- **기존 패턴 활용**: `performFailableOperation()` (GitStore) 및 `successExitCodes` / `expectedErrors` Set (core.ts)

| 시나리오 | 에러 처리 | UI 상태 |
|----------|----------|---------|
| `git ls-tree` 실패 (HEAD 없음, unborn repo) | `successExitCodes: new Set([0, 128])`. exit 128 → 빈 트리 반환 | Explorer에 "No files yet" placeholder 표시 |
| `git log -- <path>` 실패 (삭제된 경로) | `expectedErrors: new Set([GitError.BadRevision])`. 에러 시 빈 커밋 목록 반환 | "No history for this path" 메시지 |
| 파일 트리 로딩 중 브랜치 전환 | `loadingForBranchSha`에 현재 요청의 HEAD SHA를 기록. ls-tree 완료 시 `loadingForBranchSha`와 현재 HEAD SHA를 비교, 불일치하면 결과 폐기. `requestsInFight` 키로 동시 호출도 방지. | 로딩 스피너 유지 → 새 트리로 교체 |
| 필터 커밋 로딩 중 경로 변경 | `filteredCommitSHAs` 캐시 키에 `selectedPath` 포함 → 이전 결과 자동 무시 | 스피너 리셋 → 새 결과 로드 |
| `git status` 실패 | 기존 `loadStatus()` 패턴 그대로 (null 반환 시 이전 `workingDirectoryChangedPaths` 유지) | Explorer 변경 마크 업데이트 안 됨 (degraded but functional) |

- **로딩 상태 표시**:
  - `IExplorerState.isLoadingFilteredCommits`: 커밋 필터링 로딩 스피너
  - `IExplorerState.loadingForBranchSha: string | null`: 파일 트리 로딩 스피너 (`!== null`이면 로딩 중)
- **재시도 로직**: v1에서는 자동 재시도 없음. 사용자가 브랜치 전환 또는 Fetch로 자연스럽게 재갱신.

---

## 구현 순서 및 의존성

```
Phase 1 (State/Data) ──────────────────────┐
                                           ↓
Phase 2 (TreeList + FileExplorer) ─┐   Phase 3.5 (HistoryPane) ──┐
                                   ↓                              ↓
              Phase 3.1-3.4 (RepositoryView 재구성) ←─────────────┘
                                   ↓
              Phase 3.6 (CompareHeader 추출) ←─ Phase 3.5 완료 후
                                   ↓
              Phase 4 (CSS) ←─ (Phase 3과 동시 진행)
                                   ↓
              Phase 5 (Integration + 검색)
```

**[피드백 #9] Phase 3.6 의존성 및 CompareSidebar 운명 명확화**:
- Phase 3.5 (HistoryPane)이 **반드시 먼저 완료**되어야 Phase 3.6 진행 가능
- Phase 3.6에서 CompareHeader는 CompareSidebar와 **독립적으로 구현** (코드 추출이 아닌 신규 구현)
  - CompareHeader: 브랜치 비교 UI + ahead/behind 탭 (HistoryPane 상단에 렌더링)
  - CompareSidebar: 키보드 리오더링, squash, merge CTA 등 고급 기능 유지 (v1 범위)
- **순환 의존 없음**: HistoryPane → CompareHeader (단방향). CompareSidebar는 Phase 3.6에서 **제거되지 않음**.
  - `HistoryTabMode.History` → HistoryPane 렌더링
  - `HistoryTabMode.Compare` → HistoryPane (+ CompareHeader) 렌더링
  - CompareSidebar는 v1 완료 후 단계적 제거 대상 (v2 scope)
- **`HistoryTabMode` enum**: 이미 `app/src/lib/app-state.ts` (line 846)에 정의됨.
  ```typescript
  export enum HistoryTabMode {
    History = 'History',
    Compare = 'Compare',
  }
  ```
  신규 정의 불필요. 기존 enum 및 관련 인터페이스(`IDisplayHistory`, `ICompareBranch`, `IViewHistory`, `ICompareToBranch`)를 그대로 활용.

- **History/Compare 모드 전환 UI (v1)**:
  - History 탭 내부에 기존 `CompareSidebar`의 `renderTabBar()` 패턴을 참고한 모드 전환 버튼 배치
  - `[History | Compare]` 토글 버튼을 HistoryPane 상단에 표시
  - History 모드: Explorer 필터 기반 커밋 목록 (기본)
  - Compare 모드: CompareHeader(브랜치 선택 + ahead/behind) + 비교 커밋 목록
  - **CompareSidebar Compare 모드 시 렌더링 위치**: CompareSidebar의 고급 기능(키보드 리오더링, squash, merge CTA)은
    Compare 모드 활성화 시 **HistoryPane 내부에 인라인으로 렌더링**됨 (기존 좌측 사이드바 위치가 아님).
    HistoryPane의 CommitList 하단 또는 별도 패널로 배치하여 Explorer 사이드바와 UI 충돌을 방지.
    사용자 혼동 방지를 위해 CompareSidebar는 독립 사이드바로 표시되지 않으며,
    HistoryPane 내부에서만 접근 가능한 "고급 비교 도구" 영역으로 취급한다.

## 리스크 영역

| 리스크 | 설명 | 대응 |
|--------|------|------|
| `getCommits` 시그니처 변경 | 기존 호출부 4곳에 영향 | 기본값 `[]`로 하위 호환 유지. 회귀 테스트로 검증 |
| `FilterChangesList` 레이아웃 변경 | 1,543줄, Fragment 구조 | 내부 코드 수정 없이 부모 컨테이너(ChangesSidebar)의 width 제약만 제거 |
| `CompareSidebar` 브랜치 비교 로직 분리 | 커밋 목록 + 브랜치 UI + 페이지네이션이 결합 | CompareHeader로 브랜치 UI만 추출, 나머지는 HistoryPane이 직접 처리 |
| 대규모 리포 성능 | 수천 파일의 트리 렌더링 | TreeList 평탄화 + react-virtualized 가상화, HEAD SHA 기반 캐시 무효화 |
| TreeList 어댑터 복잡도 | 기존 List가 flat 전용 | 평탄화 레이어를 별도 모듈로 분리, 단위 테스트로 검증 |
| CompareSidebar 병존 복잡도 | v1에서 CompareSidebar + HistoryPane 병존 | History/Compare 모드 분기를 HistoryTabMode enum으로 명확히 구분. v2에서 점진적 제거 |
| unborn repo / 빈 리포 | HEAD 없어 ls-tree 실패 | exit 128 허용 + "No files yet" placeholder UI |

---

## 테스트 전략

### 단위 테스트

| 대상 | 테스트 케이스 | 파일 |
|------|-------------|------|
| `getCommits` paths 파라미터 | paths=[] 시 기존 동작 동일, paths=['app/src'] 시 `-- app/src` 인자 생성 | `app/test/unit/git/log-test.ts` |
| `flattenTree()` | 아래 **[피드백 #7]** 상세 케이스 참조 | `app/test/unit/ui/lib/list/tree-list-test.ts` |
| `IExplorerState` 갱신 | selectedPath 변경 시 filteredCommitSHAs 로딩 트리거, pathType 올바르게 설정 | `app/test/unit/stores/explorer-state-test.ts` |
| `ls-tree` 헬퍼 | git ls-tree 출력 파싱, 트리 구조 빌드 | `app/test/unit/git/ls-tree-test.ts` (기존 테스트 구조 `app/test/unit/` 확인 완료) |
| 캐시 무효화 | HEAD SHA 변경 시 캐시 클리어, 동일 SHA 시 캐시 히트 | `app/test/unit/stores/explorer-cache-test.ts` |

**[피드백 #7] `flattenTree()` 상세 테스트 케이스**:
| 케이스 | 입력 | 기대 결과 |
|--------|------|----------|
| 빈 트리 | `[]` | `[]` |
| 단일 파일 | `[{name: 'a.ts', type: 'blob'}]` | 1행, depth=0 |
| 단일 폴더 (접힘) | `[{name: 'src', type: 'tree', children: [...]}]` | 1행 (폴더만), isExpanded=false |
| 단일 폴더 (펼침) | expandedPaths에 'src' 포함 | 폴더 + children 행 |
| **깊은 중첩 (10레벨)** | `a/b/c/d/e/f/g/h/i/j/file.ts` 구조 | depth=0~10, 모든 레벨 올바른 depth 값 |
| **깊은 중첩 (20레벨)** | 20단계 중첩 | 성능 저하 없이 정상 평탄화 (스택 오버플로 없음) |
| 혼합 (폴더+파일 정렬) | `[apple.ts, banana/, app/, cat.ts]` | `app/ → banana/ → apple.ts → cat.ts` (각 depth에서 폴더 우선, 그룹 내 알파벳순, case-insensitive) |
| 부분 펼침 | 일부 폴더만 expandedPaths에 포함 | 펼친 폴더의 children만 평탄화 |
| 대규모 (1만 노드) | 1만 개 flat 파일 | 16ms 이내 평탄화 완료 (1프레임) |

### 통합 테스트

| 시나리오 | 검증 항목 |
|----------|----------|
| Explorer → History 필터링 | 폴더 선택 시 해당 경로 하위 파일 변경 커밋만 CommitList에 표시 |
| 커밋 선택 → FileList | 필터링된 상태에서 커밋 선택 시 전체 변경 파일 표시 + 필터 경로 파일 하이라이트 |
| 브랜치 전환 | Explorer fileTree가 새 브랜치의 HEAD로 갱신 |
| 파일 수정 → Explorer 반영 | working directory 변경 시 Explorer에 ☑ 표시 |
| **[피드백 #7] 대규모 리포 통합** | 1만+ 파일 / 10만 커밋 리포에서 Explorer 로드 + `app/src` 필터링 시 첫 100 커밋 1초 이내 표시 |
| **에러 복구** | unborn repo에서 Explorer 표시 (빈 트리 placeholder) |

### 회귀 테스트

| 대상 | 방법 |
|------|------|
| `getCommits` 기존 호출부 | `yarn test:unit` — 기존 테스트 전체 통과 확인 |
| Changes 탭 기능 | 커밋 생성, 파일 staging, undo, stash 등 기존 동작 수동 확인 |
| 키보드 단축키 | Ctrl+Tab 탭 전환, 기존 단축키 충돌 없음 확인 |
| **[피드백 #7] 현재 테스트 커버리지** | `yarn test:unit` 기준 기존 테스트 전체 통과 확인. 신규 테스트 추가 영역: `flattenTree`, `ls-tree`, `explorer-state`, `explorer-cache` |

### 수동 검증
1. `yarn build:dev` → Electron 앱 실행
2. File Explorer에서 폴더/파일 클릭 → 우측 History가 해당 경로로 필터링되는지 확인
3. 커밋 선택 → 해당 커밋의 **모든** 변경 파일이 표시되는지 확인 (필터 경로 파일 하이라이트)
4. Changes 탭에서 파일 수정 → Explorer에 ☑ 표시 확인
5. 대규모 리포 (1만+ 파일, 10만 커밋)에서 Explorer 스크롤 + 필터링 성능 확인
6. unborn repo (init 직후) 에서 Explorer "No files yet" 표시 확인
7. `yarn test:unit` 으로 기존 + 신규 테스트 통과 확인

---

## v1 범위 외 (향후 확장)

| 기능 | 이유 |
|------|------|
| 드래그 앤 드롭 (파일 이동) | git mv 연동 + 충돌 처리 복잡성 |
| Rename / Delete 컨텍스트 메뉴 | git 연동이 필요, working directory 상태 관리 복잡 |
| 멀티 경로 선택 필터링 | UX 복잡도 증가, v1은 단일 경로 선택에 집중 |
| CompareSidebar 완전 제거 | v1에서는 병존 전략 채택. 키보드 리오더링, squash, merge CTA 등 고급 기능의 HistoryPane 이전은 v2 |
| 멀티 토큰 검색 (스페이스 구분 AND) | v1은 단일 substring 매칭에 집중 |
| 자동 재시도 (에러 복구) | v1에서는 사용자 주도 재갱신 (브랜치 전환/Fetch)으로 충분 |

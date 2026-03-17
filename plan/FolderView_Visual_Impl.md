# FolderView-Visual.md 구현 계획서

> **문서 목적**: FolderView-Visual.md 의 비주얼 레이아웃을 구현하기 위한 상세 계획  
> **작성일**: 2026 년 3 월 17 일  
> **참조 문서**: 
> - `D:\Work\MyGitHubDesktop\plan\FolderView-Visual.md` (메인 스펙)
> - `D:\Work\MyGitHubDesktop\plan\FolderView.md` (기능/State/Phase)

---

## 📋 개요

**목표**: P4V 스타일 File Explorer + Scoped History 의 비주얼 레이아웃 구현  
**핵심 변경**:
1. Explorer 사이드바 추가 (좌측)
2. Diff 를 Main Pane **하단**으로 이동
3. Changes/History 탭의 상하 분할 구조 (목록 + Diff)
4. Root 노드 (브랜치명) 로 필터 해제

---

## 1. 레이아웃 구조 분석

### 1.1 전체 구조

```
┌─────────────────────────────────────────────────────────────────┐
│  Header (Repository/Branch/Fetch)                               │
├──────────────────┬──────────────────────────────────────────────┤
│  Explorer        │  Main Pane                                   │
│  (고정/가변)      │  TabBar (Changes/History)                    │
│                  ├──────────────────────────────────────────────┤
│                  │  Content Area (상하 분할)                     │
│                  │  ┌─────────────┬─────────────┐              │
│                  │  │ Left Panel  │ Right Panel │              │
│                  │  ├─────────────┴─────────────┤              │
│                  │  │ Diff Viewer (하단 고정)    │              │
│                  │  └───────────────────────────┘              │
│                  └──────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 핵심 변경 사항

| 항목 | 기존 | 변경 후 |
|------|------|---------|
| **Diff 위치** | 우측 사이드바 | Main Pane **하단** |
| **Explorer** | 기존 Changes/History 탭 | 독립 사이드바 (항상 표시) |
| **Main Pane** | 단일 콘텐츠 영역 | **상하 분할** (목록 + Diff) |
| **Changes 탭** | 수직 적층 | **좌우 + 하단** 분할 |
| **History 탭** | 수직 적층 | **좌우 + 하단** 분할 |

---

## 2. 구현 항목

### 2.1 신규 컴포넌트

| 컴포넌트 | 파일 | 설명 |
|----------|------|------|
| `FileExplorer` | `app/src/ui/explorer/file-explorer.tsx` | 좌측 Explorer 사이드바 |
| `FileTreeNode` | `app/src/ui/explorer/file-tree-node.tsx` | 트리 노드 렌더링 |
| `TreeList` | `app/src/ui/lib/list/tree-list.tsx` | 트리 가상화 리스트 |
| `HistoryPane` | `app/src/ui/history/history-pane.tsx` | History 탭 전체 레이아웃 |
| `ChangesPane` | `app/src/ui/changes/changes-pane.tsx` | Changes 탭 전체 레이아웃 (신규 또는 기존 재구성) |
| `CompareHeader` | `app/src/ui/history/compare-header.tsx` | Compare 모드 헤더 |

### 2.2 수정 컴포넌트

| 컴포넌트 | 파일 | 변경 내용 |
|----------|------|-----------|
| `RepositoryView` | `app/src/ui/repository.tsx` | `render()` 구조 변경 (Explorer + MainPane) |
| `FilterChangesList` | `app/src/ui/changes/filter-changes-list.tsx` | Diff 제거, 목록만 유지 |
| `CommitMessage` | `app/src/ui/changes/commit-message.tsx` | ChangesPane 우측으로 이동 |
| `CommitList` | `app/src/ui/history/commit-list.tsx` | HistoryPane 좌측으로 이동 |
| `FileList` | `app/src/ui/history/file-list.tsx` | HistoryPane 우측으로 이동 |
| `SeamlessDiffSwitcher` | `app/src/ui/diff/seamless-diff-switcher.tsx` | MainPane 하단으로 이동 |

---

## 3. Phase 별 구현 계획

### Phase 1: State & Data Layer (선행 작업)

**참조**: `FolderView.md Phase 1`

| 항목 | 파일 | 작업 내용 |
|------|------|-----------|
| `getCommits()` path 파라미터 | `app/src/lib/git/log.ts` | 필터링 지원 |
| `git ls-tree` 헬퍼 | `app/src/lib/git/ls-tree.ts` | 신규 생성 |
| `IExplorerState` | `app/src/lib/app-state.ts` | Root 노드 (브랜치명) 추가 |
| Dispatcher 연결 | `app/src/ui/dispatcher/dispatcher.ts` | 새 메서드 추가 |

---

### Phase 2: File Explorer 구현

#### 2.1 트리 데이터 구조

```typescript
// app/src/lib/app-state.ts
export interface IFileTreeNode {
  readonly name: string
  readonly path: string
  readonly type: 'tree' | 'blob'
  readonly children?: ReadonlyArray<IFileTreeNode>
}

export interface IExplorerState {
  /** Root 노드는 현재 브랜치명 (path: null 또는 '') */
  readonly fileTree: ReadonlyArray<IFileTreeNode>
  readonly selectedPath: string | null  // null = root 선택 (필터 해제)
  readonly selectedPathType: 'tree' | 'blob' | null
  readonly expandedPaths: ReadonlySet<string>
  readonly filteredCommitSHAs: ReadonlyArray<string>
  readonly isLoadingFilteredCommits: boolean
  readonly loadingForBranchSha: string | null
  readonly workingDirectoryChangedPaths: ReadonlySet<string>
}
```

#### 2.2 Root 노드 구현

```typescript
// app/src/ui/explorer/file-explorer.tsx
interface IFileExplorerProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly fileTree: ReadonlyArray<IFileTreeNode>
  readonly selectedPath: string | null
  readonly selectedPathType: 'tree' | 'blob' | null
  readonly expandedPaths: ReadonlySet<string>
  readonly workingDirectoryChangedPaths: ReadonlySet<string>
  readonly currentBranchName: string  // Root 노드 표시용
}

export class FileExplorer extends React.Component<IFileExplorerProps> {
  render() {
    return (
      <div className="file-explorer">
        <TreeList
          rows={this.buildTreeRows()}
          rootLabel={this.props.currentBranchName}  // 🔀 master
          onNodeSelected={this.onNodeSelected}
          ...
        />
        <div className="explorer-search">
          <TextBox placeholder="Filter..." value={this.state.filterText} />
        </div>
      </div>
    )
  }
}
```

#### 2.3 TreeList 가상화

```typescript
// app/src/ui/lib/list/tree-list.tsx
interface IFlattenedTreeRow {
  readonly node: IFileTreeNode
  readonly depth: number
  readonly isExpanded: boolean
  readonly isExpandable: boolean
  readonly path: string
}

interface ITreeListProps {
  readonly rows: ReadonlyArray<IFlattenedTreeRow>
  readonly rootLabel: string  // Root 노드 레이블 (브랜치명)
  readonly selectedPath: string | null
  readonly onNodeSelected: (path: string | null, type: 'tree' | 'blob') => void
  readonly onToggleFolder: (path: string) => void
  readonly workingDirectoryChangedPaths: ReadonlySet<string>
  readonly filterText?: string
}

export class TreeList extends React.Component<ITreeListProps> {
  // 기존 List 컴포넌트 재사용 (react-virtualized 기반)
  // rowRenderer 에서 depth 에 따라 padding-left 적용
}
```

---

### Phase 3: RepositoryView 레이아웃 재구성

#### 3.1 render() 메서드 변경

```typescript
// app/src/ui/repository.tsx
public render() {
  return (
    <UiView id="repository">
      {this.renderExplorerSidebar()}  {/* 좌측 Explorer */}
      {this.renderMainPane()}         {/* 우측 Main Pane */}
    </UiView>
  )
}

private renderExplorerSidebar(): JSX.Element {
  return (
    <Resizable
      id="explorer-sidebar"
      width={this.props.explorerWidth.value}
      minimumWidth={150}
      maximumWidth={500}
      onResize={width => this.props.dispatcher.setExplorerWidth(width)}
      onReset={() => this.props.dispatcher.resetExplorerWidth()}
    >
      <FileExplorer
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        fileTree={this.props.state.explorerState.fileTree}
        selectedPath={this.props.state.explorerState.selectedPath}
        selectedPathType={this.props.state.explorerState.selectedPathType}
        expandedPaths={this.props.state.explorerState.expandedPaths}
        workingDirectoryChangedPaths={
          this.props.state.explorerState.workingDirectoryChangedPaths
        }
        currentBranchName={this.getCurrentBranchName()}
      />
    </Resizable>
  )
}

private renderMainPane(): JSX.Element {
  const selectedSection = this.props.state.selectedSection

  return (
    <div id="main-pane">
      <TabBar
        tabs={[
          { id: 'changes', label: 'Changes' },
          { id: 'history', label: 'History' },
        ]}
        selectedTab={selectedSection}
        onTabClicked={tab => this.onTabClicked(tab)}
      />
      {selectedSection === RepositorySectionTab.Changes
        ? this.renderChangesPane()
        : this.renderHistoryPane()}
    </div>
  )
}
```

---

### Phase 4: Changes Pane 구현

#### 4.1 레이아웃 구조

```tsx
// app/src/ui/changes/changes-pane.tsx
interface IChangesPaneProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly changesState: IChangesState
  readonly commitSummaryWidth: IConstrainedValue
  readonly imageDiffType: ImageDiffType
  readonly hideWhitespaceInChangesDiff: boolean
  readonly showSideBySideDiff: boolean
  // ... 기타 props
}

export class ChangesPane extends React.Component<IChangesPaneProps> {
  render() {
    return (
      <div className="changes-pane">
        {/* 상단: 좌우 분할 */}
        <div className="changes-top">
          {/* 좌측: Change List */}
          <div className="change-list">
            <FilterChangesList
              workingDirectory={this.props.changesState.workingDirectory}
              selectedFiles={this.props.changesState.selectedFiles}
              onSelectionChanged={this.onSelectionChanged}
              // ... Diff 제거, 목록만
            />
          </div>

          {/* 우측: Commit 영역 */}
          <div className="commit-area">
            <CommitMessage
              repository={this.props.repository}
              dispatcher={this.props.dispatcher}
              summary={this.props.changesState.commitMessage.summary}
              description={this.props.changesState.commitMessage.description}
              coAuthors={this.props.changesState.commitMessage.coAuthors}
              onSummaryChanged={...}
              onDescriptionChanged={...}
              // ...
            />
          </div>
        </div>

        {/* 하단: Diff Viewer */}
        <div className="changes-bottom">
          <SeamlessDiffSwitcher
            repository={this.props.repository}
            file={this.props.changesState.selectedFile}
            diff={this.props.changesState.selectedDiff}
            imageDiffType={this.props.imageDiffType}
            hideWhitespaceInDiff={this.props.hideWhitespaceInChangesDiff}
            showSideBySideDiff={this.props.showSideBySideDiff}
            // ...
          />
        </div>
      </div>
    )
  }
}
```

#### 4.2 CSS 구조

```scss
// app/styles/ui/changes/_changes-pane.scss
.changes-pane {
  display: flex;
  flex-direction: column;
  height: 100%;

  .changes-top {
    display: flex;
    flex-direction: row;
    flex: 1;
    min-height: 200px;  // 최소 높이

    .change-list {
      flex: 1;
      border-right: 1px solid var(--border-color);
      overflow: hidden;
    }

    .commit-area {
      flex: 1;
      padding: var(--spacing);
      overflow-y: auto;
    }
  }

  .changes-bottom {
    flex: 1;
    border-top: 1px solid var(--border-color);
    overflow: hidden;
  }
}
```

---

### Phase 5: History Pane 구현

#### 5.1 레이아웃 구조

```tsx
// app/src/ui/history/history-pane.tsx
interface IHistoryPaneProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly explorerState: IExplorerState
  readonly commitLookup: Map<string, Commit>
  readonly compareState: ICompareState
  readonly selectedCommitSHAs: ReadonlyArray<string>
  readonly selectedFile: CommittedFileChange | null
  readonly currentDiff: IDiff | null
  readonly commitSummaryWidth: IConstrainedValue
  readonly imageDiffType: ImageDiffType
  readonly hideWhitespaceInHistoryDiff: boolean
  readonly showSideBySideDiff: boolean
  // ...
}

export class HistoryPane extends React.Component<IHistoryPaneProps> {
  render() {
    const isCompareMode = this.props.compareState.mode === 'compare'

    return (
      <div className="history-pane">
        {/* 상단: 좌우 분할 */}
        <div className="history-top">
          {/* 좌측: Commit List */}
          <div className="commit-list">
            {isCompareMode && (
              <CompareHeader
                compareState={this.props.compareState}
                dispatcher={this.props.dispatcher}
                // ...
              />
            )}
            <CommitList
              commits={this.getFilteredCommits()}
              selectedSHAs={this.props.selectedCommitSHAs}
              onSelectCommits={this.onSelectCommits}
              onScroll={this.onScroll}
              // ...
            />
          </div>

          {/* 우측: File List */}
          <div className="file-list">
            <FileList
              files={this.getSelectedCommitFiles()}
              selectedFile={this.props.selectedFile}
              onSelectedFileChanged={this.onFileSelected}
              onRowDoubleClick={this.onFileDoubleClick}
              highlightedPaths={this.getHighlightedPaths()}  // ★ 표시
              // ...
            />
          </div>
        </div>

        {/* 하단: Diff Viewer */}
        <div className="history-bottom">
          <SeamlessDiffSwitcher
            repository={this.props.repository}
            file={this.props.selectedFile}
            diff={this.props.currentDiff}
            imageDiffType={this.props.imageDiffType}
            hideWhitespaceInDiff={this.props.hideWhitespaceInHistoryDiff}
            showSideBySideDiff={this.props.showSideBySideDiff}
            // ...
          />
        </div>
      </div>
    )
  }

  private getFilteredCommits(): ReadonlyArray<string> {
    const { explorerState, compareState } = this.props

    // Explorer 에서 경로 선택 시 필터링된 커밋 사용
    if (explorerState.selectedPath !== null) {
      return explorerState.filteredCommitSHAs
    }

    // root 선택 (null) 시 전체 커밋
    return compareState.commitSHAs
  }

  private getHighlightedPaths(): ReadonlySet<string> {
    // Explorer 에서 선택한 경로에 해당하는 파일 하이라이트
    const { explorerState } = this.props
    if (explorerState.selectedPath === null) {
      return new Set()
    }

    // 선택된 커밋의 파일 중 explorer 경로와 일치하는 것 반환
    // ...
  }
}
```

#### 5.2 CSS 구조

```scss
// app/styles/ui/history/_history-pane.scss
.history-pane {
  display: flex;
  flex-direction: column;
  height: 100%;

  .history-top {
    display: flex;
    flex-direction: row;
    flex: 1;
    min-height: 200px;

    .commit-list {
      flex: 1;
      border-right: 1px solid var(--border-color);
      overflow: hidden;
    }

    .file-list {
      flex: 1;
      overflow: hidden;
    }
  }

  .history-bottom {
    flex: 1;
    border-top: 1px solid var(--border-color);
    overflow: hidden;
  }
}
```

---

### Phase 6: CSS 레이아웃

#### 6.1 RepositoryView 전체 레이아웃

```scss
// app/styles/ui/_repository.scss
#repository {
  display: flex;
  flex-direction: row;
  height: 100%;
  overflow: hidden;

  #explorer-sidebar {
    display: flex;
    flex-direction: column;
    min-width: 150px;
    max-width: 500px;
    background-color: var(--pane-background-color);
    border-right: 1px solid var(--border-color);

    .explorer-search {
      flex-shrink: 0;
      padding: var(--spacing);
      border-bottom: 1px solid var(--border-color);
    }

    .explorer-tree {
      flex: 1;
      overflow: hidden;
    }
  }

  #main-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;

    .tab-bar {
      flex-shrink: 0;
      border-bottom: 1px solid var(--border-color);
    }

    #changes-pane,
    #history-pane {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
  }
}
```

#### 6.2 Resizable 경계

```scss
// app/styles/ui/resizable/_resizable.scss (기존 재사용)
.resizable-handle {
  width: 4px;
  cursor: col-resize;

  &:hover {
    background-color: var(--resizable-handle-hover-color);
  }
}
```

---

## 4. 인터랙션 흐름

### 4.1 Explorer → History 필터링

```
1. Explorer 에서 📁 app/src 클릭
   ├─ dispatcher.selectExplorerPath(repo, 'app/src', 'tree')
   ├─ AppStore.explorerState.selectedPath = 'app/src'
   ├─ GitStore.loadFilteredCommitBatch('HEAD', 0, 'app/src')
   └─ explorerState.filteredCommitSHAs 업데이트

2. HistoryPane 렌더링
   ├─ getFilteredCommits() → filteredCommitSHAs 반환
   ├─ CommitList 에 필터링된 SHA 전달
   └─ FileList 는 비어있음 (커밋 미선택)

3. Commit List 에서 커밋 클릭
   ├─ dispatcher.changeCommitSelection(repo, ['abc1234'], true)
   ├─ state.commitSelection.shas = ['abc1234']
   └─ FileList 에 해당 커밋의 전체 변경 파일 표시

4. File List 에서 foo.ts 클릭
   ├─ dispatcher.changeFileSelection(repo, foo.ts)
   ├─ state.commitSelection.file = foo.ts
   └─ Diff Viewer 에 foo.ts diff 표시
```

### 4.2 Root 노드 선택 (필터 해제)

```
1. Explorer 에서 🔀 master (root) 클릭
   ├─ dispatcher.selectExplorerPath(repo, null, null)
   ├─ AppStore.explorerState.selectedPath = null
   └─ filteredCommitSHAs 사용 안 함 (전체 히스토리)

2. HistoryPane 렌더링
   ├─ getFilteredCommits() → compareState.commitSHAs 반환
   └─ 전체 커밋 목록 표시
```

---

## 5. 구현 순서 및 의존성

```
Phase 1 (State/Data) ──────────────────────┐
                                           ↓
Phase 2 (FileExplorer + TreeList) ─────────┐
                                           ↓
Phase 3 (RepositoryView render()) ─────────┤
                                           ↓
              ┌────────── Phase 4 (ChangesPane)
              │
              └────────── Phase 5 (HistoryPane)
                                           ↓
              Phase 6 (CSS) ←─ (Phase 3-5 와 동시 진행)
                                           ↓
              통합 테스트
```

---

## 6. FolderView.md 업데이트 필요 항목

| FolderView.md 섹션 | 변경 내용 | 우선순위 |
|---------------------|----------|---------|
| 최종 레이아웃 (line 7-20) | 전체 구조 다이어그램 교체 | 🔴 높음 |
| Phase 2.2 FileExplorer | Root 노드 (브랜치명) 추가 | 🔴 높음 |
| Phase 3.1 render() | 상하 분할 구조 명시 | 🔴 높음 |
| Phase 3.4 Changes 탭 | 좌우 + 하단 분할로 재정의 | 🔴 높음 |
| Phase 3.5 History 탭 | 레이아웃 다이어그램 교체 | 🔴 높음 |
| Phase 4.1 CSS | 상하 분할 flex 방향으로 수정 | 🟡 중간 |
| Phase 5.3 키보드 단축키 | Root 노드 선택 단축키 추가 | 🟢 낮음 |

---

## 7. 테스트 전략

### 7.1 비주얼 테스트

| 항목 | 검증 방법 |
|------|----------|
| Explorer 사이드바 | Root 노드 (브랜치명) 표시 확인 |
| Changes 탭 | 좌우 (ChangeList + Commit) + 하단 (Diff) 분할 확인 |
| History 탭 | 좌우 (CommitList + FileList) + 하단 (Diff) 분할 확인 |
| Resizable | 경계 드래그로 영역 조절 확인 |
| Diff 위치 | Explorer 영역 침범하지 않음 확인 |
| Root 선택 | 필터 해제되는지 확인 |

### 7.2 인터랙션 테스트

| 시나리오 | 검증 항목 |
|----------|----------|
| Explorer 폴더 선택 → History | Commit List 필터링 확인 |
| Commit 선택 → FileList | 전체 변경 파일 + ★ 하이라이트 확인 |
| FileList 선택 → Diff | Diff 표시 확인 |
| Root 노드 선택 | 전체 히스토리 표시 확인 |

---

## 8. 리스크 및 대응

| 리스크 | 영향도 | 대응 |
|--------|--------|------|
| `FilterChangesList` 분해 | 높음 | 내부 수정 최소화, CSS 레이아웃만 변경 |
| Diff 위치 변경 | 중간 | `SeamlessDiffSwitcher` 재사용, 컨테이너만 변경 |
| Resizable 성능 | 낮음 | 기존 Resizable 컴포넌트 재사용 |
| Explorer 성능 (대규모 리포) | 높음 | TreeList 가상화 + 캐싱 |

---

## 9. 완료 조건 (DoD)

- [ ] Explorer 사이드바에 Root 노드 (브랜치명) 표시
- [ ] Changes 탭: 좌우 (ChangeList + Commit) + 하단 (Diff) 분할
- [ ] History 탭: 좌우 (CommitList + FileList) + 하단 (Diff) 분할
- [ ] Diff 가 Explorer 영역을 침범하지 않음
- [ ] Root 노드 선택 시 필터 해제
- [ ] Resizable 경계 드래그 가능
- [ ] `yarn build:dev` 성공
- [ ] 수동 검증 통과

---

## 10. 첨부: 컴포넌트 계층도

```
RepositoryView
├── ExplorerSidebar (Resizable)
│   └── FileExplorer
│       └── TreeList
│           └── FileTreeNode (× N)
│
└── MainPane
    ├── TabBar
    │
    ├── ChangesPane
    │   ├── changes-top
    │   │   ├── change-list (FilterChangesList)
    │   │   └── commit-area (CommitMessage)
    │   │
    │   └── changes-bottom (SeamlessDiffSwitcher)
    │
    └── HistoryPane
        ├── history-top
        │   ├── commit-list (CommitList + CompareHeader)
        │   └── file-list (FileList)
        │
        └── history-bottom (SeamlessDiffSwitcher)
```

---

*문서 끝*

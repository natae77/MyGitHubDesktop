# FolderView 비주얼 레이아웃 구현 계획서

> FolderView_Visual_Design.md 기반. 현재 코드 상태를 분석하여 **갭(Gap)만** 구현 대상으로 정리.

---

## 0. 현재 상태 분석 (이미 구현 완료)

| 항목 | 상태 | 근거 |
|------|------|------|
| Explorer 사이드바 (FileExplorer) | ✅ 완료 | `app/src/ui/explorer/file-explorer.tsx` |
| TreeList 가상화 + flattenTree | ✅ 완료 | `app/src/ui/lib/list/tree-list.tsx` |
| Main Pane 탭 구조 (Changes/History) | ✅ 완료 | `app/src/ui/repository.tsx:499-506` |
| HistoryPane (CommitList + FileList) | ✅ 완료 | `app/src/ui/history/history-pane.tsx` |
| Resizable Explorer sidebar | ✅ 완료 | `app/src/ui/repository.tsx:473-496` |
| Explorer 검색/필터 | ✅ 완료 | `file-explorer.tsx:46-56` |
| Explorer 컨텍스트 메뉴 | ✅ 완료 | `file-explorer.tsx:83-116` |
| CSS 골격 (`#changes-pane`, `#history-pane`) | ✅ 완료 | `app/styles/ui/_repository.scss` |
| `IExplorerState`, dispatcher 연결 | ✅ 완료 | FolderView.md Phase 1 전체 |

---

## 1. 구현 필요 항목 (Gap 목록)

### Gap 1: Explorer Root 노드 (브랜치명)
**설계 문서**: §2.1 — 트리 최상단에 현재 브랜치명이 root 노드로 표시, 클릭 시 필터 해제

**현재 상태**: FileExplorer에 root 노드 없음. 필터 해제는 HistoryPane의 "Clear filter" 버튼에만 의존.

### Gap 2: History 탭 — Diff 하단 분리
**설계 문서**: §4 — CommitList(좌) + FileList(우) 상단, Diff 하단

**현재 상태**: `renderCommitDetails()` 안에 FileList + SeamlessDiffSwitcher가 함께 있음 (`history-top` 내부). Diff가 FileList 옆에 위치하며 하단 분리되어 있지 않음.

### Gap 3: Changes 탭 — 상단(좌우) + 하단(Diff) 구조
**설계 문서**: §3 — ChangeList(좌) + Commit 영역(우) 상단, Diff 하단

**현재 상태**: `renderChangesPane()`이 `renderChangesSidebar()` + `renderContentForChanges()`를 좌우로 나열. CSS에 `.changes-top`/`.changes-bottom` 정의되어 있지만 컴포넌트에서 사용하지 않음.

### Gap 4: "Showing history for..." 배너 제거
**설계 문서**: §2.1, §5 — Root 노드가 Clear Filter 역할이므로 배너 불필요

**현재 상태**: `history-pane.tsx:189-201`에 `history-pane-filter-info` 배너 존재.

### Gap 5: FileList에서 필터 경로 파일 하이라이트 (★ 마크)
**설계 문서**: §4.1, §4.2 — Explorer 선택 경로에 해당하는 파일 하이라이트

**현재 상태**: FileList에 하이라이트 로직 없음.

### Gap 6: 상하 Resizable 경계
**설계 문서**: §3.2, §4.2 — 상단(목록)↔하단(Diff) 경계를 드래그로 조절

**현재 상태**: 상하 Resizable 미구현. 현재는 좌우 Resizable만 존재.

---

## 2. 구현 상세

### Task 1: Explorer Root 노드 (브랜치명) 추가

**수정 파일**:
- `app/src/ui/explorer/file-explorer.tsx`
- `app/src/ui/repository.tsx` (props 전달)

**변경 내용**:

1. `IFileExplorerProps`에 `currentBranchName: string | null` 추가

2. `render()` 내 `<div className="explorer-tree">` 앞에 root 노드 렌더링:
   ```tsx
   <div
     className={classNames('explorer-root-node', {
       'selected': this.props.selectedPath === null
     })}
     onClick={this.onRootClick}
   >
     <span className="root-icon">🔀</span>
     <span className="root-label">
       {this.props.currentBranchName ?? 'HEAD'}
     </span>
   </div>
   ```

3. `onRootClick` 핸들러 — 필터 해제:
   ```tsx
   private onRootClick = () => {
     this.props.dispatcher.selectExplorerPath(
       this.props.repository,
       null,
       null
     )
   }
   ```

4. `repository.tsx`의 `renderExplorerSidebar()`에서 `currentBranchName` prop 전달:
   - `this.props.state.branchesState.tip` 에서 현재 브랜치명 추출

**스타일 추가** (`_repository.scss` 또는 별도 explorer scss):
```scss
.explorer-root-node {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  cursor: pointer;
  font-weight: 600;
  border-bottom: 1px solid var(--box-border-color);

  &.selected {
    background-color: var(--list-active-selection-background);
    color: var(--list-active-selection-foreground);
  }

  &:hover:not(.selected) {
    background-color: var(--list-hover-background);
  }

  .root-icon { margin-right: 6px; }
}
```

**검증**: Explorer 최상단에 브랜치명 표시 → 클릭 시 History 필터 해제.

---

### Task 2: History 탭 — Diff를 하단으로 분리

**수정 파일**:
- `app/src/ui/history/history-pane.tsx`

**현재 구조** (문제):
```
history-pane
  └── history-top
      ├── history-commit-list (CommitList)
      └── history-detail (Resizable)
          ├── history-file-list (FileList)
          └── SeamlessDiffSwitcher  ← Diff가 여기에 있음
```

**목표 구조**:
```
history-pane
  ├── history-top
  │   ├── history-commit-list (CommitList)
  │   └── history-file-list (FileList)      ← Diff 분리
  └── history-bottom
      └── SeamlessDiffSwitcher              ← Diff는 여기로
```

**변경 내용**:

1. `render()` 재구성:
   ```tsx
   public render() {
     const commitSHAs = this.getCommitSHAs()
     const selectedCommits = this.getSelectedCommits()

     return (
       <div id="history-pane">
         <div className="history-top">
           <div className="history-commit-list">
             <CommitList ... />
           </div>
           {selectedCommits.length > 0 && (
             <div className="history-file-list">
               <FileList
                 files={this.props.changesetData.files}
                 onSelectedFileChanged={...}
                 selectedFile={this.props.selectedFile}
                 availableWidth={clamp(this.props.commitSummaryWidth)}
                 explorerSelectedPath={this.props.explorerState.selectedPath}
               />
             </div>
           )}
         </div>
         {this.renderDiffViewer()}
       </div>
     )
   }
   ```

2. `renderDiffViewer()` 신규 메서드 — 하단 Diff:
   ```tsx
   private renderDiffViewer(): JSX.Element | null {
     const { currentDiff, selectedFile, repository, dispatcher } = this.props
     if (currentDiff === null || selectedFile === null) {
       return null
     }

     return (
       <div className="history-bottom">
         <SeamlessDiffSwitcher
           repository={repository}
           readOnly={true}
           file={selectedFile}
           diff={currentDiff}
           ...
         />
       </div>
     )
   }
   ```

3. 기존 `renderCommitDetails()` 제거 — FileList와 Diff를 분리했으므로 불필요.

4. FileList를 감싸던 `Resizable` 제거 — 상단 영역에서 좌우는 flex 비율로 처리.

**CSS 변경** (`_repository.scss`):
- `.history-top` 내 `.history-commit-list`와 `.history-file-list`를 `flex: 1`로 좌우 배치 (이미 정의됨)
- `.history-bottom`에 Diff 표시 (이미 정의됨)
- `.history-detail` 관련 스타일 제거

**검증**: History 탭에서 커밋 선택 → FileList가 상단 우측, Diff가 하단에 표시.

---

### Task 3: Changes 탭 — 상단(좌우) + 하단(Diff) 구조

**수정 파일**:
- `app/src/ui/repository.tsx` (`renderChangesPane()`)
- `app/src/ui/changes/sidebar.tsx` (필요 시 width 제약 제거)

**현재 구조**:
```
changes-pane
  ├── ChangesSidebar (좌측 — 파일 목록 + 커밋 메시지)
  └── Changes (우측 — Diff)
```

**목표 구조**:
```
changes-pane
  ├── changes-top
  │   ├── change-list (파일 목록)
  │   └── commit-area (Summary + Description + Commit 버튼)
  └── changes-bottom
      └── Diff Viewer
```

**변경 내용**:

이 변경은 **가장 복잡하고 리스크가 높음**. `ChangesSidebar`(498줄)와 `FilterChangesList`(1,543줄)이 긴밀하게 결합되어 있기 때문.

**접근 방식 — 2단계**:

#### 3a단계: ChangesSidebar를 changes-top 래퍼로 감싸기 (최소 변경)

현재 `ChangesSidebar`가 Fragment로 파일 목록 + 커밋 메시지를 이미 좌우로 나열하지 않고 세로로 배치하고 있음.
`ChangesSidebar` 내부를 수정하여 좌우 분할을 적용하되, Fragment 구조를 유지.

1. `renderChangesPane()` 변경:
   ```tsx
   private renderChangesPane(): JSX.Element | null {
     return (
       <div id="changes-pane">
         <div className="changes-top">
           {this.renderChangesSidebar()}
         </div>
         <div className="changes-bottom">
           {this.renderContentForChanges()}
         </div>
       </div>
     )
   }
   ```

2. `ChangesSidebar` 내부에서 `FilterChangesList`의 파일 목록 부분과 `CommitMessage` 부분을 좌우로 배치하도록 CSS 조정.

   **핵심**: `FilterChangesList`가 내부적으로 Fragment를 반환하며, 파일 목록 + CommitMessage를 세로로 나열. 이를 좌우로 바꾸려면:
   - `ChangesSidebar`의 렌더 래퍼를 `display: flex; flex-direction: row`로 변경
   - 파일 목록 부분에 `flex: 1` + `border-right`
   - CommitMessage 부분에 `flex: 1`

3. `ChangesSidebar`에서 기존 `sidebarWidth` prop 의존 제거 — 부모 flex가 너비 제어.

#### 3b단계: 상세 CSS 조정

```scss
#changes-pane {
  .changes-top {
    display: flex;
    flex-direction: row;  // ← 좌우 분할
    flex: 1;
    min-height: 200px;

    .change-list {
      flex: 1;
      border-right: 1px solid var(--box-border-color);
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
    overflow: hidden;
  }
}
```

**리스크 완화**:
- `FilterChangesList` 내부 코드는 수정하지 않음
- CSS 변경으로 먼저 시도 → 구조적 변경이 불가피한 경우에만 컴포넌트 분리
- 기존 커밋/스테이징/언두 로직은 모두 보존

**검증**: Changes 탭에서 파일 목록(좌) + 커밋 영역(우) 상단, Diff 하단.

---

### Task 4: "Showing history for..." 배너 제거

**수정 파일**:
- `app/src/ui/history/history-pane.tsx`

**변경 내용**:

`render()` 내 `history-pane-filter-info` 블록 삭제 (lines 189-201):

```tsx
// 삭제 대상:
{explorerState.selectedPath !== null && (
  <div className="history-pane-filter-info">
    <span className="filter-path">
      Showing history for: <strong>{explorerState.selectedPath}</strong>
    </span>
    <button
      className="clear-filter-button"
      onClick={this.onClearFilter}
    >
      Clear filter
    </button>
  </div>
)}
```

`onClearFilter` 메서드도 삭제 (lines 232-238) — root 노드가 이 역할을 대신함.

**의존성**: Task 1 (Root 노드)이 먼저 완료되어야 함. Root 노드 없이 배너를 제거하면 필터 해제 수단이 사라짐.

**검증**: History 탭에서 필터 활성화 시 배너가 표시되지 않음. Explorer root 노드로 필터 해제 가능.

---

### Task 5: FileList 필터 경로 하이라이트 (★ 마크)

**수정 파일**:
- `app/src/ui/history/file-list.tsx`
- `app/src/ui/history/committed-file-item.tsx`

**변경 내용**:

1. `FileList` props에 `explorerSelectedPath: string | null` 추가

2. 각 파일 아이템 렌더링 시, 파일 경로가 `explorerSelectedPath`로 시작하는지 확인:
   ```tsx
   const isInFilterPath = explorerSelectedPath !== null &&
     file.path.startsWith(explorerSelectedPath)
   ```

3. 하이라이트 표시:
   - 매칭 파일에 `className="filter-matched"` 추가
   - CSS: `.filter-matched { font-weight: 600; }` 또는 별도 아이콘(★) 표시
   - 비매칭 파일은 기본 스타일 유지 (숨기지 않음 — 커밋의 전체 파일 표시 원칙)

4. `HistoryPane`에서 `FileList`에 `explorerSelectedPath` prop 전달

**검증**: Explorer에서 `app/src` 선택 → 커밋의 FileList에서 `app/src/` 하위 파일에 하이라이트.

---

### Task 6: 상하 Resizable 경계 (목록↔Diff)

**수정 파일**:
- `app/src/ui/history/history-pane.tsx`
- `app/src/ui/repository.tsx` (Changes 탭)
- `app/src/lib/app-state.ts` (새 IConstrainedValue 추가)
- `app/src/ui/dispatcher/dispatcher.ts`
- `app/src/lib/stores/app-store.ts`

**변경 내용**:

1. `IAppState`에 `historyPaneSplitHeight: IConstrainedValue` 및 `changesPaneSplitHeight: IConstrainedValue` 추가

2. Dispatcher에 `setHistoryPaneSplitHeight(height)` / `setChangesPaneSplitHeight(height)` 추가

3. 상단 영역을 `Resizable`로 감싸되, **세로 방향** 리사이즈 필요:
   - 현재 `Resizable` 컴포넌트는 **가로(width) 전용**
   - 세로 리사이즈를 위한 선택지:
     - **A안**: `Resizable` 컴포넌트에 `direction: 'horizontal' | 'vertical'` prop 추가
     - **B안**: CSS `resize: vertical` + `overflow: auto`로 간단히 구현 (네이티브)
     - **C안**: 별도 `VerticalResizable` 컴포넌트 생성
   - **권장: A안** — 기존 `Resizable`을 확장. 마우스 이벤트 핸들러에서 `clientX` 대신 `clientY` 사용하도록 분기.

4. History 탭:
   ```tsx
   <Resizable
     direction="vertical"
     height={clamp(historyPaneSplitHeight)}
     minimumHeight={historyPaneSplitHeight.min}
     maximumHeight={historyPaneSplitHeight.max}
     onResize={h => dispatcher.setHistoryPaneSplitHeight(h)}
     onReset={() => dispatcher.resetHistoryPaneSplitHeight()}
   >
     <div className="history-top">...</div>
   </Resizable>
   <div className="history-bottom">
     <SeamlessDiffSwitcher ... />
   </div>
   ```

5. Changes 탭도 동일 패턴 적용.

**v1 대안**: 상하 Resizable이 복잡하면, 먼저 고정 비율(50:50)로 구현하고 Resizable은 v1.1로 연기 가능.

**검증**: 상단(목록)↔하단(Diff) 경계를 드래그하여 비율 조절.

---

## 3. 구현 순서 및 의존성

```
Task 1 (Root 노드) ──────────────────┐
                                     ↓
Task 4 (배너 제거) ← Task 1 완료 후  │
                                     │
Task 2 (History Diff 하단 분리) ─────┤
                                     │
Task 5 (FileList 하이라이트) ← Task 2│
                                     │
Task 3 (Changes 상하 분할) ──────────┤
                                     ↓
Task 6 (상하 Resizable) ← Task 2, 3 완료 후
```

**병렬 가능**:
- Task 1 + Task 2 + Task 3 은 독립적이므로 동시 진행 가능
- Task 4는 Task 1 이후
- Task 5는 Task 2 이후
- Task 6은 Task 2, 3 이후

**권장 구현 순서** (직렬):
1. Task 1 → Task 4 (Explorer Root 노드 + 배너 제거)
2. Task 2 → Task 5 (History Diff 하단 + 하이라이트)
3. Task 3 (Changes 상하 분할)
4. Task 6 (상하 Resizable)

---

## 4. 영향 범위 요약

| 파일 | 변경 유형 | Task |
|------|----------|------|
| `app/src/ui/explorer/file-explorer.tsx` | 수정 (root 노드 추가) | 1 |
| `app/src/ui/repository.tsx` | 수정 (props 전달, Changes 구조) | 1, 3 |
| `app/src/ui/history/history-pane.tsx` | 수정 (Diff 분리, 배너 제거) | 2, 4 |
| `app/src/ui/history/file-list.tsx` | 수정 (하이라이트 prop) | 5 |
| `app/src/ui/history/committed-file-item.tsx` | 수정 (하이라이트 표시) | 5 |
| `app/styles/ui/_repository.scss` | 수정 (root 노드 스타일, 레이아웃 조정) | 1, 2, 3 |
| `app/src/ui/resizable/resizable.tsx` | 수정 (vertical 방향 지원) | 6 |
| `app/src/lib/app-state.ts` | 수정 (split height 상태 추가) | 6 |
| `app/src/ui/dispatcher/dispatcher.ts` | 수정 (split height 액션) | 6 |
| `app/src/lib/stores/app-store.ts` | 수정 (split height 저장) | 6 |

**수정하지 않는 파일**:
- `app/src/ui/changes/filter-changes-list.tsx` — 내부 구조 유지
- `app/src/ui/changes/commit-message.tsx` — 내부 구조 유지
- `app/src/ui/lib/list/tree-list.tsx` — 변경 불필요
- `app/src/lib/git/log.ts` — 이미 paths 지원 완료

---

## 5. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| Changes 탭 좌우 분할 시 FilterChangesList Fragment 구조 충돌 | CSS만으로 좌우 분할 불가 시 컴포넌트 분리 필요 | 먼저 CSS 시도 → 실패 시 FilterChangesList에서 파일 목록/커밋 메시지를 별도 div로 래핑 |
| ChangesSidebar width 제약 하드코딩 | flex 부모로 전환 시 기존 width 로직과 충돌 | `sidebarWidth` prop을 무시하고 flex 기반으로 전환 |
| Resizable 세로 방향 확장 복잡도 | 마우스 이벤트, ARIA, 키보드 리사이즈 모두 수정 필요 | v1에서는 고정 비율로 시작, Resizable 확장은 후순위 |
| History FileList에서 Resizable 제거 | commitSummaryWidth 상태가 불필요해짐 | 제거하지 않고 unused로 유지 (다른 곳에서 참조 가능) |

---

## 6. 테스트 계획

### 시각적 검증 (수동)
1. Explorer 최상단에 브랜치명 root 노드 표시 확인
2. root 노드 클릭 → 필터 해제 + History 전체 커밋 표시
3. History 탭: 커밋 선택 → FileList(상단 우측) + Diff(하단) 분리 확인
4. Changes 탭: 파일 목록(상단 좌) + 커밋 메시지(상단 우) + Diff(하단) 확인
5. 배너("Showing history for...") 미표시 확인
6. FileList에서 필터 경로 파일 하이라이트(★) 확인

### 기능 회귀
- 커밋 생성, 파일 staging, undo 정상 동작
- Explorer 검색/필터 정상 동작
- 키보드 단축키 (Ctrl+Tab, Ctrl+Shift+E) 정상 동작
- `yarn test:unit` 전체 통과

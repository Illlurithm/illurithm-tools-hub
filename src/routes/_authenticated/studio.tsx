import { Fragment, useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,

  Download,
  Grid2x2,

  Images,
  LayoutGrid,
  Pencil,
  Plus,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ThemeToggle";
import logoAsset from "@/assets/idoelll-logo.png.asset.json";
import { usePanelRef } from "react-resizable-panels";
import TrueFocus from "@/components/TrueFocus";
import { ToolPicker } from "@/components/ToolPicker";
import { ToolWorkspace } from "@/components/ToolWorkspace";
import { PngToPdfSettings } from "@/components/tools/PngToPdfSettings";
import { clearPngState, getPngState, hasUnsavedWork, usePngVersion } from "@/lib/png-to-pdf-store";
import {
  clearPdfState,
  getPdfState,
  hasPdfWork,
  usePdfVersion,
} from "@/lib/pdf-to-png-store";
import { PdfToPngSettings } from "@/components/tools/PdfToPngSettings";
import { PdfToWordSettings } from "@/components/tools/PdfToWordSettings";
import { PdfToPptSettings } from "@/components/tools/PdfToPptSettings";

import { WordToPdfSettings } from "@/components/tools/WordToPdfSettings";


export const Route = createFileRoute("/_authenticated/studio")({
  validateSearch: z.object({ tool: z.string().optional(), picker: z.boolean().optional() }),
  head: () => ({
    meta: [
      { title: "Studio — ıðœlll Creative Workspace" },
      {
        name: "description",
        content:
          "The ıðœlll Studio workspace: pick a tool, drop in media, and edit with a premium resizable editing layout.",
      },
      { property: "og:title", content: "Studio — ıðœlll Creative Workspace" },
      {
        property: "og:description",
        content: "A premium browser workspace for video, audio, image and document tools.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudioPage,
});

type Page = { id: string; name: string; tool: string };
type Group = { id: string; pageIds: string[] };

const MAX_MERGE = 3;

let pageSeq = 0;
const nextId = (prefix: string) => `${prefix}${++pageSeq}-${Date.now()}`;

function untitledName(existing: Page[]) {
  if (!existing.some((p) => p.name === "Untitled")) return "Untitled";
  let i = 1;
  while (existing.some((p) => p.name === `Untitled ${i}`)) i += 1;
  return `Untitled ${i}`;
}

function StudioPage() {
  const search = useSearch({ from: "/_authenticated/studio" });
  const navigate = useNavigate({ from: "/studio" });
  const [toolsOpen, setToolsOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [panelsHidden, setPanelsHidden] = useState(false);

  const [pages, setPages] = useState<Page[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [zoomByPage, setZoomByPage] = useState<Record<string, number>>({});
  const [focusedPageId, setFocusedPageId] = useState<string | null>(null);

  const pageById = (id: string) => pages.find((p) => p.id === id) ?? null;
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? groups[0] ?? null;
  const activePages = (activeGroup?.pageIds ?? []).map(pageById).filter((p): p is Page => !!p);
  const focusedPage =
    activePages.find((p) => p.id === focusedPageId) ?? activePages[0] ?? null;
  const zoomOf = (id: string) => zoomByPage[id] ?? 1;
  const setZoom = (id: string, value: number) =>
    setZoomByPage((prev) => ({ ...prev, [id]: Math.min(3, Math.max(0.25, value)) }));
  const selectedTool =
    activePages.length === 0
      ? null
      : activePages.length === 1
        ? activePages[0]!.tool
        : activePages.map((p) => p.tool).join(" + ");

  const [insertAt, setInsertAt] = useState<number | null>(null);

  const addPage = (tool: string, at?: number | null) => {
    const page: Page = { id: nextId("p"), name: untitledName(pages), tool };
    const group: Group = { id: nextId("g"), pageIds: [page.id] };
    const insert = <T,>(list: T[], item: T) => {
      if (at == null || at < 0 || at > list.length) return [...list, item];
      return [...list.slice(0, at), item, ...list.slice(at)];
    };
    setPages((prev) => insert(prev, page));
    setGroups((prev) => insert(prev, group));
    setActiveGroupId(group.id);
    setFocusedPageId(page.id);
    setInsertAt(null);
  };



  // Bootstrap a first page when arriving with ?tool=..., or open the tool
  // picker straight away when arriving with ?picker=true.
  useEffect(() => {
    if (pages.length === 0 && search.tool) addPage(search.tool);
    if (search.picker) setToolsOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    navigate({
      search: (prev: typeof search) => ({
        ...prev,
        picker: undefined,
        tool: activePages[0]?.tool ?? undefined,
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup?.id, activePages.length]);

  const closePage = (id: string) => {
    clearPngState(id);
    clearPdfState(id);
    setPages((prev) => prev.filter((p) => p.id !== id));
    setGroups((prev) => {
      const next = prev
        .map((g) => ({ ...g, pageIds: g.pageIds.filter((pid) => pid !== id) }))
        .filter((g) => g.pageIds.length > 0);
      setActiveGroupId((current) =>
        next.some((g) => g.id === current) ? current : (next[next.length - 1]?.id ?? null),
      );
      return next;
    });
  };

  // Ask before discarding unsaved work on a page.
  const [pendingCloseId, setPendingCloseId] = useState<string | null>(null);
  const requestClosePage = (id: string) => {
    if (hasUnsavedWork([id]) || hasPdfWork([id])) setPendingCloseId(id);
    else closePage(id);
  };

  // Warn before the browser tab / studio is closed or reloaded.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedWork() && !hasPdfWork()) return;
      e.preventDefault();
      e.returnValue = "Leaving this page will erase your current work. Are you sure?";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);


  const renamePage = (id: string, name: string) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)));
  };

  const mergePages = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setGroups((prev) => {
      const source = prev.find((g) => g.pageIds.includes(sourceId));
      const target = prev.find((g) => g.pageIds.includes(targetId));
      if (!source || !target || source.id === target.id) return prev;
      if (target.pageIds.length + source.pageIds.length > MAX_MERGE) return prev;
      const merged: Group = { ...target, pageIds: [...target.pageIds, ...source.pageIds] };
      setActiveGroupId(merged.id);
      return prev.map((g) => (g.id === target.id ? merged : g)).filter((g) => g.id !== source.id);
    });
  };

  const unmergePage = (id: string) => {
    setGroups((prev) => {
      const owner = prev.find((g) => g.pageIds.includes(id));
      if (!owner || owner.pageIds.length < 2) return prev;
      const group: Group = { id: nextId("g"), pageIds: [id] };
      setActiveGroupId(group.id);
      return [
        ...prev.map((g) =>
          g.id === owner.id ? { ...g, pageIds: g.pageIds.filter((pid) => pid !== id) } : g,
        ),
        group,
      ];
    });
  };

  const leftRef = usePanelRef();
  const bottomRef = usePanelRef();
  const [bottomHidden, setBottomHidden] = useState(false);

  const togglePanels = () => {
    const next = !panelsHidden;
    setPanelsHidden(next);
    setBottomHidden(next);
    for (const ref of [leftRef, bottomRef]) {
      const p = ref.current;
      if (!p) continue;
      if (next) p.collapse();
      else p.expand();
    }
  };

  // Bottom-panel-only minimizer.
  const toggleBottom = () => {
    const next = !bottomHidden;
    setBottomHidden(next);
    const p = bottomRef.current;
    if (p) {
      if (next) p.collapse();
      else p.expand();
    }
  };


  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background bg-studio">
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        {/* LEFT PANEL */}
        <ResizablePanel
          panelRef={leftRef}
          defaultSize="16%"
          minSize="10%"
          maxSize="30%"
          collapsible
          collapsedSize="0%"
          className="min-w-0"
        >
          <aside className="glass flex h-full flex-col gap-2 rounded-none border-y-0 border-l-0 p-3">
            <Link to="/" className="logo-mark mb-2 flex w-fit items-center gap-2">
              <img src={logoAsset.url} alt="ıðœlll" className="h-12 w-auto" />
            </Link>

            <SideButton
              icon={LayoutGrid}
              label="Tools"
              active={toolsOpen}
              onClick={() => setToolsOpen(true)}
            />
            <SideButton
              icon={Images}
              label="Media"
              active={mediaOpen}
              onClick={() => setMediaOpen((v) => !v)}
            />
          </aside>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* RIGHT SIDE */}
        <ResizablePanel defaultSize="84%" className="min-w-0">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize="72%" minSize="25%" className="min-h-0">
              <div className="relative flex h-full flex-col">
                {/* TOP BAR */}
                <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-card/60 px-4 py-2.5 backdrop-blur-xl">
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={togglePanels}
                      aria-label={panelsHidden ? "Show side and bottom panels" : "Hide side and bottom panels"}
                      title={panelsHidden ? "Show panels" : "Hide panels"}
                      className="group grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-all duration-200 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_18px_var(--primary)]"
                    >
                      <ChevronsUpDown className="h-4 w-4 rotate-45 transition-transform duration-200 group-hover:scale-110" />
                    </button>
                    <span className="truncate text-sm font-semibold tracking-wide text-foreground">
                      {selectedTool ?? (
                        <span className="text-muted-foreground/60">No tool selected</span>
                      )}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPagesOpen(true)}
                      aria-label="View all pages"
                      title="View all pages"
                      className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-3 text-xs font-semibold text-foreground transition-all duration-200 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_16px_var(--primary)]"
                    >
                      <Grid2x2 className="h-4 w-4" />
                      <span className="hidden sm:inline">View All Pages</span>
                      <span className="tabular-nums opacity-60">{pages.length}</span>
                    </button>
                    <ThemeToggle />
                    <ShareMenu pages={activePages} focused={focusedPage} />

                  </div>
                </header>

                {/* PAGE TABS */}
                <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border bg-card/40 px-3 py-1.5 backdrop-blur-xl">
                  {groups.map((g) => (
                    <div
                      key={g.id}
                      className={`flex shrink-0 items-center gap-1 rounded-full ${
                        g.pageIds.length > 1
                          ? "border border-primary/25 bg-primary/5 p-0.5"
                          : ""
                      }`}
                    >
                      {g.pageIds.map((pid) => {
                        const p = pageById(pid);
                        if (!p) return null;
                        return (
                          <PageTab
                            key={p.id}
                            page={p}
                            active={g.id === activeGroup?.id}
                            focused={focusedPage?.id === p.id && g.id === activeGroup?.id}
                            merged={g.pageIds.length > 1}
                            renaming={renamingId === p.id}
                            dropTarget={dropTargetId === p.id}
                            onActivate={() => {
                              setActiveGroupId(g.id);
                              setFocusedPageId(p.id);
                            }}
                            onStartRename={() => setRenamingId(p.id)}

                            onRename={(name) => {
                              renamePage(p.id, name);
                              setRenamingId(null);
                            }}
                            onClose={() => requestClosePage(p.id)}

                            onUnmerge={() => unmergePage(p.id)}
                            onDragStart={() => setDragId(p.id)}
                            onDragEnd={() => {
                              setDragId(null);
                              setDropTargetId(null);
                            }}
                            onDragOverTab={() => {
                              if (dragId && dragId !== p.id) setDropTargetId(p.id);
                            }}
                            onDropTab={() => {
                              if (dragId) mergePages(dragId, p.id);
                              setDragId(null);
                              setDropTargetId(null);
                            }}
                          />
                        );
                      })}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setToolsOpen(true)}
                    aria-label="Add page"
                    title="Add page"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-all duration-200 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_14px_var(--primary)]"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                {/* WORKSPACE */}
                <div className="relative min-h-0 flex-1 overflow-hidden">
                  {activePages.length > 0 ? (
                    <ResizablePanelGroup orientation="horizontal" className="h-full">
                      {activePages.map((p, i) => (
                        <Fragment key={p.id}>
                          {i > 0 ? <ResizableHandle withHandle /> : null}
                          <ResizablePanel className="min-w-0">
                            <div
                              className={`flex h-full flex-col ${
                                activePages.length > 1 && focusedPage?.id === p.id
                                  ? "ring-1 ring-inset ring-primary/40"
                                  : ""
                              }`}
                              onMouseDown={() => setFocusedPageId(p.id)}
                            >
                              {activePages.length > 1 ? (
                                <div className="shrink-0 border-b border-border/60 px-3 py-1 text-[10px] font-semibold tracking-[0.2em] text-muted-foreground">
                                  {p.name.toUpperCase()}
                                </div>
                              ) : null}
                              <div className="min-h-0 flex-1 overflow-auto">
                                <div
                                  style={{
                                    transform: `scale(${zoomOf(p.id)})`,
                                    transformOrigin: "top center",
                                  }}
                                  className="transition-transform duration-150"
                                >
                                  <ToolWorkspace tool={p.tool} pageId={p.id} />
                                </div>
                              </div>
                            </div>
                          </ResizablePanel>

                        </Fragment>
                      ))}
                    </ResizablePanelGroup>
                  ) : (
                    <div className="grid h-full w-full place-items-center p-6">
                      <TrueFocus
                        sentence="Select Tools"
                        manualMode={false}
                        blurAmount={2.5}
                        borderColor="#A8D38D"
                        animationDuration={0.5}
                        pauseBetweenAnimations={1}
                      />
                    </div>
                  )}

                  {/* MEDIA FLOATING PANEL */}
                  {mediaOpen ? (
                    <div className="absolute inset-y-3 left-3 z-20 w-96 max-w-[85%] overflow-hidden rounded-2xl border border-border bg-card/95 shadow-xl backdrop-blur-xl">
                      <div className="flex items-center justify-between border-b border-border px-3 py-2">
                        <span className="text-xs font-semibold tracking-[0.2em] text-foreground">
                          MEDIA
                        </span>
                        <button
                          type="button"
                          onClick={() => setMediaOpen(false)}
                          aria-label="Close media panel"
                          className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="h-full p-3" />
                    </div>
                  ) : null}

                  {/* ZOOM SLIDER — sits at the bottom edge of the workspace, so it
                      always rides up and down with the bottom panel. */}
                  <div className="absolute bottom-3 right-4 z-30 flex items-center gap-2">
                    <ZoomSlider
                      page={focusedPage}
                      zoom={focusedPage ? zoomOf(focusedPage.id) : 1}
                      onZoom={(v) => focusedPage && setZoom(focusedPage.id, v)}
                    />
                    {bottomHidden ? (
                      <button
                        type="button"
                        onClick={toggleBottom}
                        aria-label="Show settings panel"
                        title="Show settings panel"
                        className="grid h-7 w-7 place-items-center rounded-full border border-border bg-card/80 text-muted-foreground transition-all duration-200 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_14px_var(--primary)]"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>

                </div>

              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* BOTTOM SETTINGS PANEL */}
            <ResizablePanel
              panelRef={bottomRef}
              defaultSize="28%"
              minSize="10%"
              maxSize="60%"
              collapsible
              collapsedSize="0%"
              className="min-h-0"
            >
              <section className="relative flex h-full flex-col border-t border-border bg-card/60 backdrop-blur-xl">

                <div className="flex shrink-0 items-center justify-between px-4 py-2">
                  <span className="text-[10px] font-semibold tracking-[0.3em] text-muted-foreground">
                    EDIT SETTINGS
                  </span>

                  <button
                    type="button"
                    onClick={toggleBottom}
                    aria-label="Minimize settings panel"
                    title="Minimize settings panel"
                    className="grid h-7 w-7 place-items-center rounded-full border border-border text-muted-foreground transition-all duration-200 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_14px_var(--primary)]"
                  >

                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden pb-2">
                  {activePages.length > 0 ? (
                    <ResizablePanelGroup orientation="horizontal" className="h-full">
                      {activePages.map((p, i) => (
                        <Fragment key={p.id}>
                          {i > 0 ? <ResizableHandle withHandle /> : null}
                          <ResizablePanel className="min-w-0">
                            <div className="flex h-full flex-col overflow-auto">
                              <p className="px-4 text-[10px] font-semibold tracking-[0.2em] text-muted-foreground">
                                {p.name.toUpperCase()}
                              </p>
                              {p.tool === "PNG to PDF" ? (
                                <div className="mt-2 min-h-0 flex-1">
                                  <PngToPdfSettings pageId={p.id} />
                                </div>
                              ) : p.tool === "JPG to PDF" ? (
                                <div className="mt-2 min-h-0 flex-1">
                                  <PngToPdfSettings pageId={p.id} kind="jpg" />
                                </div>
                              ) : p.tool === "PDF to PNG" ? (
                                <div className="mt-2 min-h-0 flex-1">
                                  <PdfToPngSettings pageId={p.id} pageName={p.name} />
                                </div>
                              ) : p.tool === "PDF to JPG" ? (
                                <div className="mt-2 min-h-0 flex-1">
                                  <PdfToPngSettings pageId={p.id} pageName={p.name} kind="jpg" />
                                </div>
                              ) : p.tool === "PDF to Word" ? (
                                <div className="mt-2 min-h-0 flex-1">
                                  <PdfToWordSettings pageId={p.id} pageName={p.name} />
                                </div>
                              ) : p.tool === "PDF to PPT" ? (
                                <div className="mt-2 min-h-0 flex-1">
                                  <PdfToPptSettings pageId={p.id} pageName={p.name} />
                                </div>
                              ) : p.tool === "Word to PDF" ? (

                                <div className="mt-2 min-h-0 flex-1">
                                  <WordToPdfSettings pageId={p.id} pageName={p.name} />
                                </div>
                              ) : (
                                <p className="mt-1 px-4 text-xs text-muted-foreground/70">
                                  Adjust the settings for {p.tool}.
                                </p>
                              )}
                            </div>

                          </ResizablePanel>
                        </Fragment>
                      ))}
                    </ResizablePanelGroup>
                  ) : (
                    <p className="px-4 text-xs text-muted-foreground/70">
                      Tool settings will appear here.
                    </p>
                  )}
                </div>
              </section>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* TOOLS DIALOG */}
      <Dialog open={toolsOpen} onOpenChange={setToolsOpen}>
        <DialogContent className="flex h-[76vh] w-[92vw] max-w-5xl flex-col overflow-hidden rounded-3xl border-border bg-card/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-lg tracking-wide">Tools</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            <ToolPicker
              onSelect={(name) => addPage(name, insertAt)}
              onClose={() => setToolsOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ALL PAGES DIALOG */}
      <Dialog open={pagesOpen} onOpenChange={setPagesOpen}>
        <DialogContent className="flex h-[92vh] w-[96vw] max-w-[1500px] flex-col overflow-hidden rounded-3xl border-border bg-card/95 backdrop-blur-2xl sm:max-w-[1500px]">
          <DialogHeader>
            <DialogTitle className="font-display text-lg tracking-wide">
              All Pages <span className="text-muted-foreground/60">· {pages.length}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="flex flex-wrap items-stretch gap-y-6">
              {pages.map((p, i) => (
                <Fragment key={p.id}>
                  <InsertPageButton
                    onClick={() => {
                      setInsertAt(i);
                      setPagesOpen(false);
                      setToolsOpen(true);
                    }}
                  />
                  <div className="w-[300px] max-w-full">
                    <PageCard
                      page={p}
                      index={i + 1}
                      active={activeGroup?.pageIds.includes(p.id) ?? false}
                      onOpen={() => {
                        const g = groups.find((gr) => gr.pageIds.includes(p.id));
                        if (g) setActiveGroupId(g.id);
                        setFocusedPageId(p.id);
                        setPagesOpen(false);
                      }}
                      onRename={(name) => renamePage(p.id, name)}
                      onClose={() => requestClosePage(p.id)}
                    />
                  </div>
                </Fragment>
              ))}
              <InsertPageButton
                onClick={() => {
                  setInsertAt(null);
                  setPagesOpen(false);
                  setToolsOpen(true);
                }}
              />
              {/* Always show an "Add tool" tab — never an empty dialog */}
              <div className="flex w-[300px] max-w-full flex-col gap-1.5">
                <p className="truncate px-1 text-[10px] font-semibold tracking-[0.2em] text-muted-foreground">
                  NEW PAGE
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setInsertAt(null);
                    setPagesOpen(false);
                    setToolsOpen(true);
                  }}
                  className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-muted-foreground transition-all duration-200 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_18px_var(--primary)]"
                  aria-label="Add tool"
                >
                  <Plus className="h-6 w-6" />
                  <span className="text-xs font-semibold">Add tool</span>
                </button>
                <span className="px-1 text-xs text-muted-foreground/70">
                  Pick a tool to create a page
                </span>
              </div>
            </div>

          </div>
        </DialogContent>
      </Dialog>
      {/* LEAVE / CLOSE CONFIRMATION */}
      <Dialog open={pendingCloseId != null} onOpenChange={(o) => !o && setPendingCloseId(null)}>
        <DialogContent className="max-w-md rounded-2xl border-border bg-card/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              Leaving this page will erase your current work. Are you sure?
            </DialogTitle>
            <DialogDescription>
              Uploaded files and converted results on this page are not saved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => setPendingCloseId(null)}
              className="inline-flex h-9 items-center rounded-full border border-border px-5 text-xs font-semibold text-foreground transition-all duration-200 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_14px_var(--primary)]"
            >
              No
            </button>
            <button
              type="button"
              onClick={() => {
                if (pendingCloseId) closePage(pendingCloseId);
                setPendingCloseId(null);
              }}
              className="inline-flex h-9 items-center rounded-full bg-primary px-5 text-xs font-semibold text-primary-foreground transition-all duration-200 hover:shadow-[0_0_18px_var(--primary)]"
            >
              Yes
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShareMenu({ pages, focused }: { pages: Page[]; focused: Page | null }) {
  usePngVersion();
  usePdfVersion();
  const page = focused ?? pages[0] ?? null;
  const pngConverted = page ? getPngState(page.id).converted : null;
  const pdfConverted = page ? getPdfState(page.id).converted : null;
  const converted = pngConverted
    ? { url: pngConverted.url, size: pngConverted.size, filename: `${page?.name ?? "untitled"}.pdf` }
    : pdfConverted
      ? { url: pdfConverted.url, size: pdfConverted.size, filename: pdfConverted.filename }
      : null;

  const download = () => {
    if (!converted) return;
    const a = document.createElement("a");
    a.href = converted.url;
    a.download = converted.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-4 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
        >
          <Upload className="h-4 w-4" />
          <span>Share</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-3">
        {converted ? (
          <>
            <p className="mb-2 truncate text-xs text-muted-foreground">
              {converted.filename} · {(converted.size / 1024).toFixed(0)} KB
            </p>
            <button
              type="button"
              onClick={download}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition-all duration-200 hover:shadow-[0_0_18px_var(--primary)]"
            >
              <Download className="h-4 w-4" /> Download
            </button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nothing to download yet — convert your files first, then come back here.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


function InsertPageButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex w-8 shrink-0 items-center justify-center self-stretch">
      <button
        type="button"
        onClick={onClick}
        aria-label="Insert page here"
        title="Add page here"
        className="grid h-7 w-7 place-items-center rounded-full border border-border/70 text-muted-foreground opacity-40 transition-all duration-200 hover:opacity-100 hover:border-primary/60 hover:text-primary hover:shadow-[0_0_16px_var(--primary)]"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function PageCard({
  page,
  index,
  active,
  onOpen,
  onRename,
  onClose,
}: {
  page: Page;
  index: number;
  active: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      {/* Tool name sits above the page tab */}
      <p
        title={page.tool}
        className="truncate px-1 text-[10px] font-semibold tracking-[0.2em] text-primary/80"
      >
        {page.tool.toUpperCase()}
      </p>
      <div
        className={`relative aspect-[4/3] overflow-hidden rounded-2xl border transition-all duration-200 ${
          active ? "border-primary/60 shadow-[0_0_18px_var(--primary)]" : "border-border"
        }`}
      >
        <span className="absolute left-1.5 top-1.5 z-10 grid h-6 min-w-6 place-items-center rounded-full bg-background/80 px-1.5 text-[11px] font-semibold tabular-nums text-foreground backdrop-blur">
          {index}
        </span>

        {/* LIVE PREVIEW of the page content, scaled down */}
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open ${page.name}`}
          className="block h-full w-full overflow-hidden bg-aurora bg-secondary/30 text-left"
        >
          <div
            className="pointer-events-none origin-top-left"
            style={{ width: "320%", height: "320%", transform: "scale(0.3125)" }}
          >
            <ToolWorkspace tool={page.tool} pageId={page.id} preview />
          </div>
        </button>

        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${page.name}`}
          className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-background/80 text-muted-foreground transition-colors hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-1">
        {editing ? (
          <input
            autoFocus
            defaultValue={page.name}
            onBlur={(e) => {
              onRename(e.target.value);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRename((e.target as HTMLInputElement).value);
                setEditing(false);
              }
              if (e.key === "Escape") setEditing(false);
            }}
            className="min-w-0 flex-1 rounded-md bg-secondary/40 px-1.5 py-0.5 text-xs outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
            {page.name}
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Rename ${page.name}`}
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-primary"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function PageTab({
  page,
  active,
  focused,
  merged,
  renaming,
  dropTarget,
  onActivate,
  onStartRename,
  onRename,
  onClose,
  onUnmerge,
  onDragStart,
  onDragEnd,
  onDragOverTab,
  onDropTab,
}: {
  page: Page;
  active: boolean;
  focused: boolean;
  merged: boolean;
  renaming: boolean;
  dropTarget: boolean;

  onActivate: () => void;
  onStartRename: () => void;
  onRename: (name: string) => void;
  onClose: () => void;
  onUnmerge: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverTab: () => void;
  onDropTab: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  return (
    <div
      draggable={!renaming}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", page.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverTab();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropTab();
      }}
      title={`${page.name} — ${page.tool} (drag onto another tab to merge)`}
      className={`group flex shrink-0 cursor-grab items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-all duration-200 ${
        dropTarget
          ? "border-primary bg-primary/20 text-primary shadow-[0_0_16px_var(--primary)]"
          : focused
            ? "border-primary bg-primary/15 text-primary shadow-[0_0_12px_var(--primary)]"
            : active
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {renaming ? (
        <input
          ref={inputRef}
          defaultValue={page.name}
          autoFocus
          onBlur={(e) => onRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRename((e.target as HTMLInputElement).value);
            if (e.key === "Escape") onRename(page.name);
          }}
          className="w-28 bg-transparent text-xs outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={onActivate}
          onDoubleClick={onStartRename}
          className="max-w-40 truncate font-medium"
        >
          {page.name}
        </button>
      )}
      <button
        type="button"
        onClick={onStartRename}
        aria-label={`Rename ${page.name}`}
        title="Rename page"
        className="grid h-4 w-4 place-items-center rounded-full opacity-50 transition-all duration-200 hover:opacity-100 hover:text-primary hover:drop-shadow-[0_0_6px_var(--primary)]"
      >
        <Pencil className="h-3 w-3" />
      </button>
      {merged ? (
        <button
          type="button"
          onClick={onUnmerge}
          aria-label={`Split ${page.name} out`}
          title="Split out of merged view"
          className="grid h-4 w-4 place-items-center rounded-full opacity-50 transition-opacity hover:opacity-100"
        >
          <ChevronsUpDown className="h-3 w-3 rotate-90" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close ${page.name}`}
        className="grid h-4 w-4 place-items-center rounded-full opacity-50 transition-opacity hover:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function ZoomSlider({
  page,
  zoom,
  onZoom,
}: {
  page: Page | null;
  zoom: number;
  onZoom: (value: number) => void;
}) {
  const disabled = !page;
  return (
    <div
      title={page ? `Zoom ${page.name}` : "Select a page to zoom"}
      className={`group flex items-center gap-2 ${disabled ? "opacity-50" : ""}`}
    >

      <button
        type="button"
        disabled={disabled}
        onClick={() => onZoom(Math.round((zoom - 0.1) * 100) / 100)}
        aria-label="Zoom out"
        className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground transition-colors hover:text-primary disabled:cursor-not-allowed"
      >
        <ZoomOut className="h-3.5 w-3.5" />
      </button>
      <Slider
        value={[zoom]}
        min={0.25}
        max={3}
        step={0.05}
        disabled={disabled}
        onValueChange={(v) => onZoom(v[0] ?? 1)}
        className="w-28"
        aria-label="Zoom level"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onZoom(1)}
        className="w-10 shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground transition-colors hover:text-primary disabled:cursor-not-allowed"
        title="Reset zoom to 100%"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onZoom(Math.round((zoom + 0.1) * 100) / 100)}
        aria-label="Zoom in"
        className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground transition-colors hover:text-primary disabled:cursor-not-allowed"
      >
        <ZoomIn className="h-3.5 w-3.5" />
      </button>

    </div>
  );
}


function SideButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof LayoutGrid;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
        active
          ? "border-primary/40 bg-secondary text-primary"
          : "border-transparent text-foreground hover:bg-accent"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

import React, { useState, useEffect, useMemo } from "react";
import {
  FileText,
  Plus,
  Network,
  Edit3,
  Trash2,
  Tag,
  Link as LinkIcon,
  Search,
  BookOpen,
  ArrowRight,
} from "lucide-react";
import { cn } from "~/lib/utils";
import {
  type VaultNote,
  STARTER_VAULT_NOTES,
  parseVaultNote,
  buildGraphDataFromNotes,
  normalizeNoteId,
} from "./LeonidasVault.logic.ts";
import { LeonidasKnowledgeGraph3D } from "./LeonidasKnowledgeGraph3D.tsx";

const VAULT_STORAGE_KEY = "leonidas-vault-notes";

export interface LeonidasVaultPanelProps {
  readonly initialView?: "vault" | "graph";
  readonly className?: string;
}

export function LeonidasVaultPanel({
  initialView = "vault",
  className = "",
}: LeonidasVaultPanelProps) {
  // Load notes from local storage or starter notes
  const [notes, setNotes] = useState<VaultNote[]>(() => {
    try {
      const saved = localStorage.getItem(VAULT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // fallback
    }
    return [...STARTER_VAULT_NOTES];
  });

  const [activeNoteId, setActiveNoteId] = useState<string>(() => {
    return notes[0]?.id ?? "leonidas-aios-architecture";
  });

  const [viewMode, setViewMode] = useState<"editor" | "graph" | "split">(
    initialView === "graph" ? "graph" : "split",
  );
  const [editorPreview, setEditorPreview] = useState<"edit" | "preview">("edit");
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Save notes to storage on change
  useEffect(() => {
    try {
      localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(notes));
    } catch {
      // ignore
    }
  }, [notes]);

  const activeNote = useMemo(() => {
    return notes.find((n) => n.id === activeNoteId) ?? notes[0] ?? null;
  }, [notes, activeNoteId]);

  // Compute 3D Graph Data
  const graphData = useMemo(() => {
    return buildGraphDataFromNotes(notes, { includeTags: true });
  }, [notes]);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>();
    notes.forEach((note) => note.tags.forEach((t) => tagsSet.add(t)));
    return Array.from(tagsSet).sort();
  }, [notes]);

  // Filtered notes list
  const filteredNotes = useMemo(() => {
    const query = searchFilter.toLowerCase().trim();
    return notes.filter((note) => {
      if (selectedTag && !note.tags.includes(selectedTag)) return false;
      if (!query) return true;
      return (
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query) ||
        note.tags.some((t) => t.toLowerCase().includes(query))
      );
    });
  }, [notes, searchFilter, selectedTag]);

  // Handle note content editing
  const handleUpdateContent = (newContent: string) => {
    if (!activeNote) return;
    const updated = parseVaultNote(activeNote.path, newContent);
    setNotes((prev) =>
      prev.map((n) =>
        n.id === activeNote.id
          ? {
              ...n,
              content: newContent,
              title: updated.title,
              tags: updated.tags,
              outgoingLinks: updated.outgoingLinks,
              updatedAt: Date.now(),
            }
          : n,
      ),
    );
  };

  const handleUpdateTitle = (newTitle: string) => {
    if (!activeNote) return;
    setNotes((prev) =>
      prev.map((n) =>
        n.id === activeNote.id ? { ...n, title: newTitle, updatedAt: Date.now() } : n,
      ),
    );
  };

  const handleCreateNote = () => {
    const newTitle = `Untitled Note ${notes.length + 1}`;
    const newId = normalizeNoteId(newTitle);
    const newPath = `.leonidas/vault/${newId}.md`;
    const newContent = `# ${newTitle}\n\nWrite your note here. Link to another note with [[Note Title]]. Add a #tag to group notes.`;
    const newNote = parseVaultNote(newPath, newContent);

    setNotes((prev) => [newNote, ...prev]);
    setActiveNoteId(newNote.id);
    setViewMode("editor");
  };

  const handleDeleteNote = (id: string) => {
    setNotes((prev) => {
      const remaining = prev.filter((n) => n.id !== id);
      if (activeNoteId === id && remaining.length > 0) {
        setActiveNoteId(remaining[0]!.id);
      }
      return remaining;
    });
  };

  // Backlinks for active note
  const activeBacklinks = useMemo(() => {
    if (!activeNote) return [];
    return graphData.backlinksByNoteId[activeNote.id] ?? [];
  }, [activeNote, graphData.backlinksByNoteId]);

  return (
    <div
      className={cn("flex h-full w-full bg-background text-foreground overflow-hidden", className)}
    >
      {/* Left Sidebar: Notes Navigator & Tags */}
      <div className="w-64 shrink-0 flex flex-col border-r border-border bg-sidebar">
        {/* Header */}
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="font-semibold text-xs tracking-wider uppercase text-foreground">
              Leonidas Vault
            </span>
          </div>
          <button
            type="button"
            onClick={handleCreateNote}
            className="flex items-center gap-1 px-2 py-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded text-xs transition font-medium"
            aria-label="Add a note"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New note</span>
          </button>
        </div>

        {/* Search & Tag Filter */}
        <div className="p-2 border-b border-border space-y-2">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-muted/50 border border-border text-xs">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search notes…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          {/* Tags scroll bar */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-2xs">
            <button
              type="button"
              onClick={() => setSelectedTag(null)}
              className={cn(
                "px-2 py-0.5 rounded transition",
                selectedTag === null
                  ? "bg-primary/15 text-primary border border-primary/30 font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={cn(
                  "px-2 py-0.5 rounded whitespace-nowrap transition",
                  selectedTag === tag
                    ? "bg-primary/15 text-primary border border-primary/30 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
          {filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground">
              <FileText className="w-8 h-8 mb-2 opacity-40 text-muted-foreground" />
              <p className="font-medium text-foreground">No notes found</p>
              <p className="mt-1 text-2xs text-muted-foreground">
                {searchFilter ? "Try another search term" : "Create your first note to get started"}
              </p>
              {!searchFilter && (
                <button
                  type="button"
                  onClick={handleCreateNote}
                  className="mt-3 px-2.5 py-1 text-2xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition font-medium"
                >
                  New note
                </button>
              )}
            </div>
          ) : (
            filteredNotes.map((note) => {
              const isActive = activeNote?.id === note.id;
              return (
                <div
                  key={note.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActiveNoteId(note.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setActiveNoteId(note.id);
                    }
                  }}
                  className={cn(
                    "group flex items-start justify-between p-2 rounded cursor-pointer transition text-xs",
                    isActive
                      ? "bg-accent text-accent-foreground border-l-2 border-primary font-medium"
                      : "hover:bg-muted/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-medium truncate">
                      <FileText
                        className={cn(
                          "w-3.5 h-3.5 shrink-0",
                          isActive ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      <span className="truncate">{note.title}</span>
                    </div>
                    {note.tags.length > 0 && (
                      <div className="flex gap-1 mt-1 truncate">
                        {note.tags.slice(0, 2).map((t) => (
                          <span key={t} className="text-3xs text-muted-foreground">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteNote(note.id);
                    }}
                    className="opacity-0 pointer-coarse:opacity-100 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive rounded transition"
                    aria-label="Delete note"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* View Switcher Bar at Bottom */}
        <div className="p-2 border-t border-border bg-muted/20 flex items-center justify-around text-xs">
          <button
            type="button"
            onClick={() => setViewMode("editor")}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded transition",
              viewMode === "editor"
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Note</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("split")}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded transition",
              viewMode === "split"
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Split</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("graph")}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded transition",
              viewMode === "graph"
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            <Network className="w-3.5 h-3.5" />
            <span>Note map</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Pane (visible in editor or split mode) */}
        {(viewMode === "editor" || viewMode === "split") &&
          (activeNote ? (
            <div className="flex-1 flex flex-col border-r border-border overflow-hidden bg-background">
              {/* Editor Toolbar */}
              <div className="p-3 border-b border-border flex items-center justify-between">
                <input
                  type="text"
                  value={activeNote.title}
                  onChange={(e) => handleUpdateTitle(e.target.value)}
                  className="bg-transparent text-base font-bold text-foreground focus:outline-none focus:border-b border-primary w-2/3"
                  placeholder="Note title"
                />

                <div className="flex items-center gap-1 bg-muted rounded p-1 border border-border text-xs">
                  <button
                    type="button"
                    onClick={() => setEditorPreview("edit")}
                    className={cn(
                      "px-2 py-0.5 rounded transition",
                      editorPreview === "edit"
                        ? "bg-background text-foreground shadow-xs font-medium"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorPreview("preview")}
                    className={cn(
                      "px-2 py-0.5 rounded transition",
                      editorPreview === "preview"
                        ? "bg-background text-foreground shadow-xs font-medium"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Preview
                  </button>
                </div>
              </div>

              {/* Note Tags & Links metadata bar */}
              <div className="px-4 py-2 bg-muted/20 border-b border-border flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Tag className="w-3 h-3 text-primary" />
                  <span>Tags:</span>
                  {activeNote.tags.length > 0 ? (
                    activeNote.tags.map((t) => (
                      <span key={t} className="text-foreground font-mono text-2xs">
                        #{t}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted-foreground/60">none</span>
                  )}
                </div>

                <div className="w-[1px] h-3 bg-border" />

                <div className="flex items-center gap-1">
                  <LinkIcon className="w-3 h-3 text-primary" />
                  <span>Links to other notes ({activeNote.outgoingLinks.length}):</span>
                  {activeNote.outgoingLinks.map((target) => (
                    <button
                      key={target}
                      type="button"
                      onClick={() => setActiveNoteId(target)}
                      className="text-primary hover:underline font-mono text-2xs"
                    >
                      [[{target}]]
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea or Preview */}
              <div className="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed">
                {editorPreview === "edit" ? (
                  <textarea
                    value={activeNote.content}
                    onChange={(e) => handleUpdateContent(e.target.value)}
                    placeholder="Type your note. Use [[Note Title]] to link to another note. Use #tags to group notes."
                    className="w-full h-full bg-transparent text-foreground resize-none focus:outline-none placeholder:text-muted-foreground font-sans text-sm leading-relaxed"
                  />
                ) : (
                  <div className="max-w-none text-foreground font-sans leading-relaxed">
                    <div className="whitespace-pre-wrap">{activeNote.content}</div>
                  </div>
                )}
              </div>

              {/* Backlinks Pane at Bottom */}
              <div className="p-3 border-t border-border bg-muted/20">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2">
                  <LinkIcon className="w-3.5 h-3.5 text-primary" />
                  <span>Notes that link here ({activeBacklinks.length})</span>
                </div>
                {activeBacklinks.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {activeBacklinks.map((link) => (
                      <button
                        key={link.sourceId}
                        type="button"
                        onClick={() => setActiveNoteId(link.sourceId)}
                        className="flex items-center gap-1 px-2 py-1 rounded bg-muted/60 hover:bg-accent border border-border hover:border-primary/50 text-xs text-foreground transition"
                      >
                        <ArrowRight className="w-3 h-3 text-primary" />
                        <span>{link.title}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground/70 italic">
                    No notes link to this note yet. Add [[this note title]] in another note to link
                    it.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground border-r border-border bg-background">
              <FileText className="w-10 h-10 mb-3 opacity-30 text-muted-foreground" />
              <h3 className="font-medium text-sm text-foreground">No note selected</h3>
              <p className="mt-1 text-xs max-w-xs text-muted-foreground">
                Select a note from the sidebar or create a new note to start writing.
              </p>
              <button
                type="button"
                onClick={handleCreateNote}
                className="mt-4 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition flex items-center gap-1.5 font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create note</span>
              </button>
            </div>
          ))}

        {/* 3D Knowledge Graph (visible in graph or split mode) */}
        {(viewMode === "graph" || viewMode === "split") && (
          <div className="flex-1 relative h-full">
            <LeonidasKnowledgeGraph3D
              graphData={graphData}
              selectedNodeId={activeNote?.id ?? null}
              onSelectNode={(nodeId) => {
                const cleanId = nodeId.startsWith("tag:") ? nodeId.replace("tag:", "") : nodeId;
                if (notes.some((n) => n.id === cleanId)) {
                  setActiveNoteId(cleanId);
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

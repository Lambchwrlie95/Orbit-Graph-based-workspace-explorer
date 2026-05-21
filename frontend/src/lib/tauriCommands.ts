import { invoke, type InvokeArgs } from "@tauri-apps/api/core";
import type {
  CacheStatus,
  CodeAnalysis,
  ColorExtractionResult,
  FileGitStatus,
  FileRecord,
  GraphPayload,
  GraphRequest,
  ImageMetadataResult,
  IconThemeMeta,
  IconThemePayload,
  MarkdownAnalysis,
  NodeNote,
  OmarchyColors,
  OperationStats,
  PerformanceMetrics,
  PreviewPayload,
  ScanProgress,
  SimilarImage,
  ThumbnailInfo,
  ThumbnailRequest,
  ThumbnailResponse,
} from "../types";

export const TAURI_COMMANDS = [
  "choose_folder",
  "default_root_path",
  "scan_workspace",
  "list_children",
  "list_children_paginated",
  "get_children_count",
  "search_files",
  "get_file",
  "load_graph",
  "get_preview",
  "open_path",
  "get_log_path",
  "check_cache_status",
  "get_performance_metrics",
  "get_operation_stats",
  "reset_performance_metrics",
  "analyze_code_file",
  "analyze_markdown_file",
  "batch_analyze_code_files",
  "batch_analyze_markdown_files",
  "list_analyzable_files",
  "get_file_git_status",
  "get_files_git_status",
  "get_related_files",
  "is_analyzable_code_file",
  "is_analyzable_markdown_file",
  "get_supported_code_extensions",
  "find_git_repo_root",
  "is_in_git_repo",
  "get_node_note",
  "save_node_note",
  "analyze_image_file",
  "extract_colors",
  "compute_image_phash",
  "find_similar_images",
  "compute_workspace_phashes",
  "ensure_thumbnail",
  "get_thumbnail_info",
  "delete_thumbnails",
  "get_supported_thumbnail_sizes",
  "get_thumbnail_base_path",
  "list_icon_themes",
  "get_active_icon_theme",
  "set_active_icon_theme",
  "open_icon_themes_dir",
  "save_user_icon_theme",
  "delete_user_icon_theme",
  "open_in_terminal_editor",
  "open_terminal_at_path",
  "create_file",
  "create_folder",
  "rename",
  "get_omarchy_colors",
] as const;

export type TauriCommand = typeof TAURI_COMMANDS[number];

type CommandArgsMap = {
  choose_folder: undefined;
  default_root_path: undefined;
  scan_workspace: { rootPath: string };
  list_children: { parentPath: string };
  list_children_paginated: { parentPath: string; limit: number; offset: number };
  get_children_count: { parentPath: string };
  search_files: { rootPath: string; query: string };
  get_file: { path: string };
  load_graph: { request: GraphRequest };
  get_preview: { path: string };
  open_path: { path: string };
  get_log_path: undefined;
  check_cache_status: { rootPath: string };
  get_performance_metrics: undefined;
  get_operation_stats: undefined;
  reset_performance_metrics: undefined;
  analyze_code_file: { path: string };
  analyze_markdown_file: { path: string };
  batch_analyze_code_files: { paths: string[] };
  batch_analyze_markdown_files: { paths: string[] };
  list_analyzable_files: { rootPath: string };
  get_file_git_status: { path: string };
  get_files_git_status: { paths: string[] };
  get_related_files: { path: string };
  is_analyzable_code_file: { path: string };
  is_analyzable_markdown_file: { path: string };
  get_supported_code_extensions: undefined;
  find_git_repo_root: { path: string };
  is_in_git_repo: { path: string };
  get_node_note: { path: string };
  save_node_note: { path: string; body: string };
  analyze_image_file: { fileId: number; filePath: string };
  extract_colors: { fileId: number; filePath: string; colorCount: number };
  compute_image_phash: { fileId: number; filePath: string };
  find_similar_images: {
    fileId: number;
    filePath: string;
    rootPath: string;
    maxDistance: number;
  };
  compute_workspace_phashes: { rootPath: string };
  ensure_thumbnail: { request: ThumbnailRequest };
  get_thumbnail_info: { fileId: number };
  delete_thumbnails: { fileId: number };
  get_supported_thumbnail_sizes: undefined;
  get_thumbnail_base_path: undefined;
  list_icon_themes: undefined;
  get_active_icon_theme: undefined;
  set_active_icon_theme: { id: string };
  open_icon_themes_dir: undefined;
  save_user_icon_theme: { id: string; tomlContent: string };
  delete_user_icon_theme: { id: string };
  open_in_terminal_editor: { path: string; editorCommand?: string };
  open_terminal_at_path: { path: string; terminalCommand?: string };
  create_file: { parentDir: string; name: string };
  create_folder: { parentDir: string; name: string };
  rename: { path: string; newName: string };
  get_omarchy_colors: undefined;
};

type CommandResultMap = {
  choose_folder: string | null;
  default_root_path: string;
  scan_workspace: ScanProgress;
  list_children: FileRecord[];
  list_children_paginated: FileRecord[];
  get_children_count: number;
  search_files: FileRecord[];
  get_file: FileRecord | null;
  load_graph: GraphPayload;
  get_preview: PreviewPayload;
  open_path: void;
  get_log_path: string | null;
  check_cache_status: CacheStatus;
  get_performance_metrics: PerformanceMetrics;
  get_operation_stats: OperationStats;
  reset_performance_metrics: void;
  analyze_code_file: CodeAnalysis | null;
  analyze_markdown_file: MarkdownAnalysis | null;
  batch_analyze_code_files: Array<[string, CodeAnalysis | null]>;
  batch_analyze_markdown_files: Array<[string, MarkdownAnalysis | null]>;
  list_analyzable_files: { code: string[]; markdown: string[] };
  get_file_git_status: FileGitStatus;
  get_files_git_status: Array<[string, FileGitStatus]>;
  get_related_files: string[];
  is_analyzable_code_file: boolean;
  is_analyzable_markdown_file: boolean;
  get_supported_code_extensions: string[];
  find_git_repo_root: string | null;
  is_in_git_repo: boolean;
  get_node_note: NodeNote;
  save_node_note: NodeNote;
  analyze_image_file: ImageMetadataResult;
  extract_colors: ColorExtractionResult;
  compute_image_phash: number[];
  find_similar_images: SimilarImage[];
  compute_workspace_phashes: number;
  ensure_thumbnail: ThumbnailResponse;
  get_thumbnail_info: ThumbnailInfo[];
  delete_thumbnails: void;
  get_supported_thumbnail_sizes: number[];
  get_thumbnail_base_path: string;
  list_icon_themes: IconThemeMeta[];
  get_active_icon_theme: IconThemePayload;
  set_active_icon_theme: void;
  open_icon_themes_dir: string;
  save_user_icon_theme: void;
  delete_user_icon_theme: void;
  open_in_terminal_editor: void;
  open_terminal_at_path: void;
  create_file: string;
  create_folder: string;
  rename: string;
  get_omarchy_colors: OmarchyColors;
};

type CommandArgs<C extends TauriCommand> = CommandArgsMap[C];

export function tauriInvoke<C extends TauriCommand>(
  command: C,
  ...args: CommandArgs<C> extends undefined ? [] : [args: CommandArgs<C>]
): Promise<CommandResultMap[C]> {
  return invoke<CommandResultMap[C]>(command, args[0] as InvokeArgs | undefined);
}

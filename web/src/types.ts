export interface Limits {
  maxChars: number;
  maxBytes: number;
  maxFiles: number;
  maxAggregateBytes: number;
}
export interface Repository {
  id: string | number;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  description: string | null;
}
export interface TreeItem {
  refId: string;
  name: string;
  path: string;
  type: string;
  size?: number;
}
export interface WorkspaceFile {
  path: string;
  draftText: string;
  revision: number;
}
export interface Workspace {
  id: string;
  repoId: string | number;
  repoFullName: string;
  baseBranch: string;
  baseHeadSha: string;
  state: string;
  path: string;
  files: WorkspaceFile[];
  commitMessage: string;
  result?: { commitSha?: string; branch?: string };
}
export interface WorkspaceResponse {
  workspace: Workspace;
  limits: Limits;
}
export interface Diff {
  text: string;
  additions: number;
  deletions: number;
  truncated: boolean;
}
export interface ReviewSnapshot {
  baseHeadSha: string;
  files: { path: string; revision: number }[];
}
export interface Approval {
  approvalRequested: boolean;
  workspaceId: string;
  targetBranch: string;
  baseHeadSha: string;
  expiresAt: number | string;
}
export interface TelegramWebApp {
  initData: string;
  ready?: () => void;
  expand?: () => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  close?: () => void;
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
}
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export type AppPhase = "unauthenticated" | "folder-selection" | "ready"

export interface AuthSession {
	accessToken: string
	expiresAt: number
}

export interface DriveMarkdownFile {
	id: string
	name: string
	modifiedTime: string
}

export interface DriveFolder {
	id: string
	name: string
}

export interface NoteRecord {
	id: string
	driveFileId: string
	folderId: string
	name: string
	content: string
	updatedAt: number
	dirty: boolean
	lastSyncedAt?: number
}

export interface SyncSummary {
	pulled: number
	pushed: number
	skipped: number
}

export type VaultNodeKind = "folder" | "file"

export interface VaultNode {
	id: string
	rootId: string
	parentId: string | null
	kind: VaultNodeKind
	name: string
	content?: string
	driveId?: string
	dirty: boolean
	updatedAt: number
	lastSyncedAt?: number
	lastRemoteModifiedAt?: number
}

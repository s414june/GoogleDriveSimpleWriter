import type { AuthSession, VaultNode } from "../types"
import {
	createDriveFolder,
	createDriveMarkdownFile,
	downloadMarkdown,
	getDriveFileMetadata,
	uploadMarkdown,
	updateDriveFileName,
} from "./driveService"
import { vaultRepository } from "./vaultRepository"

export interface VaultSyncSummary {
	pulled: number
	pushed: number
	skipped: number
	conflicts: number
}

function now(): number {
	return Date.now()
}

function toMillis(value?: string): number {
	if (!value) {
		return 0
	}
	const time = Date.parse(value)
	return Number.isNaN(time) ? 0 : time
}

function normalizeFileName(name: string): string {
	return name.endsWith(".md") ? name : `${name}.md`
}

function buildConflictName(original: string): string {
	const base = original.replace(/\.md$/i, "")
	const stamp = new Date().toISOString().replace(/[:.]/g, "-")
	return `${base} (衝突 ${stamp}).md`
}

function depthOf(node: VaultNode, byId: Map<string, VaultNode>): number {
	let depth = 0
	let parentId = node.parentId
	while (parentId) {
		depth += 1
		parentId = byId.get(parentId)?.parentId ?? null
	}
	return depth
}

function resolveParentDriveId(
	node: VaultNode,
	byId: Map<string, VaultNode>,
	rootId: string,
): string | null {
	if (!node.parentId) {
		return rootId
	}
	if (node.parentId === rootId) {
		return rootId
	}
	return byId.get(node.parentId)?.driveId ?? null
}

async function upsertNode(next: VaultNode): Promise<void> {
	await vaultRepository.upsert({
		...next,
		updatedAt: now(),
	})
}

export async function syncVaultRoot(
	session: AuthSession,
	rootId: string,
): Promise<VaultSyncSummary> {
	const summary: VaultSyncSummary = {
		pulled: 0,
		pushed: 0,
		skipped: 0,
		conflicts: 0,
	}

	if (!navigator.onLine) {
		const all = await vaultRepository.listByRoot(rootId)
		summary.skipped = all.filter((node) => node.dirty).length
		return summary
	}

	let nodes = await vaultRepository.listByRoot(rootId)
	let byId = new Map(nodes.map((node) => [node.id, node]))

	const dirtyFolders = nodes
		.filter(
			(node) => node.kind === "folder" && node.dirty && node.id !== rootId,
		)
		.sort((a, b) => depthOf(a, byId) - depthOf(b, byId))

	for (const folder of dirtyFolders) {
		const parentDriveId = resolveParentDriveId(folder, byId, rootId)
		if (!parentDriveId) {
			summary.skipped += 1
			continue
		}

		if (!folder.driveId) {
			const created = await createDriveFolder(
				session.accessToken,
				parentDriveId,
				folder.name,
			)
			const syncedFolder: VaultNode = {
				...folder,
				driveId: created.id,
				dirty: false,
				lastSyncedAt: now(),
				lastRemoteModifiedAt: toMillis(created.modifiedTime),
			}
			await upsertNode(syncedFolder)
			summary.pushed += 1
		} else {
			await updateDriveFileName(
				session.accessToken,
				folder.driveId,
				folder.name,
			)
			const remoteMeta = await getDriveFileMetadata(
				session.accessToken,
				folder.driveId,
			)
			const syncedFolder: VaultNode = {
				...folder,
				dirty: false,
				lastSyncedAt: now(),
				lastRemoteModifiedAt: toMillis(remoteMeta.modifiedTime),
			}
			await upsertNode(syncedFolder)
			summary.pushed += 1
		}
	}

	nodes = await vaultRepository.listByRoot(rootId)
	byId = new Map(nodes.map((node) => [node.id, node]))
	const dirtyFiles = nodes.filter((node) => node.kind === "file" && node.dirty)

	for (const file of dirtyFiles) {
		const parentDriveId = resolveParentDriveId(file, byId, rootId)
		if (!parentDriveId) {
			summary.skipped += 1
			continue
		}

		const localContent = file.content ?? ""
		if (!file.driveId) {
			const created = await createDriveMarkdownFile(
				session.accessToken,
				parentDriveId,
				file.name,
				localContent,
			)
			const syncedFile: VaultNode = {
				...file,
				driveId: created.id,
				name: normalizeFileName(created.name),
				dirty: false,
				lastSyncedAt: now(),
				lastRemoteModifiedAt: toMillis(created.modifiedTime),
			}
			await upsertNode(syncedFile)
			summary.pushed += 1
			continue
		}

		const remoteMeta = await getDriveFileMetadata(
			session.accessToken,
			file.driveId,
		)
		const remoteModifiedAt = toMillis(remoteMeta.modifiedTime)
		const knownRemoteModifiedAt = file.lastRemoteModifiedAt ?? 0
		const remoteChangedAfterLocalEdit =
			remoteModifiedAt > knownRemoteModifiedAt &&
			remoteModifiedAt > file.updatedAt

		if (remoteChangedAfterLocalEdit) {
			const remoteContent = await downloadMarkdown(
				session.accessToken,
				file.driveId,
			)
			if (remoteContent !== localContent) {
				const conflictName = buildConflictName(file.name)
				const conflictCreated = await createDriveMarkdownFile(
					session.accessToken,
					parentDriveId,
					conflictName,
					localContent,
				)

				const conflictNode: VaultNode = {
					...file,
					id: `local-${crypto.randomUUID()}`,
					name: normalizeFileName(conflictName),
					content: localContent,
					driveId: conflictCreated.id,
					dirty: false,
					lastSyncedAt: now(),
					lastRemoteModifiedAt: toMillis(conflictCreated.modifiedTime),
					updatedAt: now(),
				}
				await vaultRepository.upsert(conflictNode)

				const resolvedCurrent: VaultNode = {
					...file,
					name: normalizeFileName(remoteMeta.name),
					content: remoteContent,
					dirty: false,
					lastSyncedAt: now(),
					lastRemoteModifiedAt: remoteModifiedAt,
				}
				await upsertNode(resolvedCurrent)

				summary.conflicts += 1
				summary.pulled += 1
				summary.pushed += 1
				continue
			}

			const syncedSameContent: VaultNode = {
				...file,
				name: normalizeFileName(remoteMeta.name),
				dirty: false,
				lastSyncedAt: now(),
				lastRemoteModifiedAt: remoteModifiedAt,
			}
			await upsertNode(syncedSameContent)
			continue
		}

		if (remoteMeta.name !== file.name) {
			await updateDriveFileName(session.accessToken, file.driveId, file.name)
		}
		await uploadMarkdown(session.accessToken, file.driveId, localContent)
		const updatedRemoteMeta = await getDriveFileMetadata(
			session.accessToken,
			file.driveId,
		)
		const pushedFile: VaultNode = {
			...file,
			dirty: false,
			lastSyncedAt: now(),
			lastRemoteModifiedAt: toMillis(updatedRemoteMeta.modifiedTime),
		}
		await upsertNode(pushedFile)
		summary.pushed += 1
	}

	return summary
}

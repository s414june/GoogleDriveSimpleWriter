import type { AuthSession, DriveFolder, VaultNode } from "../types"
import {
	downloadMarkdown,
	listChildFolders,
	listMarkdownFilesInFolder,
} from "./driveService"
import { vaultRepository } from "./vaultRepository"

function now(): number {
	return Date.now()
}

function makeLocalId(): string {
	return `local-${crypto.randomUUID()}`
}

async function walkDriveFolder(
	session: AuthSession,
	rootId: string,
	driveFolderId: string,
	parentNodeId: string,
	nodes: VaultNode[],
): Promise<void> {
	const [folders, files] = await Promise.all([
		listChildFolders(session.accessToken, driveFolderId),
		listMarkdownFilesInFolder(session.accessToken, driveFolderId),
	])

	for (const folder of folders) {
		nodes.push({
			id: folder.id,
			rootId,
			parentId: parentNodeId,
			kind: "folder",
			name: folder.name,
			driveId: folder.id,
			dirty: false,
			updatedAt: now(),
		})

		await walkDriveFolder(session, rootId, folder.id, folder.id, nodes)
	}

	for (const file of files) {
		const content = await downloadMarkdown(session.accessToken, file.id)
		nodes.push({
			id: file.id,
			rootId,
			parentId: parentNodeId,
			kind: "file",
			name: file.name,
			content,
			driveId: file.id,
			dirty: false,
			updatedAt: now(),
		})
	}
}

function collectDescendants(all: VaultNode[], id: string): string[] {
	const targets = new Set<string>([id])
	let changed = true

	while (changed) {
		changed = false
		for (const node of all) {
			if (
				node.parentId &&
				targets.has(node.parentId) &&
				!targets.has(node.id)
			) {
				targets.add(node.id)
				changed = true
			}
		}
	}

	return Array.from(targets)
}

export async function importDriveRootToVault(
	session: AuthSession,
	rootFolder: DriveFolder,
): Promise<void> {
	const rootNode: VaultNode = {
		id: rootFolder.id,
		rootId: rootFolder.id,
		parentId: null,
		kind: "folder",
		name: rootFolder.name,
		driveId: rootFolder.id,
		dirty: false,
		updatedAt: now(),
	}

	const nodes: VaultNode[] = [rootNode]
	await walkDriveFolder(
		session,
		rootFolder.id,
		rootFolder.id,
		rootFolder.id,
		nodes,
	)
	await vaultRepository.replaceRoot(rootFolder.id, nodes)
}

export async function getVaultNodes(rootId: string): Promise<VaultNode[]> {
	return vaultRepository.listByRoot(rootId)
}

export async function createFolderNode(
	rootId: string,
	parentId: string,
	name: string,
): Promise<VaultNode> {
	const node: VaultNode = {
		id: makeLocalId(),
		rootId,
		parentId,
		kind: "folder",
		name,
		dirty: true,
		updatedAt: now(),
	}

	await vaultRepository.upsert(node)
	return node
}

export async function createMarkdownNode(
	rootId: string,
	parentId: string,
	name: string,
): Promise<VaultNode> {
	const normalizedName = name.endsWith(".md") ? name : `${name}.md`
	const node: VaultNode = {
		id: makeLocalId(),
		rootId,
		parentId,
		kind: "file",
		name: normalizedName,
		content: "",
		dirty: true,
		updatedAt: now(),
	}

	await vaultRepository.upsert(node)
	return node
}

export async function renameNode(id: string, nextName: string): Promise<void> {
	const current = await vaultRepository.getById(id)
	if (!current) {
		throw new Error("找不到節點")
	}

	await vaultRepository.upsert({
		...current,
		name:
			current.kind === "file" && !nextName.endsWith(".md")
				? `${nextName}.md`
				: nextName,
		dirty: true,
		updatedAt: now(),
	})
}

export async function updateMarkdownNode(
	id: string,
	content: string,
): Promise<void> {
	const current = await vaultRepository.getById(id)
	if (!current || current.kind !== "file") {
		throw new Error("找不到 Markdown 檔")
	}

	await vaultRepository.upsert({
		...current,
		content,
		dirty: true,
		updatedAt: now(),
	})
}

export async function deleteNode(rootId: string, id: string): Promise<void> {
	const all = await vaultRepository.listByRoot(rootId)
	const ids = collectDescendants(all, id)
	await vaultRepository.deleteByIds(ids)
}

import type { AuthSession, NoteRecord, SyncSummary } from "../types"
import {
	downloadMarkdown,
	listMarkdownFiles,
	uploadMarkdown,
} from "./driveService"
import { notesRepository } from "./notesRepository"

export async function scanFolderToLocal(
	session: AuthSession,
	folderId: string,
): Promise<number> {
	const files = await listMarkdownFiles(session.accessToken, folderId)
	const now = Date.now()

	const notes: NoteRecord[] = []
	for (const file of files) {
		const content = await downloadMarkdown(session.accessToken, file.id)
		notes.push({
			id: file.id,
			driveFileId: file.id,
			folderId,
			name: file.name,
			content,
			updatedAt: now,
			dirty: false,
			lastSyncedAt: now,
		})
	}

	await notesRepository.upsertMany(notes)
	return notes.length
}

export async function saveLocalEdit(
	noteId: string,
	nextContent: string,
): Promise<void> {
	const current = await notesRepository.getById(noteId)
	if (!current) {
		throw new Error("找不到筆記")
	}

	await notesRepository.upsert({
		...current,
		content: nextContent,
		updatedAt: Date.now(),
		dirty: true,
	})
}

export async function syncDirtyToDrive(
	session: AuthSession,
): Promise<SyncSummary> {
	const dirtyNotes = await notesRepository.listDirtyNotes()

	if (!navigator.onLine) {
		return {
			pulled: 0,
			pushed: 0,
			skipped: dirtyNotes.length,
		}
	}

	let pushed = 0
	for (const note of dirtyNotes) {
		await uploadMarkdown(session.accessToken, note.driveFileId, note.content)
		await notesRepository.upsert({
			...note,
			dirty: false,
			lastSyncedAt: Date.now(),
		})
		pushed += 1
	}

	return {
		pulled: 0,
		pushed,
		skipped: 0,
	}
}

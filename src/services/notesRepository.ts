import type { NoteRecord } from "../types"

const DB_NAME = "google-drive-simple-writer"
const STORE_NAME = "notes"
const DB_VERSION = 1

function awaitTransaction(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error)
		tx.onabort = () => reject(tx.error)
	})
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION)

		request.onerror = () => reject(request.error)
		request.onsuccess = () => resolve(request.result)

		request.onupgradeneeded = () => {
			const db = request.result
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const store = db.createObjectStore(STORE_NAME, { keyPath: "id" })
				store.createIndex("folderId", "folderId", { unique: false })
				store.createIndex("dirty", "dirty", { unique: false })
			}
		}
	})
}

function withStore<T>(
	mode: IDBTransactionMode,
	work: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
	return openDb().then(async (db) => {
		const tx = db.transaction(STORE_NAME, mode)
		const store = tx.objectStore(STORE_NAME)

		try {
			const output = await work(store)
			await awaitTransaction(tx)
			return output
		} finally {
			db.close()
		}
	})
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}

function iterateCursor(
	store: IDBObjectStore,
	indexName: string,
	query: IDBValidKey,
): Promise<NoteRecord[]> {
	return new Promise((resolve, reject) => {
		const index = store.index(indexName)
		const request = index.openCursor(IDBKeyRange.only(query))
		const rows: NoteRecord[] = []

		request.onerror = () => reject(request.error)
		request.onsuccess = () => {
			const cursor = request.result
			if (!cursor) {
				resolve(rows)
				return
			}

			rows.push(cursor.value as NoteRecord)
			cursor.continue()
		}
	})
}

function iterateAll(store: IDBObjectStore): Promise<NoteRecord[]> {
	return new Promise((resolve, reject) => {
		const request = store.openCursor()
		const rows: NoteRecord[] = []

		request.onerror = () => reject(request.error)
		request.onsuccess = () => {
			const cursor = request.result
			if (!cursor) {
				resolve(rows)
				return
			}

			rows.push(cursor.value as NoteRecord)
			cursor.continue()
		}
	})
}

function byUpdatedAtDesc(notes: NoteRecord[]): NoteRecord[] {
	return notes.sort((a, b) => b.updatedAt - a.updatedAt)
}

export const notesRepository = {
	async upsert(note: NoteRecord): Promise<void> {
		await withStore("readwrite", async (store) => {
			await requestToPromise(store.put(note))
		})
	},

	async upsertMany(notes: NoteRecord[]): Promise<void> {
		await withStore("readwrite", async (store) => {
			for (const note of notes) {
				await requestToPromise(store.put(note))
			}
		})
	},

	async getById(id: string): Promise<NoteRecord | null> {
		return withStore("readonly", async (store) => {
			const row = await requestToPromise(store.get(id))
			return (row as NoteRecord | undefined) ?? null
		})
	},

	async listByFolder(folderId: string): Promise<NoteRecord[]> {
		return withStore("readonly", async (store) => {
			const rows = await iterateCursor(store, "folderId", folderId)
			return byUpdatedAtDesc(rows)
		})
	},

	async listDirtyNotes(): Promise<NoteRecord[]> {
		return withStore("readonly", async (store) => {
			const rows = await iterateAll(store)
			const dirtyRows = rows.filter((note) => note.dirty)
			return byUpdatedAtDesc(dirtyRows)
		})
	},
}

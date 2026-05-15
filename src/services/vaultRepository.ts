import type { VaultNode } from "../types"

const DB_NAME = "google-drive-simple-writer"
const STORE_NAME = "vault_nodes"
const DB_VERSION = 2

function awaitTransaction(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve()
		tx.onerror = () => reject(tx.error)
		tx.onabort = () => reject(tx.error)
	})
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}

function iterateIndex(
	store: IDBObjectStore,
	indexName: string,
	query: IDBValidKey,
): Promise<VaultNode[]> {
	return new Promise((resolve, reject) => {
		const request = store.index(indexName).openCursor(IDBKeyRange.only(query))
		const rows: VaultNode[] = []

		request.onerror = () => reject(request.error)
		request.onsuccess = () => {
			const cursor = request.result
			if (!cursor) {
				resolve(rows)
				return
			}

			rows.push(cursor.value as VaultNode)
			cursor.continue()
		}
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
				store.createIndex("rootId", "rootId", { unique: false })
				store.createIndex("parentId", "parentId", { unique: false })
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

function byUpdatedAtDesc(rows: VaultNode[]): VaultNode[] {
	return rows.sort((a, b) => b.updatedAt - a.updatedAt)
}

export const vaultRepository = {
	async listByRoot(rootId: string): Promise<VaultNode[]> {
		return withStore("readonly", async (store) => {
			const rows = await iterateIndex(store, "rootId", rootId)
			return byUpdatedAtDesc(rows)
		})
	},

	async getById(id: string): Promise<VaultNode | null> {
		return withStore("readonly", async (store) => {
			const row = await requestToPromise(store.get(id))
			return (row as VaultNode | undefined) ?? null
		})
	},

	async upsert(node: VaultNode): Promise<void> {
		await withStore("readwrite", async (store) => {
			await requestToPromise(store.put(node))
		})
	},

	async upsertMany(nodes: VaultNode[]): Promise<void> {
		await withStore("readwrite", async (store) => {
			for (const node of nodes) {
				await requestToPromise(store.put(node))
			}
		})
	},

	async deleteByIds(ids: string[]): Promise<void> {
		await withStore("readwrite", async (store) => {
			for (const id of ids) {
				await requestToPromise(store.delete(id))
			}
		})
	},

	async replaceRoot(rootId: string, nodes: VaultNode[]): Promise<void> {
		await withStore("readwrite", async (store) => {
			const existing = await iterateIndex(store, "rootId", rootId)
			for (const row of existing) {
				await requestToPromise(store.delete(row.id))
			}
			for (const node of nodes) {
				await requestToPromise(store.put(node))
			}
		})
	},
}

import type { DriveFolder, DriveMarkdownFile } from "../types"

const DRIVE_API = "https://www.googleapis.com/drive/v3"
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"

function authHeaders(accessToken: string): HeadersInit {
	return {
		Authorization: `Bearer ${accessToken}`,
	}
}

async function requestJson<T>(url: string, accessToken: string): Promise<T> {
	const response = await fetch(url, {
		headers: authHeaders(accessToken),
	})

	if (!response.ok) {
		const message = await response.text()
		throw new Error(`Drive API 失敗: ${response.status} ${message}`)
	}

	return response.json() as Promise<T>
}

export async function listMarkdownFiles(
	accessToken: string,
	folderId: string,
): Promise<DriveMarkdownFile[]> {
	const query = encodeURIComponent(
		`'${folderId}' in parents and trashed = false and mimeType = 'text/markdown'`,
	)
	const fields = encodeURIComponent("files(id,name,modifiedTime)")
	const url = `${DRIVE_API}/files?q=${query}&fields=${fields}`

	const data = await requestJson<{ files?: DriveMarkdownFile[] }>(
		url,
		accessToken,
	)
	return data.files ?? []
}

export async function listDriveFolders(
	accessToken: string,
): Promise<DriveFolder[]> {
	const query = encodeURIComponent(
		"mimeType = 'application/vnd.google-apps.folder' and trashed = false and 'me' in owners",
	)
	const fields = encodeURIComponent("files(id,name)")
	const orderBy = encodeURIComponent("name_natural")
	const url = `${DRIVE_API}/files?q=${query}&fields=${fields}&orderBy=${orderBy}&pageSize=100`

	const data = await requestJson<{ files?: DriveFolder[] }>(url, accessToken)
	return data.files ?? []
}

export async function listChildFolders(
	accessToken: string,
	parentId: string,
): Promise<DriveFolder[]> {
	const query = encodeURIComponent(
		`'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
	)
	const fields = encodeURIComponent("files(id,name)")
	const orderBy = encodeURIComponent("name_natural")
	const url = `${DRIVE_API}/files?q=${query}&fields=${fields}&orderBy=${orderBy}&pageSize=100`

	const data = await requestJson<{ files?: DriveFolder[] }>(url, accessToken)
	return data.files ?? []
}

export async function listMarkdownFilesInFolder(
	accessToken: string,
	parentId: string,
): Promise<DriveMarkdownFile[]> {
	const query = encodeURIComponent(
		`'${parentId}' in parents and trashed = false and (mimeType = 'text/markdown' or (mimeType = 'text/plain' and name contains '.md'))`,
	)
	const fields = encodeURIComponent("files(id,name,modifiedTime)")
	const orderBy = encodeURIComponent("name_natural")
	const url = `${DRIVE_API}/files?q=${query}&fields=${fields}&orderBy=${orderBy}&pageSize=100`

	const data = await requestJson<{ files?: DriveMarkdownFile[] }>(
		url,
		accessToken,
	)
	return data.files ?? []
}

export async function downloadMarkdown(
	accessToken: string,
	fileId: string,
): Promise<string> {
	const url = `${DRIVE_API}/files/${fileId}?alt=media`
	const response = await fetch(url, {
		headers: authHeaders(accessToken),
	})

	if (!response.ok) {
		const message = await response.text()
		throw new Error(`下載失敗: ${response.status} ${message}`)
	}

	return response.text()
}

export async function uploadMarkdown(
	accessToken: string,
	fileId: string,
	content: string,
): Promise<void> {
	const url = `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media`
	const response = await fetch(url, {
		method: "PATCH",
		headers: {
			...authHeaders(accessToken),
			"Content-Type": "text/markdown; charset=utf-8",
		},
		body: content,
	})

	if (!response.ok) {
		const message = await response.text()
		throw new Error(`上傳失敗: ${response.status} ${message}`)
	}
}

export async function getDriveFileMetadata(
	accessToken: string,
	fileId: string,
): Promise<DriveMarkdownFile> {
	const fields = encodeURIComponent("id,name,modifiedTime")
	const url = `${DRIVE_API}/files/${fileId}?fields=${fields}`
	return requestJson<DriveMarkdownFile>(url, accessToken)
}

export async function updateDriveFileName(
	accessToken: string,
	fileId: string,
	name: string,
): Promise<void> {
	const url = `${DRIVE_API}/files/${fileId}`
	const response = await fetch(url, {
		method: "PATCH",
		headers: {
			...authHeaders(accessToken),
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ name }),
	})

	if (!response.ok) {
		const message = await response.text()
		throw new Error(`更新名稱失敗: ${response.status} ${message}`)
	}
}

export async function createDriveFolder(
	accessToken: string,
	parentId: string,
	name: string,
): Promise<{ id: string; name: string; modifiedTime: string }> {
	const url = `${DRIVE_API}/files?fields=id,name,modifiedTime`
	const response = await fetch(url, {
		method: "POST",
		headers: {
			...authHeaders(accessToken),
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			name,
			mimeType: "application/vnd.google-apps.folder",
			parents: [parentId],
		}),
	})

	if (!response.ok) {
		const message = await response.text()
		throw new Error(`建立資料夾失敗: ${response.status} ${message}`)
	}

	return response.json() as Promise<{
		id: string
		name: string
		modifiedTime: string
	}>
}

export async function createDriveMarkdownFile(
	accessToken: string,
	parentId: string,
	name: string,
	content: string,
): Promise<DriveMarkdownFile> {
	const normalizedName = name.endsWith(".md") ? name : `${name}.md`
	const metadata = {
		name: normalizedName,
		mimeType: "text/markdown",
		parents: [parentId],
	}
	const boundary = `gdsw-${crypto.randomUUID()}`
	const delimiter = `--${boundary}`
	const closeDelimiter = `--${boundary}--`
	const body =
		`${delimiter}\r\n` +
		"Content-Type: application/json; charset=UTF-8\r\n\r\n" +
		`${JSON.stringify(metadata)}\r\n` +
		`${delimiter}\r\n` +
		"Content-Type: text/markdown; charset=utf-8\r\n\r\n" +
		`${content}\r\n` +
		`${closeDelimiter}`

	const fields = encodeURIComponent("id,name,modifiedTime")
	const url = `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=${fields}`
	const response = await fetch(url, {
		method: "POST",
		headers: {
			...authHeaders(accessToken),
			"Content-Type": `multipart/related; boundary=${boundary}`,
		},
		body,
	})

	if (!response.ok) {
		const message = await response.text()
		throw new Error(`建立 Markdown 檔失敗: ${response.status} ${message}`)
	}

	return response.json() as Promise<DriveMarkdownFile>
}

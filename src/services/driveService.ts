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
		`'${parentId}' in parents and mimeType = 'text/markdown' and trashed = false`,
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

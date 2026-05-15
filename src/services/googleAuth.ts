import type { AuthSession } from "../types"

type TokenResponse = {
	access_token?: string
	expires_in?: number
	error?: string
}

type TokenClientConfig = {
	client_id: string
	scope: string
	callback: (response: TokenResponse) => void
}

type TokenRequestConfig = {
	prompt?: string
}

type TokenClient = {
	requestAccessToken: (options?: TokenRequestConfig) => void
}

type GoogleOAuth2 = {
	initTokenClient: (config: TokenClientConfig) => TokenClient
	revoke: (token: string, done?: () => void) => void
}

type GoogleAccounts = {
	oauth2: GoogleOAuth2
}

declare global {
	interface Window {
		google?: {
			accounts?: GoogleAccounts
		}
	}
}

const GSI_SCRIPT = "https://accounts.google.com/gsi/client"
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"

let sdkReady: Promise<void> | null = null

function loadGsiScript(): Promise<void> {
	if (window.google?.accounts?.oauth2) {
		return Promise.resolve()
	}

	if (sdkReady) {
		return sdkReady
	}

	sdkReady = new Promise((resolve, reject) => {
		const script = document.createElement("script")
		script.src = GSI_SCRIPT
		script.async = true
		script.defer = true
		script.onload = () => resolve()
		script.onerror = () =>
			reject(new Error("Google Identity Services 載入失敗"))
		document.head.appendChild(script)
	})

	return sdkReady
}

export async function signInWithGoogle(clientId: string): Promise<AuthSession> {
	if (!clientId) {
		throw new Error("缺少 VITE_GOOGLE_CLIENT_ID")
	}

	await loadGsiScript()

	return new Promise((resolve, reject) => {
		const oauth2 = window.google?.accounts?.oauth2
		if (!oauth2) {
			reject(new Error("Google OAuth2 初始化失敗"))
			return
		}

		const tokenClient = oauth2.initTokenClient({
			client_id: clientId,
			scope: DRIVE_SCOPE,
			callback: (response) => {
				if (!response.access_token || response.error) {
					reject(new Error(response.error || "Google 登入失敗"))
					return
				}

				const expiresIn = response.expires_in ?? 3600
				resolve({
					accessToken: response.access_token,
					expiresAt: Date.now() + expiresIn * 1000,
				})
			},
		})

		tokenClient.requestAccessToken({ prompt: "consent" })
	})
}

export function signOutGoogle(session: AuthSession | null): void {
	if (!session?.accessToken) {
		return
	}

	window.google?.accounts?.oauth2?.revoke(session.accessToken)
}

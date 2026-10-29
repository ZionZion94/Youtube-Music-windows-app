/**
 * Client de l'API locale exposée par l'application YouTube Music (voir src-tauri/src/api.rs).
 */
const BASE_URL = "http://127.0.0.1:48723";
const HEADERS = { "X-YTMD": "1" };

export type PlayerState = {
	playing: boolean;
	title: string;
	artist: string;
};

export type Command = "toggle" | "next" | "prev";

/** Envoie une commande ; renvoie `false` si l'application n'est pas lancée. */
export async function send(command: Command): Promise<boolean> {
	try {
		const res = await fetch(`${BASE_URL}/${command}`, {
			method: "POST",
			headers: HEADERS,
			signal: AbortSignal.timeout(1500),
		});
		return res.ok;
	} catch {
		return false;
	}
}

/** Lit l'état de lecture ; renvoie `null` si l'application n'est pas lancée. */
export async function getState(): Promise<PlayerState | null> {
	try {
		const res = await fetch(`${BASE_URL}/state`, { headers: HEADERS, signal: AbortSignal.timeout(1500) });
		return res.ok ? ((await res.json()) as PlayerState) : null;
	} catch {
		return null;
	}
}

/**
 * Client de l'API locale exposée par l'application YouTube Music (voir src-tauri/src/api.rs).
 */
import streamDeck from "@elgato/streamdeck";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_PORT = 48723;
const HEADERS = { "X-YTMD": "1" };

/** Fichier où l'application écrit le port qu'elle a pu ouvrir (48723 s'il est libre). */
const PORT_FILE = join(process.env.APPDATA ?? "", "com.zionzion94.ytmusic", "api-port");

export type PlayerState = {
	playing: boolean;
	title: string;
	artist: string;
	/** Volume de 0 à 100 ; `null` tant que le lecteur n'est pas prêt. */
	volume: number | null;
};

export type Command = "toggle" | "next" | "prev" | "volup" | "voldown";

function baseUrl(): string {
	let port = DEFAULT_PORT;
	try {
		const fromFile = Number.parseInt(readFileSync(PORT_FILE, "utf8"), 10);
		if (fromFile > 0 && fromFile < 65536) port = fromFile;
	} catch {
		// Fichier absent (ancienne version de l'application) : port par défaut.
	}
	return `http://127.0.0.1:${port}`;
}

/** Évite de remplir le journal : on n'enregistre une erreur que si elle change. */
let lastError = "";
function logFailure(message: string): void {
	if (message === lastError) return;
	lastError = message;
	streamDeck.logger.warn(`Application YouTube Music injoignable : ${message}`);
}

async function request(path: string, init: RequestInit = {}): Promise<Response | null> {
	const url = `${baseUrl()}${path}`;
	try {
		const res = await fetch(url, { ...init, headers: HEADERS, signal: AbortSignal.timeout(1500) });
		if (!res.ok) {
			logFailure(`${url} → HTTP ${res.status}`);
			return null;
		}
		lastError = "";
		return res;
	} catch (e) {
		const cause = e instanceof Error && e.cause instanceof Error ? ` (${e.cause.message})` : "";
		logFailure(`${url} → ${e instanceof Error ? e.message : String(e)}${cause}`);
		return null;
	}
}

/** Envoie une commande ; renvoie `false` si l'application n'est pas joignable. */
export async function send(command: Command): Promise<boolean> {
	return (await request(`/${command}`, { method: "POST" })) !== null;
}

/** Lit l'état de lecture ; renvoie `null` si l'application n'est pas joignable. */
export async function getState(): Promise<PlayerState | null> {
	const res = await request("/state");
	return res ? ((await res.json()) as PlayerState) : null;
}

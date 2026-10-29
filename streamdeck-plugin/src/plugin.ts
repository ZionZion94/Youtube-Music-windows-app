import streamDeck, { action, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";

import { Command, getState, send } from "./ytmusic";

/** Intervalle de rafraîchissement de l'icône Lecture/Pause. */
const POLL_MS = 1000;

/** Bouton qui envoie une commande à l'application. */
abstract class CommandAction extends SingletonAction {
	protected abstract readonly command: Command;

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		if (!(await send(this.command))) {
			// Application fermée : triangle jaune sur la touche.
			await ev.action.showAlert();
		}
	}
}

@action({ UUID: "com.zionzion94.ytmusic.next" })
class NextAction extends CommandAction {
	protected readonly command = "next";
}

@action({ UUID: "com.zionzion94.ytmusic.previous" })
class PreviousAction extends CommandAction {
	protected readonly command = "prev";
}

/**
 * Lecture / Pause. L'icône suit l'état réel du lecteur :
 * état 0 = en pause (icône ▶), état 1 = en lecture (icône ❚❚).
 */
@action({ UUID: "com.zionzion94.ytmusic.playpause" })
class PlayPauseAction extends CommandAction {
	protected readonly command = "toggle";
	#timer: NodeJS.Timeout | undefined;
	#playing: boolean | undefined;

	override async onWillAppear(): Promise<void> {
		this.#playing = undefined;
		this.#timer ??= setInterval(() => void this.refresh(), POLL_MS);
		await this.refresh();
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		await super.onKeyDown(ev);
		setTimeout(() => void this.refresh(), 300);
	}

	private async refresh(): Promise<void> {
		if (!this.actions.some(() => true)) {
			// Plus aucune touche visible : on arrête d'interroger l'application.
			clearInterval(this.#timer);
			this.#timer = undefined;
			return;
		}
		const state = await getState();
		const playing = state?.playing ?? false;
		if (playing === this.#playing) return;
		this.#playing = playing;
		await Promise.all(
			this.actions.map(async (a) => {
				if (a.isKey()) await a.setState(playing ? 1 : 0);
			}),
		);
	}
}

streamDeck.actions.registerAction(new PlayPauseAction());
streamDeck.actions.registerAction(new NextAction());
streamDeck.actions.registerAction(new PreviousAction());

streamDeck.connect();

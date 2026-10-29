/**
 * Rendu PNG de la touche « Titre en cours » (pochette, dégradé, titre, artiste, badge pause).
 *
 * L'image finale est un simple PNG : c'est le format le plus sûr pour Stream Deck, qui
 * n'affiche pas toujours une image intégrée dans un SVG. Tout est en JavaScript pur
 * (pureimage), sans module natif.
 */
import { existsSync } from "node:fs";
import { PassThrough, Readable } from "node:stream";
import * as PImage from "pureimage";

export const SIZE = 144;
const TEXT_LEFT = 8;
const TITLE_SIZE = 22;
const ARTIST_SIZE = 17;
/** Début et opacité maximale du dégradé sombre sous le texte. */
const SHADE_TOP = 62;
const SHADE_MAX = 0.85;

type Bitmap = ReturnType<typeof PImage.make>;

export type View = {
	title: string;
	artist: string;
	playing: boolean;
	/** Pochette décodée, ou `null` (fond rouge). */
	art: Bitmap | null;
};

/** Polices Windows (et de quoi tester ailleurs). La première trouvée est utilisée. */
const FONT_CANDIDATES = {
	bold: ["C:\\Windows\\Fonts\\segoeuib.ttf", "C:\\Windows\\Fonts\\arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
	regular: ["C:\\Windows\\Fonts\\segoeui.ttf", "C:\\Windows\\Fonts\\arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
};

function loadFont(paths: string[], family: string): boolean {
	const path = paths.find((p) => existsSync(p));
	if (!path) return false;
	PImage.registerFont(path, family).loadSync();
	return true;
}

/** `false` si aucune police n'est disponible : le texte passe alors par le titre natif de Stream Deck. */
export const hasFonts = loadFont(FONT_CANDIDATES.bold, "KeyBold") && loadFont(FONT_CANDIDATES.regular, "KeyRegular");

/** Décode une pochette JPEG ou PNG (reconnue à sa signature) ; `null` pour tout autre format. */
export async function decodeArt(data: Buffer): Promise<Bitmap | null> {
	const isPng = data[0] === 0x89 && data[1] === 0x50;
	const isJpeg = data[0] === 0xff && data[1] === 0xd8;
	if (!isPng && !isJpeg) return null;
	const stream = Readable.from([data]);
	return isPng ? PImage.decodePNGFromStream(stream) : PImage.decodeJPEGFromStream(stream);
}

/** Fond de la touche : pochette (ou rouge), dégradé sombre et badge pause. Ne contient pas le texte. */
export function renderBackground(view: View): Bitmap {
	const img = PImage.make(SIZE, SIZE);
	const ctx = img.getContext("2d");
	if (view.art) {
		ctx.drawImage(view.art, 0, 0, view.art.width, view.art.height, 0, 0, SIZE, SIZE);
	} else {
		ctx.fillStyle = "#cd0028";
		ctx.fillRect(0, 0, SIZE, SIZE);
	}

	// Dégradé vers le noir en bas, pour la lisibilité du texte (calculé pixel par pixel).
	for (let y = SHADE_TOP; y < SIZE; y++) {
		const keep = 1 - (SHADE_MAX * (y - SHADE_TOP)) / (SIZE - 1 - SHADE_TOP);
		for (let x = 0; x < SIZE; x++) {
			const i = (y * SIZE + x) * 4;
			img.data[i] *= keep;
			img.data[i + 1] *= keep;
			img.data[i + 2] *= keep;
		}
	}

	if (!view.playing) {
		ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
		ctx.fillRect(112, 8, 24, 24);
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(118, 13, 4, 14);
		ctx.fillRect(126, 13, 4, 14);
	}
	return img;
}

/** Largeur en pixels du titre, pour savoir s'il faut le faire défiler. */
export function titleWidth(title: string): number {
	if (!hasFonts) return 0;
	const ctx = PImage.make(1, 1).getContext("2d");
	ctx.font = `${TITLE_SIZE}px KeyBold`;
	return ctx.measureText(title).width;
}

/** Image finale en data URL PNG : fond + titre (décalé de `offset` px) + artiste. */
export async function renderKey(background: Bitmap, view: View, offset: number): Promise<string> {
	const img = PImage.make(SIZE, SIZE);
	img.data.set(background.data);
	if (hasFonts) {
		const ctx = img.getContext("2d");
		ctx.fillStyle = "#ffffff";
		ctx.font = `${TITLE_SIZE}px KeyBold`;
		ctx.fillText(view.title, TEXT_LEFT - offset, 112);
		ctx.fillStyle = "#dddddd";
		ctx.font = `${ARTIST_SIZE}px KeyRegular`;
		ctx.fillText(view.artist, TEXT_LEFT, 134);
	}
	return `data:image/png;base64,${(await encodePng(img)).toString("base64")}`;
}

async function encodePng(img: Bitmap): Promise<Buffer> {
	const out = new PassThrough();
	const chunks: Buffer[] = [];
	out.on("data", (c: Buffer) => chunks.push(c));
	await PImage.encodePNGToStream(img, out);
	return Buffer.concat(chunks);
}

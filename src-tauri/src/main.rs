// Pas de console en version release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

const HOME_URL: &str = "https://music.youtube.com/";
const MAIN: &str = "main";
const APP_TITLE: &str = "YouTube Music";
/// Préfixe du titre de document utilisé par inject.js pour publier l'état de lecture.
const STATE_PREFIX: &str = "YTMD:";

/// Script injecté dans la page : contrôles de lecture + petites améliorations.
const INIT_JS: &str = include_str!("inject.js");

/// Arguments Chromium passés à WebView2.
/// - On garde les valeurs par défaut de Tauri (msWebOOUI, msPdfOOUI, msSmartScreenProtection).
/// - HardwareMediaKeyHandling est désactivé : les touches multimédia sont gérées par
///   l'application elle-même (raccourcis globaux), ce qui évite un double déclenchement.
/// - Translate / fonctionnalités Edge inutiles désactivées pour économiser de la mémoire.
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,\
HardwareMediaKeyHandling,Translate,msEdgeTranslate,msShoppingExp,msEdgeShoppingUI,\
AutofillServerCommunication --disable-component-update --no-first-run";

/// Domaines autorisés à s'afficher dans la fenêtre (YouTube + connexion Google).
/// Tout le reste est ouvert dans le navigateur par défaut.
fn is_internal(url: &Url) -> bool {
    match url.scheme() {
        "about" | "data" | "blob" | "tauri" => return true,
        "https" | "http" => {}
        _ => return false,
    }
    let Some(host) = url.host_str() else { return false };
    host.split('.').any(|label| {
        matches!(
            label,
            "youtube" | "google" | "gstatic" | "googleusercontent" | "ytimg" | "googleapis" | "youtu"
        )
    })
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN)
}

pub(crate) fn run_js(app: &AppHandle, action: &str) {
    if let Some(win) = main_window(app) {
        let _ = win.eval(&format!("window.__ytmd && window.__ytmd('{action}')"));
    }
}

fn show_window(app: &AppHandle) {
    if let Some(win) = main_window(app) {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
        set_low_memory(&win, false);
    }
}

fn hide_window(win: &WebviewWindow) {
    let _ = win.hide();
    set_low_memory(win, true);
}

fn toggle_window(app: &AppHandle) {
    if let Some(win) = main_window(app) {
        if win.is_visible().unwrap_or(false) && !win.is_minimized().unwrap_or(false) {
            hide_window(&win);
        } else {
            show_window(app);
        }
    }
}

fn quit(app: &AppHandle) {
    let _ = app.save_window_state(StateFlags::all() - StateFlags::VISIBLE);
    app.exit(0);
}

/// Demande à WebView2 de réduire sa consommation mémoire quand la fenêtre
/// n'est pas visible (la musique continue de jouer).
#[cfg(windows)]
fn set_low_memory(win: &WebviewWindow, low: bool) {
    let _ = win.with_webview(move |webview| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
        };
        use windows_core::Interface;

        let level = if low {
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
        } else {
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
        };
        if let Ok(core) = webview.controller().CoreWebView2() {
            if let Ok(core19) = core.cast::<ICoreWebView2_19>() {
                let _ = core19.SetMemoryUsageTargetLevel(level);
            }
        }
    });
}

#[cfg(not(windows))]
fn set_low_memory(_win: &WebviewWindow, _low: bool) {}

/// Reçoit l'état publié par la page : le garde pour le Stream Deck et affiche
/// le titre en cours dans la barre des tâches et l'infobulle de l'icône.
fn on_player_state(app: &AppHandle, win: &WebviewWindow, json: &str) {
    let Ok(state) = serde_json::from_str::<serde_json::Value>(json) else { return };
    api::set_state(json);

    let title = state["title"].as_str().unwrap_or("");
    let artist = state["artist"].as_str().unwrap_or("");
    let label = match (title.is_empty(), artist.is_empty()) {
        (true, _) => APP_TITLE.to_string(),
        (false, true) => title.to_string(),
        (false, false) => format!("{title} — {artist}"),
    };
    let _ = win.set_title(&label);
    if let Some(tray) = app.tray_by_id("tray") {
        // L'infobulle Windows est limitée à 127 caractères.
        let tooltip: String = label.chars().take(120).collect();
        let _ = tray.set_tooltip(Some(tooltip));
    }
}

fn create_main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let handle = app.clone();
    let win = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::External(HOME_URL.parse().unwrap()))
        .title(APP_TITLE)
        .inner_size(1280.0, 800.0)
        .min_inner_size(420.0, 320.0)
        .center()
        .visible(false)
        .additional_browser_args(BROWSER_ARGS)
        .initialization_script(INIT_JS)
        .on_document_title_changed(|win, title| {
            if let Some(json) = title.strip_prefix(STATE_PREFIX) {
                on_player_state(win.app_handle(), &win, json);
            }
        })
        .on_navigation(move |url| {
            if is_internal(url) {
                true
            } else {
                let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                false
            }
        })
        .build()?;

    let win_for_events = win.clone();
    win.on_window_event(move |event| match event {
        // Fermer la fenêtre = la cacher dans la zone de notification.
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            hide_window(&win_for_events);
        }
        WindowEvent::Resized(_) => {
            let minimized = win_for_events.is_minimized().unwrap_or(false);
            set_low_memory(&win_for_events, minimized);
        }
        WindowEvent::Focused(true) => set_low_memory(&win_for_events, false),
        _ => {}
    });

    win.show()?;
    Ok(win)
}

fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let play = MenuItem::with_id(app, "play", "Lecture / Pause", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "Titre suivant", true, None::<&str>)?;
    let prev = MenuItem::with_id(app, "prev", "Titre précédent", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Afficher / Masquer", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&play, &prev, &next, &sep1, &show, &sep2, &quit_item])?;

    TrayIconBuilder::with_id("tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip(APP_TITLE)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "play" => run_js(app, "toggle"),
            "next" => run_js(app, "next"),
            "prev" => run_js(app, "prev"),
            "show" => toggle_window(app),
            "quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn register_media_keys(app: &AppHandle) {
    for code in [
        Code::MediaPlayPause,
        Code::MediaTrackNext,
        Code::MediaTrackPrevious,
        Code::MediaStop,
    ] {
        // Si une autre application possède déjà la touche, on l'ignore simplement.
        let _ = app.global_shortcut().register(Shortcut::new(None, code));
    }
}

fn main() {
    tauri::Builder::default()
        // Doit être le premier plugin : relancer l'app ramène la fenêtre existante.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_window(app);
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() - StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    match shortcut.key {
                        Code::MediaPlayPause => run_js(app, "toggle"),
                        Code::MediaTrackNext => run_js(app, "next"),
                        Code::MediaTrackPrevious => run_js(app, "prev"),
                        Code::MediaStop => run_js(app, "pause"),
                        _ => {}
                    }
                })
                .build(),
        )
        .setup(|app| {
            let handle = app.handle();
            create_main_window(handle)?;
            create_tray(handle)?;
            register_media_keys(handle);
            api::start(handle.clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erreur au lancement de YouTube Music");
}

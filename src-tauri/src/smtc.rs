//! Intégration au panneau multimédia de Windows (SystemMediaTransportControls) :
//! titre, artiste et pochette s'affichent dans la fenêtre de contrôle du volume,
//! et ses boutons ⏮ ⏯ ⏭ pilotent la lecture.

use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, WebviewWindow};
use windows::core::HSTRING;
use windows::Foundation::{TypedEventHandler, Uri};
use windows::Media::{
    MediaPlaybackStatus, MediaPlaybackType, SystemMediaTransportControls,
    SystemMediaTransportControlsButton, SystemMediaTransportControlsButtonPressedEventArgs,
};
use windows::Storage::Streams::RandomAccessStreamReference;
use windows::Win32::System::WinRT::ISystemMediaTransportControlsInterop;

struct Smtc {
    controls: SystemMediaTransportControls,
    /// Dernier (titre, artiste, pochette) affiché, pour ne mettre à jour qu'en cas de changement.
    shown: Mutex<(String, String, String)>,
}

static SMTC: OnceLock<Smtc> = OnceLock::new();

pub fn init(app: &AppHandle, win: &WebviewWindow) -> windows::core::Result<()> {
    let hwnd = win.hwnd().map_err(|_| windows::core::Error::empty())?;
    let interop = windows::core::factory::<SystemMediaTransportControls, ISystemMediaTransportControlsInterop>()?;
    let controls: SystemMediaTransportControls = unsafe { interop.GetForWindow(hwnd)? };

    controls.SetIsPlayEnabled(true)?;
    controls.SetIsPauseEnabled(true)?;
    controls.SetIsStopEnabled(true)?;
    controls.SetIsNextEnabled(true)?;
    controls.SetIsPreviousEnabled(true)?;
    // Caché tant qu'aucun titre n'est chargé.
    controls.SetIsEnabled(false)?;

    let app = app.clone();
    controls.ButtonPressed(&TypedEventHandler::<
        SystemMediaTransportControls,
        SystemMediaTransportControlsButtonPressedEventArgs,
    >::new(move |_, args| {
        if let Some(args) = args.as_ref() {
            let action = match args.Button()? {
                SystemMediaTransportControlsButton::Play => "play",
                SystemMediaTransportControlsButton::Pause | SystemMediaTransportControlsButton::Stop => "pause",
                SystemMediaTransportControlsButton::Next => "next",
                SystemMediaTransportControlsButton::Previous => "prev",
                _ => return Ok(()),
            };
            crate::run_js(&app, action);
        }
        Ok(())
    }))?;

    let _ = SMTC.set(Smtc { controls, shown: Mutex::new(Default::default()) });
    Ok(())
}

/// Met à jour le panneau avec l'état publié par la page.
pub fn update(playing: bool, title: &str, artist: &str, art: &str) {
    let Some(smtc) = SMTC.get() else { return };
    let _ = (|| -> windows::core::Result<()> {
        let controls = &smtc.controls;
        if title.is_empty() {
            return controls.SetIsEnabled(false);
        }
        controls.SetIsEnabled(true)?;
        controls.SetPlaybackStatus(if playing {
            MediaPlaybackStatus::Playing
        } else {
            MediaPlaybackStatus::Paused
        })?;

        let mut shown = smtc.shown.lock().unwrap();
        if shown.0 == title && shown.1 == artist && shown.2 == art {
            return Ok(());
        }
        *shown = (title.to_string(), artist.to_string(), art.to_string());

        let updater = controls.DisplayUpdater()?;
        updater.SetType(MediaPlaybackType::Music)?;
        let music = updater.MusicProperties()?;
        music.SetTitle(&HSTRING::from(title))?;
        music.SetArtist(&HSTRING::from(artist))?;
        if art.starts_with("https://") {
            let uri = Uri::CreateUri(&HSTRING::from(art))?;
            updater.SetThumbnail(&RandomAccessStreamReference::CreateFromUri(&uri)?)?;
        } else {
            updater.SetThumbnail(None)?;
        }
        updater.Update()
    })();
}

use std::fs;
use std::path::Path;

const PLACEHOLDER_ICON: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 32, 0, 0,
    0, 32, 8, 6, 0, 0, 0, 115, 122, 122, 244, 0, 0, 0, 52, 73, 68, 65, 84, 120, 156,
    237, 206, 49, 13, 0, 48, 12, 4, 177, 79, 9, 84, 234, 16, 254, 76, 27, 24, 89, 124,
    4, 206, 117, 95, 255, 44, 118, 54, 231, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 73, 50, 151, 170, 1, 118, 78, 165, 48, 85, 0, 0, 0, 0, 73, 69, 78, 68, 174,
    66, 96, 130,
];

fn ensure_placeholder_icons() {
    let icon_dir = Path::new("icons");
    fs::create_dir_all(icon_dir).expect("failed to create Tauri icon directory");

    let png = icon_dir.join("icon.png");
    if !png.exists() {
        fs::write(&png, PLACEHOLDER_ICON).expect("failed to write placeholder Tauri PNG icon");
    }

    // On Windows tauri-build embeds `icons/icon.ico` into the executable resource.
    // Generate it from the PNG when the repository does not yet have final branding.
    #[cfg(target_os = "windows")]
    {
        let ico = icon_dir.join("icon.ico");
        if !ico.exists() {
            let status = std::process::Command::new("powershell")
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    "$png=[IO.File]::ReadAllBytes('icons/icon.png'); $fs=[IO.File]::Create('icons/icon.ico'); $bw=New-Object IO.BinaryWriter($fs); $bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]1); $bw.Write([Byte]32); $bw.Write([Byte]32); $bw.Write([Byte]0); $bw.Write([Byte]0); $bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]$png.Length); $bw.Write([UInt32]22); $bw.Write($png); $bw.Close(); $fs.Close()",
                ])
                .status()
                .expect("failed to invoke PowerShell to generate Tauri ICO icon");
            assert!(status.success(), "failed to generate Tauri ICO icon");
        }
    }
}

fn main() {
    ensure_placeholder_icons();
    tauri_build::build()
}

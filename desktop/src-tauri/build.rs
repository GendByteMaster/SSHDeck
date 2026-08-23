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

fn ensure_placeholder_icon() {
    let icon = Path::new("icons/icon.png");
    if icon.exists() {
        return;
    }

    if let Some(parent) = icon.parent() {
        fs::create_dir_all(parent).expect("failed to create Tauri icon directory");
    }
    fs::write(icon, PLACEHOLDER_ICON).expect("failed to write placeholder Tauri icon");
}

fn main() {
    ensure_placeholder_icon();
    tauri_build::build()
}

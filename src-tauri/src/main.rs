#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};
use scraper::{Html, Selector};
use reqwest::header::{USER_AGENT, ACCEPT, ACCEPT_LANGUAGE, CACHE_CONTROL, PRAGMA, REFERER};
use regex::Regex;
use std::io::{Write};
use tauri::{Window, Manager};
use futures_util::StreamExt;

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
struct FFLink {
    label: String,
    ff_url: String,
    part_number: i32,
    file_size: String,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "snake_case")]
struct ScrapeResult {
    title: String,
    links: Vec<FFLink>,
}

#[tauri::command]
async fn scrape_game_links(url: String) -> Result<ScrapeResult, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header(USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .header(ACCEPT, "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
        .header(ACCEPT_LANGUAGE, "en-US,en;q=0.9")
        .header(CACHE_CONTROL, "no-cache")
        .header(PRAGMA, "no-cache")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let document = Html::parse_document(&response);
    
    // Selectors
    let title_selector = Selector::parse(".entry-title, h1").unwrap();
    let link_selector = Selector::parse("a").unwrap();
    
    let title = document
        .select(&title_selector)
        .next()
        .map(|el| el.text().collect::<String>().trim().to_string())
        .unwrap_or_else(|| "Unknown Game".to_string());

    let mut ff_links = Vec::new();
    
    for element in document.select(&link_selector) {
        let href = element.value().attr("href").unwrap_or("");
        let text = element.text().collect::<String>().trim().to_string();
        let _parent_text = element.parent().map(|p| p.value().as_element().map(|_| "todo").unwrap_or("")).unwrap_or(""); // Simplified for now
        
        let is_ff_link = href.contains("fuckingfast");
        let is_file_link = href.contains("/file/") || 
                           text.to_lowercase().ends_with(".rar") || 
                           text.to_lowercase().ends_with(".zip") || 
                           text.to_lowercase().contains("part");
        
        let is_label_only = text.to_lowercase() == "fuckingfast" || text.to_lowercase().contains("filehoster");

        if is_ff_link && is_file_link && !is_label_only {
            // Basic size extraction (regex-like logic in Rust)
            let size = if text.contains("GB") || text.contains("MB") {
                text.clone() // Simplified
            } else {
                "".to_string()
            };

            let part_num = if text.to_lowercase().contains("part") {
                // Extract number (simplified)
                0 
            } else {
                0
            };

            ff_links.push(FFLink {
                label: if text.is_empty() { format!("FuckingFast Part {}", ff_links.len() + 1) } else { text },
                ff_url: if href.starts_with("http") { href.to_string() } else { format!("https://fitgirl-repacks.site{}", href) },
                part_number: part_num,
                file_size: size,
            });
        }
    }

    // Deduplicate and Sort
    ff_links.sort_by(|a, b| a.part_number.cmp(&b.part_number));
    
    Ok(ScrapeResult {
        title,
        links: ff_links,
    })
}

#[tauri::command]
async fn resolve_cdn_url(ff_url: String) -> Result<String, String> {
    if ff_url.is_empty() {
        return Err("URL is required".to_string());
    }

    let client = reqwest::Client::new();
    let response = client
        .get(&ff_url)
        .header(USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .header(REFERER, "https://fitgirl-repacks.site/")
        .header(ACCEPT, "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
        .header(ACCEPT_LANGUAGE, "en-US,en;q=0.5")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    // Regex from the reference Python script: r'window\.open\(["\'](https?://[^\s"\'\)]+)'
    let re = Regex::new(r#"window\.open\(["'](https?://[^"']+)"#).unwrap();
    
    if let Some(caps) = re.captures(&response) {
        let dl_url = caps.get(1).map_or("", |m| m.as_str()).to_string();
        return Ok(dl_url);
    }

    // Fallback search for any dl.fuckingfast.co link in the source
    let fallback_re = Regex::new(r#"(https://dl\.fuckingfast\.co/dl/[a-zA-Z0-9_-]+)"#).unwrap();
    if let Some(caps) = fallback_re.captures(&response) {
        return Ok(caps.get(1).map_or("", |m| m.as_str()).to_string());
    }

    Err("Could not find direct download link. Make sure the link is still valid.".to_string())
}

#[derive(Clone, Serialize)]
struct DownloadProgress {
    id: String,
    downloaded: u64,
    total_size: u64,
    speed: f64,
}

#[tauri::command]
async fn download_file(
    window: Window,
    id: String,
    url: String,
    path: String,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let mut response = client
        .get(&url)
        .header(USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let total_size = response
        .content_length()
        .ok_or("Failed to get content length")?;

    let parent = std::path::Path::new(&path).parent().ok_or("Invalid path")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;

    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let start_time = std::time::Instant::now();
    let mut last_emit = std::time::Instant::now();

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        let now = std::time::Instant::now();
        if now.duration_since(last_emit).as_millis() > 200 {
            let elapsed = now.duration_since(start_time).as_secs_f64();
            let speed = if elapsed > 0.0 { downloaded as f64 / elapsed } else { 0.0 };
            
            window.emit("download-progress", DownloadProgress {
                id: id.clone(),
                downloaded,
                total_size,
                speed,
            }).map_err(|e| e.to_string())?;
            last_emit = now;
        }
    }

    window.emit("download-complete", id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn open_folder(path: String) -> Result<(), String> {
    let folder_path = std::path::Path::new(&path);
    
    // Check if it's a file, if so, get the parent folder
    let folder = if folder_path.is_file() {
        folder_path.parent().ok_or("Invalid path")?
    } else {
        folder_path
    };

    if !folder.exists() {
        return Err("Folder does not exist".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            scrape_game_links,
            resolve_cdn_url,
            download_file,
            open_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

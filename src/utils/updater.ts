import axios from "axios";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import pkg from "../../package.json";

const REPO = "CinepolisIndia/print-agent";
const EXE_NAME = "inseat-print-agent.exe";
const CURRENT_VERSION = pkg.version;

// ------------------------------
// MAIN ENTRY
// ------------------------------
export async function runAutoUpdateCheck(logger?: any) {
  try {
    logger?.info("Checking for updates...");

    const release = await getLatestRelease();

    if (!release) {
      logger?.info("No release info found");
      return;
    }

    const latestVersion = release.tag_name.replace("v", "");

    if (latestVersion === CURRENT_VERSION) {
      logger?.info("Agent already up to date");
      return;
    }

    logger?.info(`Update found: ${latestVersion}`);

    const asset = release.assets.find(
      (a: any) => a.name === EXE_NAME
    );

    if (!asset) {
      logger?.error("EXE asset not found in release");
      return;
    }

    await downloadAndUpdate(asset.browser_download_url, logger);

  } catch (err: any) {
    logger?.error("Auto update failed", err.message);
  }
}

// ------------------------------
// FETCH LATEST RELEASE
// ------------------------------
async function getLatestRelease() {
  const url = `https://api.github.com/repos/${REPO}/releases/latest`;

  const res = await axios.get(url, {
    headers: {
      "User-Agent": "print-agent"
    }
  });

  return res.data;
}

// ------------------------------
// DOWNLOAD + UPDATE
// ------------------------------
async function downloadAndUpdate(downloadUrl: string, logger?: any) {
  const exeDir = path.dirname(process.execPath);

  const newExePath = path.join(exeDir, "agent-new.exe");
  const updaterPath = path.join(exeDir, "updater.bat");

  logger?.info("Downloading new version...");

  const writer = fs.createWriteStream(newExePath);

  const response = await axios({
    url: downloadUrl,
    method: "GET",
    responseType: "stream",
  });

  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });

  logger?.info("Download complete");

  createUpdaterScript(updaterPath);

  logger?.info("Launching updater...");

  spawn("cmd", ["/c", updaterPath], {
    cwd: exeDir,
    detached: true,
    stdio: "ignore",
  });

  process.exit(0);
}

// ------------------------------
// UPDATER SCRIPT
// ------------------------------
function createUpdaterScript(updaterPath: string) {

  const script = `
@echo off
timeout /t 2 >nul
taskkill /IM inseat-print-agent.exe /F >nul 2>&1
copy /Y agent-new.exe inseat-print-agent.exe >nul
start inseat-print-agent.exe
del agent-new.exe
del updater.bat
`;

  fs.writeFileSync(updaterPath, script);
}

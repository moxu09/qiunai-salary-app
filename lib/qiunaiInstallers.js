export const QIUNAI_INSTALLER_BUCKET = "qiunai-eip-installers";

export const QIUNAI_INSTALLERS = Object.freeze({
  "macos-arm64": {
    label: "macOS・Apple Silicon",
    description: "適用 M 系列晶片 Mac",
    fileName: "秋奈-EIP-macOS-Apple-Silicon.zip",
    path: "2026-09-23/macos-arm64.zip",
  },
  "macos-x64": {
    label: "macOS・Intel",
    description: "適用 Intel 處理器 Mac",
    fileName: "秋奈-EIP-macOS-Intel.zip",
    path: "2026-09-23/macos-x64.zip",
  },
  "windows-x64": {
    label: "Windows・64 位元",
    description: "適用 Windows x64 電腦",
    fileName: "秋奈-EIP-Windows-x64.zip",
    path: "2026-09-23/windows-x64.zip",
  },
  android: {
    label: "Android",
    description: "解壓後安裝 APK",
    fileName: "秋奈-EIP-Android-安裝包.zip",
    path: "2026-09-23/android.zip",
  },
});

export function getQiunaiInstaller(platform) {
  return Object.hasOwn(QIUNAI_INSTALLERS, platform)
    ? QIUNAI_INSTALLERS[platform]
    : null;
}

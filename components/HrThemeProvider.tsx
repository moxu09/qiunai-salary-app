"use client";
/* eslint-disable @next/next/no-img-element */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Check, MoonStar, Sparkles, Palette } from "lucide-react";

type HrTheme = "qiunai" | "deepnight";
const STORAGE_KEY = "wearestillhere.hr.appearance";
const ThemeContext = createContext<{ theme: HrTheme; setTheme: (theme: HrTheme) => void }>({
  theme: "qiunai", setTheme: () => {},
});

// This preference changes presentation only. Department access and data stay merged.
export default function HrThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<HrTheme>("qiunai");
  useEffect(() => {
    const restore = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        updateTheme(saved === "deepnight" ? "deepnight" : "qiunai");
      } catch { /* Keep the default when browser storage is unavailable. */ }
    };
    restore();
    window.addEventListener("storage", restore);
    return () => window.removeEventListener("storage", restore);
  }, []);
  function setTheme(next: HrTheme) {
    updateTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* The selection still works for this visit. */ }
  }
  return <ThemeContext.Provider value={{ theme, setTheme }}>
    <div className={`hr-theme-root hr-theme-${theme}`}>{children}</div>
  </ThemeContext.Provider>;
}

export function HrThemeArtwork({ theme: selected }: { theme?: HrTheme }) {
  const { theme } = useContext(ThemeContext);
  const current = selected || theme;
  return <div className={`hr-theme-artwork hr-art-${current}`} aria-hidden="true">
    <span className="hr-art-orbit" />
    <Sparkles className="hr-art-sparkle" size={25} />
    {current === "qiunai"
      ? <img src="/brand/xiaonai.png" alt="" width={700} height={700} />
      : <><span className="hr-art-moon" /><img src="/brand/deepnight-gold.png" alt="" width={1200} height={789} /></>}
    <span className="hr-art-star">✦</span>
  </div>;
}

export function HrThemeBanner() {
  const { theme } = useContext(ThemeContext);
  return <div className="hr-theme-banner">
    <div className="hr-theme-banner-copy">
      <span className="hr-theme-kicker">{theme === "qiunai" ? "QIUNAI · A LITTLE JOY EVERY DAY" : "DEEPNIGHT · WE ARE STILL HERE"}</span>
      <h2>{theme === "qiunai" ? "小奈陪你，今天也一起加油！" : "夜再深，這裡總有一盞燈。"}</h2>
      <p>{theme === "qiunai" ? "把日常交給 HR，留一點可愛給自己。" : "在熟悉的星光裡，安心處理每一天的大小事。"}</p>
    </div>
    <HrThemeArtwork />
  </div>;
}

export function HrAppearancePanel() {
  const { theme, setTheme } = useContext(ThemeContext);
  return <section className="hr-card hr-appearance-panel">
    <div className="hr-appearance-heading"><Palette size={22} /><h1>外觀主題</h1></div>
    <p className="hr-note">選一個喜歡的工作空間，套用到整個 HR。兩家店的資料仍會一併顯示。</p>
    <div className="hr-theme-options" role="group" aria-label="選擇 HR 外觀主題">
      {(["qiunai", "deepnight"] as const).map(option => <button
        key={option} type="button" aria-pressed={theme === option}
        onClick={() => setTheme(option)}
        className={`hr-theme-option hr-option-${option}${theme === option ? " is-selected" : ""}`}
      >
        <span className="hr-theme-option-preview"><HrThemeArtwork theme={option} />
          <span className="hr-preview-window"><i /><i /><i /></span>
        </span>
        <span className="hr-theme-option-info">
          <span className="hr-theme-option-title">{option === "qiunai" ? <Sparkles size={19} /> : <MoonStar size={19} />}
            {option === "qiunai" ? "秋奈・小奈的雲朵日常" : "深夜・不關燈的星空"}
          </span>
          <span className="hr-theme-option-description">{option === "qiunai" ? "奶油藍、棉花糖雲朵，還有可愛的小奈。" : "午夜藍、暖金月光，點亮專屬於你的夜。"}</span>
          <span className="hr-theme-option-status">{theme === option ? <><Check size={17} />使用中</> : "套用此主題"}</span>
        </span>
      </button>)}
    </div>
    <p className="hr-note hr-theme-saved" role="status">目前使用：{theme === "qiunai" ? "秋奈" : "深夜"}。這個瀏覽器會記住你的選擇。</p>
  </section>;
}

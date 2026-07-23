"use client";

import type { CSSProperties } from "react";
import { Sparkles } from "lucide-react";
import styles from "./ErpWelcome.module.css";

type Organization = "deepnight" | "qiunai";

const CONTENT = {
  deepnight: {
    eyebrow: "DEEPNIGHT ENTERPRISE RESOURCE PLANNING",
    company: "深夜不關燈陪玩",
    hint: "今晚的營運、訂單與團隊管理，都從這裡開始。",
  },
  qiunai: {
    eyebrow: "QIUNAI ESPORTS ENTERPRISE RESOURCE PLANNING",
    company: "秋奈電競陪玩",
    hint: "讓人事、訂單、簽核與薪資，在同一個節奏裡運作。",
  },
} as const;

const STARS = [
  [7, 14, 1], [16, 76, 0.7], [24, 35, 1.2], [34, 88, 0.8],
  [43, 18, 0.6], [52, 62, 1.1], [62, 31, 0.9], [69, 81, 1.3],
  [78, 12, 0.8], [84, 54, 1], [92, 27, 0.7], [95, 83, 1.2],
];

export default function ErpWelcome({
  organization,
}: {
  organization: Organization;
}) {
  const content = CONTENT[organization];

  return (
    <main
      className={`${styles.stage} ${styles[organization]}`}
      aria-label={`歡迎使用 ${content.company} ERP`}
    >
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.auroraOne} aria-hidden="true" />
      <div className={styles.auroraTwo} aria-hidden="true" />
      <div className={styles.orbit} aria-hidden="true" />
      <div className={styles.stars} aria-hidden="true">
        {STARS.map(([left, top, delay], index) => (
          <span
            key={`${left}-${top}`}
            style={
              {
                "--star-left": `${left}%`,
                "--star-top": `${top}%`,
                "--star-delay": `${delay}s`,
                "--star-size": `${index % 3 === 0 ? 4 : 2}px`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <section className={styles.content}>
        <div className={styles.status}>
          <Sparkles size={15} />
          <span>ERP SYSTEM READY</span>
        </div>
        <p className={styles.eyebrow}>{content.eyebrow}</p>
        <h1 className={styles.title}>
          <span className={styles.welcome}>歡迎使用</span>
          <span className={styles.company}>{content.company}</span>
          <span className={styles.erp}>ERP</span>
        </h1>
        <p className={styles.hint}>{content.hint}</p>
        <div className={styles.guide}>
          <span className={styles.guideLine} />
          <span>請從左側選單開始工作</span>
        </div>
      </section>
    </main>
  );
}

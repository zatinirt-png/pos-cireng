import React from "react";
import logo from "../../assets/cbur-logo.png";

export default function LoadingScreen({
  title = "Memuat…",
  subtitle = "",
  hint = "",
  tone = "primary", // primary | accent | neutral
}) {
  const toneClass =
    tone === "accent" ? "loading--accent" : tone === "neutral" ? "loading--neutral" : "";

  return (
    <div className={`loading-page ${toneClass}`} role="status" aria-live="polite">
      <div className="loading-card">
        <div className="loading-brand">
          <img className="loading-logo" src={logo} alt="CBUR" />
          <div>
            <div className="loading-title">{title}</div>
            {subtitle ? <div className="loading-subtitle">{subtitle}</div> : null}
          </div>
        </div>

        <div className="loading-row">
          <span className="spinner" aria-hidden="true" />
          <div>
            <div className="loading-status-main">Sedang sinkronisasi…</div>
            {hint ? <div className="loading-status-sub">{hint}</div> : null}
          </div>
        </div>

        <div className="loading-tips">
          <div className="loading-tip">• Pastikan koneksi stabil</div>
          <div className="loading-tip">• Jangan tutup tab saat proses berjalan</div>
        </div>
      </div>
    </div>
  );
}

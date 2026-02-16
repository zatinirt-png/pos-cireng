import React from "react";
import { cx } from "./utils";

/**
 * Tabs (pill) ringan.
 * - Gunakan `value` dan `onChange`.
 * - Items: [{ value, label }]
 */
export default function Tabs({ items = [], value, onChange, className }) {
  return (
    <div className={cx("tabs", className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          className="tab"
          role="tab"
          aria-selected={String(value === it.value)}
          onClick={() => onChange?.(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

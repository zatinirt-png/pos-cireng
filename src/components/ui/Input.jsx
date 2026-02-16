import React from "react";
import { cx } from "./utils";

export function Field({ label, hint, error, id, children, className }) {
  return (
    <div className={cx("field", className)}>
      {label ? (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      ) : null}

      {children}

      {error ? <div className="field-error">{error}</div> : null}
      {!error && hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

export default function Input({ label, hint, error, className, id, ...props }) {
  const inputId = id || props.name;
  return (
    <Field label={label} hint={hint} error={error} id={inputId}>
      <input id={inputId} className={cx("input", className)} {...props} />
    </Field>
  );
}

export function Select({ label, hint, error, className, id, children, ...props }) {
  const inputId = id || props.name;
  return (
    <Field label={label} hint={hint} error={error} id={inputId}>
      <select id={inputId} className={cx("input", className)} {...props}>
        {children}
      </select>
    </Field>
  );
}

export function Textarea({ label, hint, error, className, id, ...props }) {
  const inputId = id || props.name;
  return (
    <Field label={label} hint={hint} error={error} id={inputId}>
      <textarea id={inputId} className={cx("input", className)} {...props} />
    </Field>
  );
}

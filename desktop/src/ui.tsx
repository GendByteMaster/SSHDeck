import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { X } from "lucide-react";

export function Button({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  return <button {...props} className={`ds-button ds-button-${variant} ${className}`.trim()} />;
}

export function IconButton({ label, className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return <button {...props} aria-label={label} title={props.title ?? label} className={`ds-icon-button ${className}`.trim()}>{children}</button>;
}

export function Field({ label, hint, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return <label className={`ds-field ${className}`.trim()}><span className="ds-field-label">{label}</span><input {...props} />{hint && <small>{hint}</small>}</label>;
}

export function PanelHeader({ icon, title, action }: { icon?: ReactNode; title: string; action?: ReactNode }) {
  return <div className="ds-panel-header"><div>{icon}<strong>{title}</strong></div>{action}</div>;
}

export function StatusBadge({ tone = "neutral", children }: { tone?: "success" | "warning" | "danger" | "info" | "neutral"; children: ReactNode }) {
  return <span className={`ds-status-badge ds-status-${tone}`}><i />{children}</span>;
}

export function ModalShell({ title, description, children, footer, onClose, className = "" }: { title: string; description?: string; children: ReactNode; footer?: ReactNode; onClose: () => void; className?: string }) {
  return <div className="modal-backdrop"><section className={`modal ds-modal ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title}>
    <header className="ds-modal-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><IconButton label="Close" onClick={onClose}><X size={18} /></IconButton></header>
    <div className="ds-modal-body">{children}</div>
    {footer && <footer className="ds-modal-footer">{footer}</footer>}
  </section></div>;
}

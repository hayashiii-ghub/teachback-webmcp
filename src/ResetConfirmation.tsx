import { useEffect, useRef } from "react";
import { copyFor, type UiLocale } from "./i18n";

export function ResetConfirmation({ locale, open, onCancel, onConfirm }: {
  locale: UiLocale; open: boolean; onCancel(): void; onConfirm(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const copy = copyFor(locale);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog ref={dialogRef} className="reset-dialog" aria-labelledby="reset-heading" aria-describedby="reset-description" onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id="reset-heading">{copy.resetConfirmTitle}</h2>
    <p id="reset-description">{copy.resetConfirmBody}</p>
    <div className="reset-dialog-actions">
      <button type="button" className="secondary-action" onClick={onCancel} autoFocus>{copy.cancel}</button>
      <button type="button" className="primary-action" onClick={onConfirm}>{copy.resetConfirm}</button>
    </div>
  </dialog>;
}

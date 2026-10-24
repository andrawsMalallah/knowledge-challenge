export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}
export interface ConfirmationHandle {
  ask(options: ConfirmationOptions): Promise<boolean>;
  dismiss(): void;
}

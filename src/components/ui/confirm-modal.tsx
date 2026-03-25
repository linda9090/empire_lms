import * as React from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "확인",
  cancelText = "취소",
  isDestructive = true,
  isLoading = false,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        aria-hidden="true"
        onClick={onClose}
      />
      
      <div
        className={cn(
          "relative z-50 w-full max-w-md overflow-hidden rounded-xl bg-card text-left shadow-xl animate-in zoom-in-95 duration-200",
          "sm:my-8 sm:w-full sm:max-w-lg"
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="bg-card px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
          <div className="sm:flex sm:items-start">
            <div
              className={cn(
                "mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full sm:mx-0 sm:h-10 sm:w-10",
                isDestructive ? "bg-destructive/10" : "bg-primary/10"
              )}
            >
              <AlertTriangle
                className={cn("h-6 w-6", isDestructive ? "text-destructive" : "text-primary")}
                aria-hidden="true"
              />
            </div>

            <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
              <h3 className="text-lg font-semibold leading-6 text-foreground" id="modal-title">
                {title}
              </h3>
              <div className="mt-2">
                <p className="text-sm text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-muted px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
          <Button
            type="button"
            variant={isDestructive ? "destructive" : "default"}
            className="w-full sm:ml-3 sm:w-auto"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? "처리 중..." : confirmText}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full sm:mt-0 sm:w-auto"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
        </div>
        
        <button
          type="button"
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">닫기</span>
        </button>
      </div>
    </div>
  );
}

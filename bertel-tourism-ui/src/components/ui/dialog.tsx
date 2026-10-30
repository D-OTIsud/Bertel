'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { recoverEscapedDialogFocus } from './dialog-focus';
import { openDialogLayer, removeDialogLayer } from './dialog-layer';

const OverlayRefContext = React.createContext<React.RefObject<HTMLElement | null> | null>(null);

function Dialog({ children, ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const overlay = React.useRef<HTMLElement | null>(null);
  return <OverlayRefContext.Provider value={overlay}><DialogPrimitive.Root {...props}>{children}</DialogPrimitive.Root></OverlayRefContext.Provider>;
}

function forwardNode<T>(ref: React.ForwardedRef<T>, node: T | null): void | (() => void) {
  if (typeof ref === 'function') return ref(node);
  else if (ref) ref.current = node;
}

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

// Unstyled parts share one focus/dismissal stack while each surface keeps its own CSS.
const DialogPrimitiveOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>((props, ref) => {
  const overlay = React.useContext(OverlayRefContext);
  const handleRef = React.useCallback((node: HTMLDivElement | null) => {
    if (overlay) overlay.current = node;
    const cleanup = forwardNode(ref, node);
    if (!node) return;
    return () => {
      if (overlay?.current === node) overlay.current = null;
      if (typeof cleanup === 'function') cleanup();
      else forwardNode(ref, null);
    };
  }, [overlay, ref]);
  return <DialogPrimitive.Overlay {...props} ref={handleRef} />;
});
DialogPrimitiveOverlay.displayName = DialogPrimitive.Overlay.displayName;
const DialogPrimitiveTitle = DialogPrimitive.Title;
const DialogPrimitiveDescription = DialogPrimitive.Description;
const DialogPrimitiveContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ onKeyDown, onOpenAutoFocus, ...props }, ref) => {
  const overlay = React.useContext(OverlayRefContext);
  const content = React.useRef<HTMLDivElement | null>(null);
  const handleRef = React.useCallback((node: HTMLDivElement | null) => {
    if (content.current && content.current !== node) removeDialogLayer(content.current);
    content.current = node;
    const cleanup = forwardNode(ref, node);
    if (!node) return;
    return () => {
      removeDialogLayer(node);
      if (content.current === node) content.current = null;
      if (typeof cleanup === 'function') cleanup();
      else forwardNode(ref, null);
    };
  }, [ref]);
  return <DialogPrimitive.Content {...props} ref={handleRef} onOpenAutoFocus={(event) => {
    if (content.current) openDialogLayer(content.current, overlay?.current ?? null);
    onOpenAutoFocus?.(event);
  }} onKeyDown={(event) => {
    onKeyDown?.(event);
    recoverEscapedDialogFocus(event);
  }} />;
});
DialogPrimitiveContent.displayName = 'DialogPrimitiveContent';

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitiveOverlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showClose?: boolean;
    overlayClassName?: string;
  }
>(({ className, children, showClose = true, overlayClassName, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay className={overlayClassName} />
    <DialogPrimitiveContent
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid max-h-[calc(100vh-2rem)] w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto border border-border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg',
        className
      )}
      {...props}
    >
      {children}
      {showClose && (
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitiveContent>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 text-center sm:text-left',
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight',
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogClose,
  DialogPrimitiveOverlay,
  DialogPrimitiveContent,
  DialogPrimitiveTitle,
  DialogPrimitiveDescription,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};

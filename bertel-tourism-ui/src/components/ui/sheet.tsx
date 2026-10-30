'use client';

import * as React from 'react';
import {
  Dialog as Sheet,
  DialogPortal as SheetPortal,
  DialogClose as SheetClose,
  DialogPrimitiveOverlay as SheetOverlayPrimitive,
  DialogPrimitiveContent as SheetContentPrimitive,
  DialogPrimitiveTitle as SheetTitlePrimitive,
  DialogPrimitiveDescription as SheetDescriptionPrimitive,
} from './dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetOverlayPrimitive>,
  React.ComponentPropsWithoutRef<typeof SheetOverlayPrimitive>
>(({ className, ...props }, ref) => (
  <SheetOverlayPrimitive
    className={cn(
      'fixed inset-0 z-50 bg-[rgba(24,49,59,0.28)] backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:duration-[160ms] data-[state=closed]:duration-[140ms]',
      className,
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetOverlayPrimitive.displayName;

const sheetVariants = cva(
  'fixed z-50 gap-4 overflow-y-auto border border-border bg-card/95 p-6 text-card-foreground shadow-2xl backdrop-blur-xl transition data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:duration-[280ms] data-[state=closed]:duration-[200ms] data-[state=open]:ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:ease-[cubic-bezier(0.4,0,1,1)]',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 rounded-b-[32px] border-x-0 border-t-0 data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        bottom: 'inset-x-0 bottom-0 rounded-t-[32px] border-x-0 border-b-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 h-full w-3/4 rounded-r-[32px] border-l-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
        right: 'inset-y-0 right-0 h-full w-3/4 rounded-l-[32px] border-r-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  },
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetContentPrimitive>,
    VariantProps<typeof sheetVariants> {
  showClose?: boolean;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetContentPrimitive>,
  SheetContentProps
>(({ side = 'right', className, children, showClose = true, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetContentPrimitive ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
      {children}
      {showClose && (
        <SheetClose className="absolute right-4 top-4 rounded-full bg-background/80 p-2 text-foreground/70 transition-colors hover:bg-background hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </SheetClose>
      )}
    </SheetContentPrimitive>
  </SheetPortal>
));
SheetContent.displayName = SheetContentPrimitive.displayName;

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetTitlePrimitive>,
  React.ComponentPropsWithoutRef<typeof SheetTitlePrimitive>
>(({ className, ...props }, ref) => (
  <SheetTitlePrimitive ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
));
SheetTitle.displayName = SheetTitlePrimitive.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetDescriptionPrimitive>,
  React.ComponentPropsWithoutRef<typeof SheetDescriptionPrimitive>
>(({ className, ...props }, ref) => (
  <SheetDescriptionPrimitive ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
SheetDescription.displayName = SheetDescriptionPrimitive.displayName;

export {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
};

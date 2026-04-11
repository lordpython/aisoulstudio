"use client";

/**
 * ResponsiveModal - Adaptive dialog/drawer
 *
 * Renders a native-feeling bottom sheet (vaul) on mobile and a centered
 * dialog (Radix) on desktop. Provides a single compound-component API so
 * call sites don't need to branch on viewport.
 *
 * Both primitives share the same `glass-panel` aesthetic already used
 * across the project, so the transition between breakpoints is seamless.
 *
 * @example
 * ```tsx
 * <ResponsiveModal open={open} onOpenChange={setOpen}>
 *   <ResponsiveModalContent className="sm:max-w-2xl">
 *     <ResponsiveModalHeader>
 *       <ResponsiveModalTitle>Settings</ResponsiveModalTitle>
 *       <ResponsiveModalDescription>Configure your studio.</ResponsiveModalDescription>
 *     </ResponsiveModalHeader>
 *     <div className="px-6 py-4">...form...</div>
 *     <ResponsiveModalFooter>
 *       <Button onClick={() => setOpen(false)}>Save</Button>
 *     </ResponsiveModalFooter>
 *   </ResponsiveModalContent>
 * </ResponsiveModal>
 * ```
 */

import * as React from "react";

import { useIsMobile } from "@/hooks/useIsMobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface ResponsiveModalContextValue {
  isMobile: boolean;
}

const ResponsiveModalContext =
  React.createContext<ResponsiveModalContextValue | null>(null);

function useResponsiveModalContext(component: string): ResponsiveModalContextValue {
  const context = React.useContext(ResponsiveModalContext);
  if (!context) {
    throw new Error(
      `<${component}> must be rendered inside <ResponsiveModal>.`
    );
  }
  return context;
}

interface ResponsiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function ResponsiveModal({ open, onOpenChange, children }: ResponsiveModalProps) {
  const isMobile = useIsMobile();
  const contextValue = React.useMemo(() => ({ isMobile }), [isMobile]);

  const Root = isMobile ? Drawer : Dialog;

  return (
    <ResponsiveModalContext.Provider value={contextValue}>
      <Root open={open} onOpenChange={onOpenChange}>
        {children}
      </Root>
    </ResponsiveModalContext.Provider>
  );
}

interface ResponsiveModalContentProps extends React.ComponentProps<"div"> {
  /** Extra class applied only on the desktop (Dialog) variant. */
  desktopClassName?: string;
  /** Extra class applied only on the mobile (Drawer) variant. */
  mobileClassName?: string;
}

function ResponsiveModalContent({
  children,
  className,
  desktopClassName,
  mobileClassName,
  ...props
}: ResponsiveModalContentProps) {
  const { isMobile } = useResponsiveModalContext("ResponsiveModalContent");

  if (isMobile) {
    return (
      <DrawerContent className={[className, mobileClassName].filter(Boolean).join(" ")} {...props}>
        {children}
      </DrawerContent>
    );
  }

  return (
    <DialogContent className={[className, desktopClassName].filter(Boolean).join(" ")} {...props}>
      {children}
    </DialogContent>
  );
}

function ResponsiveModalHeader(props: React.ComponentProps<"div">) {
  const { isMobile } = useResponsiveModalContext("ResponsiveModalHeader");
  return isMobile ? <DrawerHeader {...props} /> : <DialogHeader {...props} />;
}

function ResponsiveModalFooter(props: React.ComponentProps<"div">) {
  const { isMobile } = useResponsiveModalContext("ResponsiveModalFooter");
  return isMobile ? <DrawerFooter {...props} /> : <DialogFooter {...props} />;
}

function ResponsiveModalTitle(
  props: React.ComponentProps<typeof DialogTitle>
) {
  const { isMobile } = useResponsiveModalContext("ResponsiveModalTitle");
  return isMobile ? <DrawerTitle {...props} /> : <DialogTitle {...props} />;
}

function ResponsiveModalDescription(
  props: React.ComponentProps<typeof DialogDescription>
) {
  const { isMobile } = useResponsiveModalContext("ResponsiveModalDescription");
  return isMobile ? (
    <DrawerDescription {...props} />
  ) : (
    <DialogDescription {...props} />
  );
}

export {
  ResponsiveModal,
  ResponsiveModalContent,
  ResponsiveModalDescription,
  ResponsiveModalFooter,
  ResponsiveModalHeader,
  ResponsiveModalTitle,
};

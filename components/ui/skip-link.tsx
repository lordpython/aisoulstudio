import * as React from "react"
import { cn } from "@/lib/utils"

interface SkipLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    /**
     * The ID of the element to skip to (without #)
     * @default "main-content"
     */
    targetId?: string
    /**
     * The text to display in the skip link
     */
    children?: React.ReactNode
}

/**
 * SkipLink component for keyboard accessibility.
 * 
 * Allows keyboard users to skip navigation and jump directly to main content.
 * The link is visually hidden until focused, then appears at the top of the viewport.
 * 
 * CSS classes are defined in index.css (.skip-to-content)
 * 
 * @example
 * // In your layout component:
 * <SkipLink />
 * <Header />
 * <main id="main-content">
 *   ...content
 * </main>
 */
function SkipLink({
    targetId = "main-content",
    children,
    className,
    ...props
}: SkipLinkProps) {
    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault()
        const target = document.getElementById(targetId)
        if (target) {
            // Set focus to the target element
            target.setAttribute("tabindex", "-1")
            target.focus()
            // Scroll to the target
            target.scrollIntoView({ behavior: "smooth" })
            // Remove tabindex after focus to maintain normal tab order
            target.addEventListener(
                "blur",
                () => target.removeAttribute("tabindex"),
                { once: true }
            )
        }
    }

    return (
        <a
            href={`#${targetId}`}
            onClick={handleClick}
            className={cn("skip-to-content", className)}
            {...props}
        >
            {children || "Skip to main content"}
        </a>
    )
}

export { SkipLink }

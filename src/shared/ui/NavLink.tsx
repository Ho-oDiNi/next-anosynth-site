import { forwardRef } from "react";
import { NavLink as RouterNavLink, type NavLinkProps } from "react-router-dom";

import { cn } from "@/shared/lib/cn";

type NavLinkCompatProps = Omit<NavLinkProps, "className"> & {
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
};

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, pendingClassName, to, ...props }, ref) => {
    return (
      <RouterNavLink
        {...props}
        ref={ref}
        to={to}
        className={({ isActive, isPending }) =>
          cn(
            className,
            isActive && activeClassName,
            isPending && pendingClassName,
          )
        }
      />
    );
  },
);

NavLink.displayName = "NavLink";

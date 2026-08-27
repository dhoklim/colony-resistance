import type { AnchorHTMLAttributes } from "react";

// Pages has no request router. Hash routes survive direct links and refreshes.
export default function PagesLink({
  href,
  prefetch,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  prefetch?: boolean;
}) {
  void prefetch;
  const apiOrigin = import.meta.env.VITE_PUBLIC_API_ORIGIN;
  const target =
    href === "/admin"
      ? `${apiOrigin}/admin`
      : href.startsWith("/")
        ? `${import.meta.env.BASE_URL}#${href}`
        : href;
  return <a {...props} href={target} />;
}

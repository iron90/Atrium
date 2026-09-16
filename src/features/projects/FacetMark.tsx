import { FaDesktop, FaGlobe, FaWindows } from "react-icons/fa6";
import { SiAndroid, SiApple, SiIos, SiLinux, SiMacos } from "react-icons/si";
import type { Facet } from "../../bridge";
import { normalizePlatformKey } from "./facets";

export function PlatformGlyph({ platformKey }: { platformKey: string }) {
  const normalizedKey = normalizePlatformKey(platformKey);
  const props = {
    className: "platform-mark-icon",
    "aria-hidden": true,
    "data-platform-glyph": normalizedKey,
  };

  switch (normalizedKey) {
    case "android":
      return <SiAndroid {...props} />;
    case "apple":
      return <SiApple {...props} />;
    case "ios":
      return <SiIos {...props} />;
    case "ipad":
    case "ipados":
      return (
        <span
          className="platform-wordmark"
          aria-hidden="true"
          data-platform-glyph={normalizedKey}
        >
          iPadOS
        </span>
      );
    case "linux":
      return <SiLinux {...props} />;
    case "macos":
      return <SiMacos {...props} />;
    case "web":
      return <FaGlobe {...props} />;
    case "windows":
      return <FaWindows {...props} />;
    default:
      return <FaDesktop {...props} />;
  }
}

export function FacetMark({
  facet,
  kind,
}: {
  facet: Facet;
  kind: "platform" | "channel";
}) {
  if (kind === "channel") {
    return <span className={`facet-source source-${facet.source}`} />;
  }

  return (
    <span
      className={`platform-mark source-${facet.source}`}
      data-platform={normalizePlatformKey(facet.key)}
      aria-hidden="true"
    >
      <PlatformGlyph platformKey={facet.key} />
    </span>
  );
}

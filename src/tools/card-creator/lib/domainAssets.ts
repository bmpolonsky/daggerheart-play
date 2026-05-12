import type { DomainTheme } from "@cards/stores/domains";
import { TEMPLATE_REGISTRY } from "@cards/lib/templateRegistry";
import { applyColorTokens, insertSvgMarkup, type SvgTemplate } from "@cards/lib/svgTemplateEngine";
import { normalizeHex, resolveBannerColors } from "@cards/lib/domainThemeUtils";

const DEFAULT_BANNER_SIZE = { width: 300, height: 568 };

const ICON_SIZE_RATIO = 112 / 300;
const SINGLE_ICON_SIZE_RATIO = 135 / 300;
const TOP_ICON_CENTER = { x: 155 / 300, y: 205 / 568 };
const BOTTOM_ICON_CENTER = { x: 155 / 300, y: 355 / 568 };
const SINGLE_ICON_CENTER = { x: 155 / 300, y: 345 / 568 };

const VALID_ICON_PREFIXES = ["data:", "http://", "https://"];

function isValidIcon(icon: string | null): icon is string {
  return Boolean(icon && VALID_ICON_PREFIXES.some((prefix) => icon.startsWith(prefix)));
}

function getTemplateSize(template: SvgTemplate) {
  if (template.size.width && template.size.height) return template.size;
  return DEFAULT_BANNER_SIZE;
}

function buildBannerFromTemplate(
  template: SvgTemplate,
  colors: { primary: string; secondary?: string },
  icons: Array<string | null>
) {
  const { primary, secondary, hasSecondary } = resolveBannerColors(
    colors.primary,
    colors.secondary
  );
  const { width: bannerWidth, height: bannerHeight } = getTemplateSize(template);

  const cleanIcons = icons.filter(isValidIcon);

  let iconMarkup = "";
  const iconSize =
    bannerWidth * (cleanIcons.length === 1 ? SINGLE_ICON_SIZE_RATIO : ICON_SIZE_RATIO);

  if (cleanIcons.length === 1) {
    const centerX = bannerWidth * SINGLE_ICON_CENTER.x;
    const centerY = bannerHeight * SINGLE_ICON_CENTER.y;
    iconMarkup = `<image href="${cleanIcons[0]}" x="${centerX - iconSize / 2}" y="${centerY - iconSize / 2}" width="${iconSize}" height="${iconSize}" preserveAspectRatio="xMidYMid meet" />`;
  } else if (cleanIcons.length >= 2) {
    const topCenterX = bannerWidth * TOP_ICON_CENTER.x;
    const topCenterY = bannerHeight * TOP_ICON_CENTER.y;
    const bottomCenterX = bannerWidth * BOTTOM_ICON_CENTER.x;
    const bottomCenterY = bannerHeight * BOTTOM_ICON_CENTER.y;
    iconMarkup = `
      <image href="${cleanIcons[0]}" x="${topCenterX - iconSize / 2}" y="${topCenterY - iconSize / 2}" width="${iconSize}" height="${iconSize}" preserveAspectRatio="xMidYMid meet" />
      <image href="${cleanIcons[1]}" x="${bottomCenterX - iconSize / 2}" y="${bottomCenterY - iconSize / 2}" width="${iconSize}" height="${iconSize}" preserveAspectRatio="xMidYMid meet" />
    `;
  }

  const colored = hasSecondary
    ? applyColorTokens(template.raw, primary, secondary)
    : applyColorTokens(template.raw, secondary, primary);

  return insertSvgMarkup(colored, iconMarkup);
}

function buildDividerFromTemplate(
  template: SvgTemplate,
  colors: { primary: string; secondary?: string }
) {
  const primary = normalizeHex(colors.primary);
  const secondary = colors.secondary ? normalizeHex(colors.secondary) : primary;
  return applyColorTokens(template.raw, primary, secondary);
}

export function buildDomainBanner(theme: DomainTheme) {
  return buildBannerFromTemplate(TEMPLATE_REGISTRY.bannerDomain, { primary: theme.color }, [
    theme.icon,
  ]);
}

export function buildClassBanner(primary: DomainTheme, secondary: DomainTheme) {
  return buildBannerFromTemplate(
    TEMPLATE_REGISTRY.bannerDomain,
    { primary: primary.color, secondary: secondary.color },
    [primary.icon, secondary.icon]
  );
}

export function buildDomainDivider(theme: DomainTheme) {
  return buildDividerFromTemplate(TEMPLATE_REGISTRY.dividerDomain, { primary: theme.color });
}

export function buildClassDivider(primary: DomainTheme, secondary: DomainTheme) {
  return buildDividerFromTemplate(TEMPLATE_REGISTRY.dividerClass, {
    primary: primary.color,
    secondary: secondary.color,
  });
}

import bannerDomainRaw from "@cards/assets/templates/banner-domain.svg?raw";
import dividerClassRaw from "@cards/assets/templates/divider-class.svg?raw";
import dividerDomainRaw from "@cards/assets/templates/divider-domain.svg?raw";
import { createSvgTemplate } from "@cards/lib/svgTemplateEngine";

const bannerDomain = createSvgTemplate(bannerDomainRaw);
const dividerClass = createSvgTemplate(dividerClassRaw, { removeText: true });
const dividerDomain = createSvgTemplate(dividerDomainRaw, { removeText: true });

export const TEMPLATE_REGISTRY = {
  bannerDomain,
  dividerClass,
  dividerDomain,
} as const;

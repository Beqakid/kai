export interface KaiWebsiteBuilderAnswers {
  businessName?: string;
  businessType?: string;
  products?: string[];
  services?: string[];
  location?: string;
  serviceArea?: string;
  contactInfo?: string;
  hasLogo?: boolean;
  preferredBrandingColors?: string[];
  openingHours?: string;
  deliveryOptions?: string;
  businessStory?: string;
  preferredCustomerAction?: string;
}

export interface KaiWebsiteDraft {
  businessName: string;
  businessType: string;
  tagline: string;
  about: string;
  products: string[];
  services: string[];
  contactInfo: string;
  ctaStyle: string;
  seo: {
    title: string;
    description: string;
  };
  branding: {
    suggestedColors: string[];
  };
  logoPrompt?: string;
  suggestedSections: string[];
}

export const websiteBuilderQuestions = [
  "What is your business name?",
  "What type of business do you run?",
  "What products or services do you offer?",
  "Where are you located?",
  "What areas do you serve?",
  "What contact information should customers use?",
  "Do you already have a logo?",
  "What colors or style should the website use?",
  "What are your opening hours?",
  "Do you offer delivery, pickup, booking, or on-site service?",
  "What short story should customers know about your business?",
  "What action should customers take first?",
];

export function generateWebsiteDraftFromAnswers(answers: KaiWebsiteBuilderAnswers): KaiWebsiteDraft {
  const businessName = answers.businessName ?? "Your Business";
  const businessType = answers.businessType ?? "local business";
  const products = answers.products ?? [];
  const services = answers.services ?? [];
  const cta = answers.preferredCustomerAction ?? "Request Quote";

  return {
    businessName,
    businessType,
    tagline: `${businessName} helps customers find trusted ${businessType} offerings.`,
    about:
      answers.businessStory ??
      `${businessName} is a ${businessType} serving ${answers.serviceArea ?? answers.location ?? "the local community"}.`,
    products,
    services,
    contactInfo: answers.contactInfo ?? "Add phone, email, WhatsApp, or address.",
    ctaStyle: cta,
    seo: {
      title: `${businessName} | ${businessType}`,
      description: `Learn about ${businessName}, a ${businessType} serving ${answers.serviceArea ?? answers.location ?? "local customers"}.`,
    },
    branding: {
      suggestedColors: answers.preferredBrandingColors?.length
        ? answers.preferredBrandingColors
        : ["#0f766e", "#f8fafc", "#f59e0b"],
    },
    logoPrompt: answers.hasLogo
      ? undefined
      : `Create a simple, trustworthy logo for ${businessName}, a ${businessType}, with a clean local business style.`,
    suggestedSections: ["Hero", "About", "Products", "Services", "Contact", "Call to action"],
  };
}

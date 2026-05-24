export interface KaiWebsiteBuilderAnswers {
  businessModel?: KaiBusinessModel;
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

export type KaiBusinessModel = "product_seller" | "service_provider" | "hybrid";

export interface KaiBusinessModelClassification {
  businessModel: KaiBusinessModel;
  confidence: "explicit" | "inferred";
  reason: string;
  suggestedWorkflowIds: string[];
}

export interface KaiCreativeAssetDraftRequest {
  app: string;
  businessName: string;
  businessModel: KaiBusinessModel;
  assetType: "logo" | "product_image" | "service_banner" | "website_hero" | "social_promo";
  subject?: string;
  brandColors?: string[];
  styleNotes?: string;
}

export interface KaiCreativeAssetDraft {
  id?: string;
  assetType: KaiCreativeAssetDraftRequest["assetType"];
  prompt: string;
  approvalRequired: true;
  phaseBehavior: "draft_only";
  storage: {
    provider: "future_r2";
    saved: false;
  };
}

export interface KaiWebsiteDraft {
  businessName: string;
  businessModel: KaiBusinessModel;
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
  creativeAssetPrompts: KaiCreativeAssetDraft[];
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

export function classifyBusinessModel(input?: string): KaiBusinessModelClassification {
  const value = (input ?? "").toLowerCase();
  const serviceTokens = [
    "service",
    "booking",
    "appointment",
    "repair",
    "clean",
    "care",
    "consult",
    "quote",
    "install",
    "salon",
    "catering",
    "maintenance",
    "training",
    "professional",
  ];
  const productTokens = [
    "product",
    "store",
    "shop",
    "sell",
    "goods",
    "stock",
    "inventory",
    "delivery",
    "pickup",
    "order",
    "restaurant",
    "retail",
    "produce",
    "food",
    "market",
  ];
  const hasService = serviceTokens.some((token) => value.includes(token));
  const hasProduct = productTokens.some((token) => value.includes(token));

  if (value.includes("both") || value.includes("hybrid") || (hasProduct && hasService)) {
    return {
      businessModel: "hybrid",
      confidence: value.includes("both") || value.includes("hybrid") ? "explicit" : "inferred",
      reason: "The business appears to sell products and provide services.",
      suggestedWorkflowIds: ["create_business_profile", "add_product_listing", "add_service_listing", "ai_website_setup"],
    };
  }

  if (hasService) {
    return {
      businessModel: "service_provider",
      confidence: "inferred",
      reason: "The business appears to sell time, skills, bookings, or quote-based work.",
      suggestedWorkflowIds: ["service_provider_onboarding", "create_business_profile", "add_service_listing", "ai_website_setup"],
    };
  }

  return {
    businessModel: "product_seller",
    confidence: hasProduct ? "inferred" : "explicit",
    reason: "The business appears to sell products through a store or marketplace listing flow.",
    suggestedWorkflowIds: ["vendor_onboarding", "create_business_profile", "add_product_listing", "ai_website_setup"],
  };
}

export function createCreativeAssetDraftPrompt(request: KaiCreativeAssetDraftRequest): KaiCreativeAssetDraft {
  const colors = request.brandColors?.length ? ` using ${request.brandColors.join(", ")}` : "";
  const style = request.styleNotes ? ` Style notes: ${request.styleNotes}.` : "";
  const subject = request.subject ? ` for ${request.subject}` : "";
  const modelLabel =
    request.businessModel === "service_provider"
      ? "service business"
      : request.businessModel === "hybrid"
        ? "business selling products and services"
        : "online store";
  const modelArticle = request.businessModel === "product_seller" ? "an" : "a";
  const assetLabels = {
    logo: "a clean, trustworthy logo",
    product_image: "a product image draft",
    service_banner: "a service banner image",
    website_hero: "a website hero image",
    social_promo: "a social media promo image",
  };

  return {
    assetType: request.assetType,
    prompt: `Create ${assetLabels[request.assetType]} for ${request.businessName}, ${modelArticle} ${modelLabel}${subject}${colors}.${style} Keep it clear, commercial, culturally respectful, and ready for user review before use.`,
    approvalRequired: true,
    phaseBehavior: "draft_only",
    storage: {
      provider: "future_r2",
      saved: false,
    },
  };
}

export function generateWebsiteDraftFromAnswers(answers: KaiWebsiteBuilderAnswers): KaiWebsiteDraft {
  const businessName = answers.businessName ?? "Your Business";
  const hasProducts = (answers.products?.length ?? 0) > 0;
  const hasServices = (answers.services?.length ?? 0) > 0;
  const businessModel =
    answers.businessModel ??
    (hasProducts && hasServices
      ? "hybrid"
      : hasServices
        ? "service_provider"
        : classifyBusinessModel(answers.businessType).businessModel);
  const businessType = answers.businessType ?? "local business";
  const products = businessModel === "service_provider" ? [] : (answers.products ?? []);
  const services = businessModel === "product_seller" ? [] : (answers.services ?? []);
  const cta =
    answers.preferredCustomerAction ??
    (businessModel === "product_seller" ? "Order Now" : businessModel === "hybrid" ? "Shop or Request Service" : "Request Quote");
  const brandColors = answers.preferredBrandingColors?.length
    ? answers.preferredBrandingColors
    : ["#0f766e", "#f8fafc", "#f59e0b"];
  const serviceArea = answers.serviceArea ?? answers.location ?? "the local community";
  const topOffering = products[0] ?? services[0] ?? businessType;
  const modelSummary =
    businessModel === "product_seller"
      ? "an online store"
      : businessModel === "service_provider"
        ? "a service provider"
        : "a business offering products and services";
  const creativeAssetPrompts = [
    createCreativeAssetDraftPrompt({
      app: "viliniu",
      businessName,
      businessModel,
      assetType: "logo",
      brandColors,
      styleNotes: businessType,
    }),
    ...(businessModel === "service_provider"
      ? [
          createCreativeAssetDraftPrompt({
            app: "viliniu",
            businessName,
            businessModel,
            assetType: "service_banner" as const,
            subject: services[0] ?? businessType,
            brandColors,
          }),
        ]
      : [
          createCreativeAssetDraftPrompt({
            app: "viliniu",
            businessName,
            businessModel,
            assetType: "product_image" as const,
            subject: products[0] ?? businessType,
            brandColors,
          }),
        ]),
  ];

  return {
    businessName,
    businessModel,
    businessType,
    tagline:
      businessModel === "service_provider"
        ? `Trusted ${businessType} services for customers in ${serviceArea}.`
        : businessModel === "hybrid"
          ? `${businessName} brings ${topOffering} and helpful services together.`
          : `Fresh, simple ways to order ${topOffering} from ${businessName}.`,
    about:
      answers.businessStory ??
      `${businessName} is ${modelSummary} serving ${serviceArea}. Kai prepared this draft so the owner can review the story, offers, contact details, and customer action before anything goes live.`,
    products,
    services,
    contactInfo: answers.contactInfo ?? "Add phone, email, WhatsApp, or address.",
    ctaStyle: cta,
    seo: {
      title: `${businessName} | ${businessType}`,
      description: `${businessName} is a ${businessType} serving ${serviceArea}. Explore ${topOffering}, contact details, and the best next step for customers.`,
    },
    branding: {
      suggestedColors: brandColors,
    },
    logoPrompt: answers.hasLogo
      ? undefined
      : `Create a simple, trustworthy logo for ${businessName}, a ${businessType}, with a clean local business style.`,
    creativeAssetPrompts,
    suggestedSections:
      businessModel === "product_seller"
        ? ["Hero", "About", "Products", "Contact", "Order call to action"]
        : businessModel === "service_provider"
          ? ["Hero", "About", "Services", "Service area", "Contact", "Request quote call to action"]
          : ["Hero", "About", "Products", "Services", "Contact", "Call to action"],
  };
}

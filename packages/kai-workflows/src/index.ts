export interface KaiWorkflowStep {
  id: string;
  title: string;
  prompt?: string;
}

export interface KaiWorkflowDefinition {
  id: string;
  title: string;
  permissions: string[];
  steps: KaiWorkflowStep[];
  completionState: "not_started" | "in_progress" | "completed";
}

export const kaiWorkflowRegistry: KaiWorkflowDefinition[] = [
  {
    id: "vendor_onboarding",
    title: "Vendor onboarding",
    permissions: ["canUseWorkflows"],
    completionState: "not_started",
    steps: [
      { id: "preview", title: "Preview website draft before signup", prompt: "Let Kai create a draft website so the vendor sees value immediately." },
      { id: "account", title: "Create vendor account to save progress", prompt: "Signup saves the draft and opens the setup workspace." },
      { id: "profile", title: "Create vendor profile", prompt: "Collect business identity, contact, location, and delivery basics." },
      { id: "store", title: "Set store basics", prompt: "Let the vendor keep editing while approval is pending." },
      { id: "listings", title: "Add first products or services", prompt: "Products can be drafted and submitted for review before the store is public." },
      { id: "review", title: "Submit for approval before going live", prompt: "Approval gates marketplace visibility, public publishing, orders, payments, and customer contact." },
    ],
  },
  {
    id: "service_provider_onboarding",
    title: "Service provider onboarding",
    permissions: ["canUseWorkflows"],
    completionState: "not_started",
    steps: [
      { id: "profile", title: "Create service profile" },
      { id: "coverage", title: "Set service area" },
      { id: "offerings", title: "Add service listings" },
    ],
  },
  {
    id: "create_business_profile",
    title: "Create business profile",
    permissions: ["canUseWorkflows", "canSuggestFormContent"],
    completionState: "not_started",
    steps: [
      { id: "identity", title: "Business name and type" },
      { id: "contact", title: "Contact information" },
      { id: "brand", title: "Branding and story" },
    ],
  },
  {
    id: "add_product_listing",
    title: "Add product listing",
    permissions: ["canUseWorkflows", "canSuggestFormContent"],
    completionState: "not_started",
    steps: [
      { id: "details", title: "Product details" },
      { id: "pricing", title: "Price and availability" },
      { id: "photos", title: "Photo and description suggestions" },
    ],
  },
  {
    id: "add_service_listing",
    title: "Add service listing",
    permissions: ["canUseWorkflows", "canSuggestFormContent"],
    completionState: "not_started",
    steps: [
      { id: "details", title: "Service details" },
      { id: "area", title: "Location and service area" },
      { id: "cta", title: "Customer action" },
    ],
  },
  {
    id: "ai_website_setup",
    title: "AI website setup workflow",
    permissions: ["canUseWorkflows", "canGenerateWebsiteDraft"],
    completionState: "not_started",
    steps: [
      { id: "business_name", title: "Business name" },
      { id: "business_type", title: "Business type" },
      { id: "offerings", title: "Products and services" },
      { id: "location", title: "Location and service area" },
      { id: "contact", title: "Contact information" },
      { id: "brand", title: "Branding, colors, and logo" },
      { id: "hours", title: "Opening hours" },
      { id: "delivery", title: "Delivery or service options" },
      { id: "story", title: "Short business story" },
      { id: "cta", title: "Preferred customer action" },
      { id: "draft", title: "Generate structured website draft" },
      { id: "save", title: "Create account to save draft" },
      { id: "approval", title: "Approval before public launch" },
    ],
  },
  {
    id: "explain_marketplace_model",
    title: "Explain Viliniu marketplace model",
    permissions: ["canUseWorkflows", "canReadKnowledge"],
    completionState: "not_started",
    steps: [
      { id: "overview", title: "Explain stores, websites, and marketplace discovery" },
      { id: "roles", title: "Explain vendor and service provider roles" },
      { id: "next", title: "Suggest the next setup step" },
    ],
  },
];

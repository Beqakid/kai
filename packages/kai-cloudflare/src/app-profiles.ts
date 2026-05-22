export type KaiEmbedGuideStep = {
  id: string;
  label: string;
  title: string;
  helper: string;
  input: "text" | "textarea" | "choice-text";
  placeholder: string;
  choices?: string[];
  sample: string;
};

export type KaiEmbedAppProfile = {
  app: string;
  platformName: string;
  launchText: string;
  subtitle: string;
  previewTitle: string;
  previewHint: string;
  emptyPreview: string;
  completionTitle: string;
  completionHelper: string;
  saveAction: string;
  signupPath: string;
  finalActionFallback: string;
  finalActionLabel: string;
  setupPathLabel: string;
  offeringsLabel: string;
  previewHeroTemplate: string;
  defaultBusinessModel: "product_seller" | "service_provider" | "hybrid";
  coachMode: "business_setup" | "caregiver_search";
  greeting: {
    en: string;
    es: string;
    fj: string;
  };
  guideSteps: KaiEmbedGuideStep[];
};

const viliniuGuideSteps: KaiEmbedGuideStep[] = [
  {
    id: "businessModel",
    label: "Step 1 of 8",
    title: "Do customers buy products, book services, or both?",
    helper: "This helps me route you into the right setup path.",
    input: "choice-text",
    placeholder: "Products / online store",
    choices: ["Products / online store", "Services / bookings", "Both products and services"],
    sample: "Products / online store",
  },
  {
    id: "businessName",
    label: "Step 2 of 8",
    title: "What is your business called?",
    helper: "I will use this for the website headline, SEO title, and business profile.",
    input: "text",
    placeholder: "Bula Fresh",
    sample: "Bula Fresh",
  },
  {
    id: "businessType",
    label: "Step 3 of 8",
    title: "What type of business is it?",
    helper: "Choose one, or type your own.",
    input: "choice-text",
    placeholder: "Farm produce vendor",
    choices: ["Farm produce vendor", "Restaurant", "Service provider", "Retail shop"],
    sample: "farm produce vendor",
  },
  {
    id: "offerings",
    label: "Step 4 of 8",
    title: "What do you sell or offer?",
    helper: "List products or services. A few words is enough.",
    input: "textarea",
    placeholder: "Fresh vegetables, herbs, weekly produce boxes",
    sample: "Fresh vegetables, herbs, weekly produce boxes",
  },
  {
    id: "location",
    label: "Step 5 of 8",
    title: "Where do you serve customers?",
    helper: "This helps Kai shape local SEO and contact sections.",
    input: "text",
    placeholder: "Suva and nearby communities",
    sample: "Suva and nearby communities",
  },
  {
    id: "contactInfo",
    label: "Step 6 of 8",
    title: "How should customers contact you?",
    helper: "Use phone, email, WhatsApp, or address.",
    input: "text",
    placeholder: "hello@example.com",
    sample: "hello@example.com",
  },
  {
    id: "brand",
    label: "Step 7 of 8",
    title: "What style should the website feel like?",
    helper: "Choose a direction, or type colors.",
    input: "choice-text",
    placeholder: "Green, warm, fresh",
    choices: ["Green and fresh", "Clean and modern", "Warm and local", "Premium and simple"],
    sample: "green, warm, fresh",
  },
  {
    id: "preferredCustomerAction",
    label: "Step 8 of 8",
    title: "What should customers do first?",
    helper: "This becomes the main call-to-action.",
    input: "choice-text",
    placeholder: "Order Now",
    choices: ["Order Now", "Call Us", "WhatsApp Us", "Request Quote"],
    sample: "Order Now",
  },
];

const carehiaGuideSteps: KaiEmbedGuideStep[] = [
  {
    id: "businessModel",
    label: "Step 1 of 8",
    title: "Who are you looking for care for?",
    helper: "This helps me understand whether you are arranging care for yourself or someone else.",
    input: "choice-text",
    placeholder: "My parent",
    choices: ["My parent", "Myself", "My partner", "A family member"],
    sample: "My parent",
  },
  {
    id: "businessName",
    label: "Step 2 of 8",
    title: "What name should we use for this care search?",
    helper: "Use the client name, family name, or a simple label for the search.",
    input: "text",
    placeholder: "Nana's care plan",
    sample: "Nana's care plan",
  },
  {
    id: "businessType",
    label: "Step 3 of 8",
    title: "What type of care are you looking for?",
    helper: "Choose one, or type your own.",
    input: "choice-text",
    placeholder: "Elder care at home",
    choices: ["Elder care at home", "Companionship", "Disability support", "Post-hospital support"],
    sample: "elder care at home",
  },
  {
    id: "offerings",
    label: "Step 4 of 8",
    title: "What help is needed day to day?",
    helper: "List care needs, tasks, or support preferences.",
    input: "textarea",
    placeholder: "Companionship, meal support, medication reminders, transport",
    sample: "Companionship, meal support, medication reminders, transport",
  },
  {
    id: "location",
    label: "Step 5 of 8",
    title: "Where is care needed?",
    helper: "This helps Kai guide location and caregiver availability.",
    input: "text",
    placeholder: "Suva, Nausori, and nearby communities",
    sample: "Suva, Nausori, and nearby communities",
  },
  {
    id: "contactInfo",
    label: "Step 6 of 8",
    title: "When do you need care?",
    helper: "Share schedule, urgency, or preferred days.",
    input: "text",
    placeholder: "Weekday mornings, starting this month",
    sample: "Weekday mornings, starting this month",
  },
  {
    id: "brand",
    label: "Step 7 of 8",
    title: "What kind of caregiver would feel right?",
    helper: "Choose a preference or type what matters most.",
    input: "choice-text",
    placeholder: "Warm, patient, experienced with elder care",
    choices: [
      "Warm and patient",
      "Experienced with elder care",
      "Can help with transport",
      "Female caregiver preferred",
    ],
    sample: "warm, patient, experienced with elder care",
  },
  {
    id: "preferredCustomerAction",
    label: "Step 8 of 8",
    title: "What would you like to do next?",
    helper: "This becomes the next recommended Carehia action.",
    input: "choice-text",
    placeholder: "Browse matching caregivers",
    choices: [
      "Browse matching caregivers",
      "Request a care consultation",
      "Save this care search",
      "Ask Kai a question",
    ],
    sample: "Browse matching caregivers",
  },
];

export const kaiEmbedAppProfiles: Record<string, KaiEmbedAppProfile> = {
  viliniu: {
    app: "viliniu",
    platformName: "Viliniu",
    launchText: "Start with Kai",
    subtitle: "Personal setup assistant",
    previewTitle: "Website preview",
    previewHint: "Kai builds this as you answer.",
    emptyPreview: "Your draft website will appear here. Use the sample to see the flow fast.",
    completionTitle: "Your website preview is ready.",
    completionHelper:
      "Create a vendor account to save it. Approval is only needed before public launch, orders, and payments.",
    saveAction: "Create account to save",
    signupPath: "https://vendor.viliniu.com/register",
    finalActionFallback: "Request Quote",
    finalActionLabel: "Main action",
    setupPathLabel: "Setup path",
    offeringsLabel: "Products and services",
    previewHeroTemplate: "helps customers find trusted",
    defaultBusinessModel: "product_seller",
    coachMode: "business_setup",
    greeting: {
      en: "Hi, I'm Kai. I can help you set up your business profile, build your Viliniu website, add products or services, and guide you through the platform.",
      es: "Hola, soy Kai. Puedo ayudarte a configurar tu perfil de negocio, crear tu sitio de Viliniu, agregar productos o servicios y guiarte por la plataforma.",
      fj: "Bula, o yau o Kai. Au rawa ni vukei iko mo vakarautaka na nomu itukutuku ni bisinisi, tara na nomu website ni Viliniu, kuria na iyaya se veiqaravi, ka dusimaki iko ena platform.",
    },
    guideSteps: viliniuGuideSteps,
  },
  carehia: {
    app: "carehia",
    platformName: "Carehia",
    launchText: "Find care with Kai",
    subtitle: "Carehia onboarding assistant",
    previewTitle: "Care match preview",
    previewHint: "Kai builds this as you answer.",
    emptyPreview: "Your caregiver search plan will appear here. Use the sample to see the flow fast.",
    completionTitle: "Your caregiver search preview is ready.",
    completionHelper:
      "Use this demo to show how Kai helps families understand care needs and start looking for caregivers. Kai guides setup only; final caregiver decisions stay with the family and Carehia team.",
    saveAction: "Start caregiver search",
    signupPath: "/kai-demo",
    finalActionFallback: "Find Caregivers",
    finalActionLabel: "Next step",
    setupPathLabel: "Care goal",
    offeringsLabel: "Care needs",
    previewHeroTemplate: "Kai is helping prepare a caregiver search for",
    defaultBusinessModel: "service_provider",
    coachMode: "caregiver_search",
    greeting: {
      en: "Hi, I'm Kai. I can help you understand Carehia, describe the care you need, and guide you toward finding suitable caregivers.",
      es: "Hola, soy Kai. Puedo ayudarte a entender Carehia, describir el cuidado que necesitas y guiarte para encontrar cuidadores adecuados.",
      fj: "Bula, o yau o Kai. Au rawa ni vukei iko mo kila na Carehia, tukuna na veivuke ni care o gadreva, ka dusimaki iko mo kunea na caregivers veiganiti.",
    },
    guideSteps: carehiaGuideSteps,
  },
};

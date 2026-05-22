# Kai App Profile Adapters

Kai is designed to plug into many products without becoming hardcoded to one product.

The embed script reads `data-app` from the host page:

```html
<script
  src="https://kai.jjioji.workers.dev/embed/kai.js"
  data-app="carehia"
  data-user-role="visitor"
  defer
></script>
```

The Worker then loads the matching profile from `packages/kai-cloudflare/src/app-profiles.ts`.

## Current Profiles

### Viliniu

Mode: `business_setup`

Kai helps vendors:

- understand Viliniu
- create a business profile
- choose product, service, or hybrid setup
- generate a website draft
- continue into vendor onboarding

### Carehia

Mode: `caregiver_search`

Kai helps care seekers:

- explain who needs care
- describe daily care needs
- give location and timing
- capture caregiver preferences
- prepare a caregiver-search preview

Kai must not make medical decisions, approve caregivers, or replace professional judgement.

## Adding Another App

Add a new entry to `kaiEmbedAppProfiles`:

```ts
newapp: {
  app: "newapp",
  platformName: "New App",
  coachMode: "business_setup",
  greeting: {
    en: "...",
    es: "...",
    fj: "...",
  },
  guideSteps: [...],
}
```

Then embed Kai with:

```html
<script src="https://kai.jjioji.workers.dev/embed/kai.js" data-app="newapp" defer></script>
```

## Future Adapter Layers

This profile module is the first adapter layer. Future phases should expand each app profile with:

- knowledge source IDs
- workflow IDs
- allowed actions
- role permissions
- escalation rules
- audit policies
- app-specific navigation targets
- brand tokens

That keeps Kai reusable while letting each product safely define what Kai is allowed to know, suggest, and do.

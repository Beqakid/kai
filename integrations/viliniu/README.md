# Viliniu Integration

This package is the first app adapter for KAI.

Viliniu-specific knowledge, branding, permissions, and workflow registration live
here instead of inside `@kai/core`.

## Next.js Usage

```tsx
import { KaiWidget } from "@kai/ui";

export function ViliniuLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <KaiWidget app="viliniu" userRole="vendor" />
    </>
  );
}
```

## Server Registration

```ts
import { registerViliniuKai } from "@kai/integration-viliniu";

export const kai = registerViliniuKai({
  userId: "user_123",
  userRole: "vendor",
  language: "en",
});
```

Phase 1 is guide-only. KAI can suggest and draft but cannot publish, submit,
delete, email, deploy, process payments, or change permissions.

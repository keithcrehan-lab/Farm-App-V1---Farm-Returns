import { Suspense } from "react";
import { SignInForm } from "./SignInForm";

// `SignInForm` reads `?next=` via useSearchParams, which opts the tree into
// client-side rendering up to the nearest Suspense boundary during
// prerendering — see next/dist/docs use-search-params.md.
export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

import { redirect } from "next/navigation";

/** Legacy route retained so old bookmarks never break. */
export default function SupportsRedirectPage() {
  redirect("/schemes");
}

import { redirect } from "next/navigation";
import { HOME_ROUTE } from "@/lib/home-route";

export default function RootPage() {
  redirect(HOME_ROUTE);
}

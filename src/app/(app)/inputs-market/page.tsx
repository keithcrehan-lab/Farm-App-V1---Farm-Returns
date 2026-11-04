import { INPUT_MARKET_CATEGORIES } from "@/domain/inputs-market";
import { InputsMarketClient } from "./InputsMarketClient";

export const metadata = { title: "Inputs · Farm Return" };

export default async function InputsMarketPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const initialCategory = INPUT_MARKET_CATEGORIES.find((definition) => definition.id === category)?.id;
  return <InputsMarketClient {...(initialCategory ? { initialCategory } : {})} />;
}
